#!/usr/bin/env node
/**
 * Shoots the tiles for the landing page's "What's in it" montage, each a
 * capture of the real component in dark mode, in roughly the list's own order.
 *
 * The crops are baked in rather than done in CSS: the montage shows a tile at
 * 16:10, so shipping the whole 672px-tall verse sheet would send pixels that
 * are cropped away on arrival. Each tile takes the
 * component's full width and only as much height as 16:10 allows — `zoom`
 * above 1 would magnify further but crops the right edge, which cuts prose
 * mid-line, so it stays at 1. `top` skips the sliver of page caught above a
 * sheet's rounded top.
 *
 * Prefer a PRODUCTION server: `next dev` paints its indicator badge into the
 * bottom-left of the viewport, which lands inside the taller crops.
 *
 *   NEXT_DIST_DIR=.next-prod npm run build
 *   NEXT_DIST_DIR=.next-prod npx next start -p 3100
 *   FEATURES_ORIGIN=http://localhost:3100 node scripts/shoot-features.mjs
 *
 * Playwright is not a project dependency; run this wherever it is installed
 * and point FEATURES_ROOT back at the repo.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.FEATURES_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "public", "landing");
const ORIGIN = process.env.FEATURES_ORIGIN ?? "http://localhost:3000";
/**
 * FEATURES_ONLY=chapter-map re-shoots that tile alone. Replacing one picture is
 * not a licence to quietly replace the other five: they would come back with
 * whatever the components look like today, at whatever sizes that comes to, in
 * a change that was about something else.
 */
const ONLY = process.env.FEATURES_ONLY ?? null;
const reader = (b, c) => `${ORIGIN}/try/bible/read?book=${b}&chapter=${c}&version=BSB`;

// There is no shared tile aspect any more. Every tile used to be cut to one
// ratio, which meant the ratio decided where each component stopped — and a
// shape cannot know where a paragraph ends, so each stopped mid-sentence,
// mid-verse or mid-definition. Each tile now names the element it should
// finish on (see `stop` in tile()) and takes whatever height that comes to.

mkdirSync(DEST, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();
// A first visit opens the tutorial and dims the page; the map hint and the
// rails' auto-hide would each cover part of a shot too.
await page.addInitScript(() => {
  localStorage.setItem("theme", "dark");
  localStorage.setItem("hasSeenTutorial", "true");
  localStorage.setItem("hint-map-seen", "1");
  localStorage.setItem("readerAutoHideRails", "false");
});

const wait = (ms) => page.waitForTimeout(ms);
const go = async (url) => {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await wait(6000);
};
/** The sign-up nudge floats over the reader and would sit in three of the six. */
const dismissNudge = () =>
  page.evaluate(() => {
    const n = [...document.querySelectorAll("div")].find(
      (d) => /sync your reading progress/i.test(d.textContent || "") && d.querySelector("button"),
    );
    n?.querySelector("button")?.click();
  });

const clickByText = (re, scope = "button") =>
  page.evaluate(
    ([r, s]) => {
      const b = [...document.querySelectorAll(s)].find((x) =>
        new RegExp(r).test((x.textContent || "").trim()),
      );
      b?.click();
      return !!b;
    },
    [re.source, scope],
  );

/**
 * Capture one tile. `find` is a body evaluated in the page that returns the
 * element to frame — two of the six have no selector that reaches them (the
 * overview card is an unclassed div, the quiz page has no semantic root), so
 * they resolve through their own text instead.
 *
 * `stop` is a second body returning the element the crop should finish on, and
 * it is what keeps these pictures honest. Every tile used to be cut to one
 * fixed ratio, which meant the ratio decided where each component stopped —
 * mid-sentence in the dictionary, mid-verse in the search results, mid-field in
 * the book introduction. A shape cannot know where a paragraph ends. So each
 * tile now names the thing it wants to finish on and takes whatever height that
 * comes to, and the montage lays the results out as columns because they no
 * longer share a shape.
 *
 * Without `stop` the crop runs to the element's own foot. `pad` is the breathing
 * room left below the stopping element; `top` skips that fraction of the height
 * off the top.
 */
async function tile(name, find, { top = 0, stop = null, pad = 16, padX = 0 } = {}) {
  if (ONLY && name !== ONLY) return;
  // Pages differ by seconds in when they hydrate and paint — the dictionary
  // article and the quiz both arrive well after domcontentloaded — so wait on
  // the element itself rather than guessing a delay per page.
  await page
    .waitForFunction((body) => !!new Function(body)(), find, { timeout: 60_000 })
    .catch(() => {
      throw new Error(`${name}: element never appeared`);
    });
  const clip = await page.evaluate(
    ([body, stopBody, t, padPx, padSide]) => {
      const el = new Function(body)();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const y = Math.max(0, r.y + t * r.height);
      let bottom = r.bottom;
      if (stopBody) {
        const s = new Function(stopBody)();
        if (!s) return { missingStop: true };
        bottom = Math.min(s.getBoundingClientRect().bottom + padPx, r.bottom);
      }
      // padX widens the crop past the element on both sides, onto the page
      // behind it. Some components are boxes with their own inner padding and
      // some — the dictionary article — are bare text whose box stops at the
      // glyphs, so a crop on the element alone has words touching both edges
      // and reads as though it were cut off.
      const x = Math.max(0, r.x - padSide);
      const width = Math.min(r.width + padSide * 2, document.documentElement.clientWidth - x);
      return { x, y, width, height: bottom - y, own: r.bottom - y };
    },
    [find, stop, top, pad, padX],
  );
  if (!clip) throw new Error(`${name}: element not found`);
  if (clip.missingStop)
    throw new Error(`${name}: the element the crop should stop on is not there`);
  // A crop taller than what is left of the component would run off its bottom
  // and photograph the page behind — which is how an early cut of the search
  // tile ended up with half a chapter of John under the modal.
  if (clip.height > clip.own + 1)
    throw new Error(
      `${name}: crop wants ${Math.round(clip.height)}px but only ${Math.round(clip.own)}px of the component is left — it has not finished rendering`,
    );
  if (clip.height < 40) throw new Error(`${name}: crop came to ${Math.round(clip.height)}px`);
  delete clip.own;
  delete clip.missingStop;
  await page.screenshot({ path: join(DEST, `${name}.png`), clip });
  console.log(
    `${name}: ${Math.round(clip.width * 2)}x${Math.round(clip.height * 2)}  (${(clip.width / clip.height).toFixed(2)})`,
  );
}

/** The last element with no children whose text matches — a leaf label. */
const byText = (re) =>
  `return [...document.querySelectorAll("*")]
     .filter((e) => !e.children.length && ${re}.test((e.textContent || "").trim()))
     .pop();`;

const bySelector = (sel) => `return document.querySelector(${JSON.stringify(sel)});`;

/**
 * A tile that is the whole window rather than one component. The reading view
 * with both panels out has no single element to crop to — the panels are fixed
 * and full-height, the text column is not — and the shape of the three together
 * is the picture, so this one takes the viewport as it stands.
 */
async function windowTile(name) {
  if (ONLY && name !== ONLY) return;
  const { width, height } = page.viewportSize();
  await page.screenshot({ path: join(DEST, `${name}.png`) });
  console.log(`${name}: ${width * 2}x${height * 2}  (${(width / height).toFixed(2)})`);
}

// ── 1. The reading view: John 1 with both side panels out ──────────────
// Shot wider than the rest because the panels only exist from xl up, and at
// 1280 — the breakpoint itself — the two 216px rails leave the text column
// narrower than it ever is in use.
await page.setViewportSize({ width: 1440, height: 900 });
await go(reader("John", 1));
await dismissNudge();
await windowTile("reading-view");
await page.setViewportSize({ width: 1280, height: 1000 });

// ── 2. Verse tools: the sheet on John 1:1, Original words open, a word
//       tapped through to its Strong's entry ─────────────────────────────
// On 1:1 rather than 1:4 because the word tapped below has to be in the verse:
// 1:4 has neither Λόγος nor an English "Word", and the tap would miss.
await go(reader("John", 1));
await page.evaluate(() => {
  const v = document.querySelector('.vtext[data-hv="1"]');
  const r = v.getClientRects()[0];
  v.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX: r.x + 8, clientY: r.y + r.height / 2 }),
  );
});
// Strong's arrives on its own request and the Original words row does not
// exist until it lands, so wait on the row rather than on a clock.
await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll('[class*="sheet-rise"] button')].some((x) =>
        /^Original words/.test((x.textContent || "").trim()),
      ),
    null,
    { timeout: 60_000 },
  )
  .catch(() => {
    throw new Error("Original words never appeared — Strong's did not load");
  });
await clickByText(/^Original words/, '[class*="sheet-rise"] button');
await wait(2500);
await dismissNudge();
// Then tap a word, so the one tile carries the whole chain: the verse, its
// tools, the sections, and a word followed through to its entry. The two
// interlinear lines say nothing until a word is selected — unselected they are
// just Greek above English — so the tap has to be in the picture.
//
// "Word" is the noun this verse turns on and the one a reader is likeliest to
// want the Greek for. Falling back to any word would shoot a meaningless one
// silently, so a miss is an error instead.
const tapped = await page.evaluate(() => {
  const w = [...document.querySelectorAll('[class*="sheet-rise"] button')].find((b) =>
    /^(λόγος|Λόγος|Word)$/.test((b.textContent || "").trim()),
  );
  w?.click();
  return w ? w.textContent.trim() : null;
});
if (!tapped) throw new Error("verse tools: no 'Word' token to tap");
// The selection paints its partner amber in the other line; until that shows,
// the entry underneath has not rendered either.
await page
  .waitForFunction(
    () => !!document.querySelector('[class*="sheet-rise"] button[class*="bg-amber"]'),
    null,
    { timeout: 20_000 },
  )
  .catch(() => {
    throw new Error(`verse tools: tapped "${tapped}" but nothing was selected`);
  });
await wait(1200);
// Stops on the word's entry, whole. That panel is the end of the thought the
// tile is telling — verse, tools, words, meaning — so the picture ends where
// the meaning does rather than partway through the definition.
await tile("verse-tools", bySelector('[class*="sheet-rise"]'), {
  top: 0.02,
  // No handle of its own, and its classes are shared with the reader's note
  // box, so it is found by what only it holds: the Strong's number. That has
  // to be matched on the leaf span that renders it, not by searching ancestors
  // for /\\bG3056\\b/ — textContent runs the spans together with no spaces, so
  // the number arrives as "N-NMSG3056word" and the word boundary never hits.
  // From the span, the nearest div up is the entry; its foot is the end of the
  // definition.
  stop: `const n = [...document.querySelectorAll('[class*="sheet-rise"] *')]
           .filter((e) => !e.children.length && /^[GH]\\d{2,5}$/.test((e.textContent || "").trim()))
           .pop();
         return n && n.closest("div");`,
});
await page.keyboard.press("Escape");
await wait(800);

// ── 3. Book overview: the head of the John card ─────────────────────────
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button[aria-expanded]")].find((x) =>
    /Overview$/.test((x.textContent || "").trim()),
  );
  b?.click();
});
await wait(2000);
await dismissNudge();
// The card is the toggle's own parent — an unclassed div with no handle.
// Stops at the foot of the first paragraph of prose, one boundary past the
// four labelled fields. Stopping on the fields gave a 1.73 tile against the
// verse sheet's 1.20 beside it, which read as a stub; this comes to 1.12, so
// the two sit at about the same size. The card runs on for 4,900px, and the
// only boundaries below this are further paragraphs, each ~200px more.
await tile(
  "overview",
  `const b = [...document.querySelectorAll("button[aria-expanded]")]
     .find((x) => /Overview$/.test((x.textContent || "").trim()));
   return b && b.parentElement;`,
  {
    stop: `const b = [...document.querySelectorAll("button[aria-expanded]")]
             .find((x) => /Overview$/.test((x.textContent || "").trim()));
           const card = b && b.parentElement;
           return card && card.querySelector("p");`,
  },
);

// ── 4. Chapter map: the places named at Pentecost, Acts 2 ──────────────
// Acts 2 rather than a chapter that stays in Galilee: the list of nations in
// verses 9–11 reaches from Rome to Mesopotamia, so the map opens out to the
// whole world the book is about instead of one province of it.
await go(reader("Acts", 2));
await wait(2000);
await clickByText(/^Map/);
await wait(4000);
await dismissNudge();
await tile("chapter-map", bySelector('div[class*="rounded-t-2xl"]'));

// The dictionary article (Bethlehem) was the fifth tile until the montage was
// re-cut; the montage no longer shows it, so it is no longer shot. Its crop
// rules — stop on a whole paragraph, padX onto the page because the article is
// bare text with no panel of its own — are in git if it comes back.

// ── 5. Search: a live query, with the matches highlighted ───────────────
await go(reader("John", 1));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    /search/i.test(x.getAttribute("aria-label") || x.getAttribute("title") || ""),
  );
  b?.click();
});
await wait(1200);
await page.type('input[type="search"], input[placeholder]', "living water", { delay: 40 });
// The query is debounced and then searches every book, so the modal shows a
// spinner and its empty-state hint for a second or two first. Wait for real
// rows: shooting the hint would put the reader page under a half-height modal.
await page
  .waitForFunction(
    () => document.querySelectorAll('div[class*="max-w-lg"] ul li').length >= 3,
    null,
    { timeout: 60_000 },
  )
  .catch(() => {
    throw new Error("search returned no results");
  });
await wait(600);
// Stops at the foot of the second result, so the tile shows two whole verses
// rather than two and the top line of a third.
await tile("search", bySelector('div[class*="max-w-lg"][class*="rounded-xl"]'), {
  stop: `return document.querySelectorAll('div[class*="max-w-lg"] ul li')[1];`,
});

// ── 6. Comprehension: a question with its options ───────────────────────
await go(`${ORIGIN}/try/bible/questions/John/1`);
// No wrapper to grab: frame the option buttons and reach back up over the
// question and its type chip. Starts just above the chip rather than at the
// page top, which would take in a half-cut site header, and stops on the
// quiz's own footer row, below which is the site footer.
await tile(
  "quiz",
  `const opts = [...document.querySelectorAll("button")]
     .filter((b) => /^(The Word|The Law|The Light|The Spirit)$/.test((b.textContent || "").trim()));
   if (!opts.length) return null;
   const rects = opts.map((o) => o.getBoundingClientRect());
   const left = Math.min(...rects.map((r) => r.left)) - 18;
   const right = Math.max(...rects.map((r) => r.right)) + 18;
   const chip = [...document.querySelectorAll("*")]
     .filter((e) => !e.children.length && /^Multiple Choice$/i.test((e.textContent || "").trim()))
     .pop();
   const top = (chip ? chip.getBoundingClientRect().top : rects[0].top - 130) - 26;
   const bottom = document.body.getBoundingClientRect().bottom;
   // bottom as well as height: tile() reads r.bottom to know how much of the
   // component is left below the crop, and a plain object without it yields
   // NaN rather than a missing-property error.
   return {
     getBoundingClientRect: () => ({
       x: left, y: top, width: right - left, height: bottom - top, bottom,
     }),
   };`,
  {
    stop: `return [...document.querySelectorAll("*")]
             .filter((e) => !e.children.length && /Skip quiz/i.test(e.textContent || ""))
             .pop();`,
  },
);

await ctx.close();
await browser.close();
