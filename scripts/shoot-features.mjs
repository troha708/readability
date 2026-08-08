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
const reader = (b, c) => `${ORIGIN}/try/bible/read?book=${b}&chapter=${c}&version=BSB`;

// The tile's aspect in the montage. The crop height follows from it, so the
// component and the frame can never disagree about the shape.
const TILE_ASPECT = 16 / 10;

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
 * zoom > 1 crops the right edge; top skips that fraction of the tile height.
 */
async function tile(name, find, { zoom = 1, top = 0 } = {}) {
  // Pages differ by seconds in when they hydrate and paint — the dictionary
  // article and the quiz both arrive well after domcontentloaded — so wait on
  // the element itself rather than guessing a delay per page.
  await page
    .waitForFunction((body) => !!new Function(body)(), find, { timeout: 60_000 })
    .catch(() => {
      throw new Error(`${name}: element never appeared`);
    });
  const clip = await page.evaluate(
    ([body, z, t, aspect]) => {
      const el = new Function(body)();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const width = r.width / z;
      const height = width / aspect;
      return { x: r.x, y: Math.max(0, r.y + t * height), width, height, own: r.height };
    },
    [find, zoom, top, TILE_ASPECT],
  );
  if (!clip) throw new Error(`${name}: element not found`);
  // A component shorter than its own crop means the shot would run off the
  // bottom of it and photograph the page behind — which is how an early cut
  // of the search tile ended up with half a chapter of John under the modal.
  const needed = clip.height * (1 + top);
  if (clip.own < needed)
    throw new Error(
      `${name}: ${Math.round(clip.own)}px tall, crop needs ${Math.round(needed)}px — it has not finished rendering`,
    );
  delete clip.own;
  await page.screenshot({ path: join(DEST, `${name}.png`), clip });
  console.log(`${name}: ${Math.round(clip.width * 2)}x${Math.round(clip.height * 2)}`);
}

const bySelector = (sel) => `return document.querySelector(${JSON.stringify(sel)});`;

// ── 1. Verse tools: the sheet on John 1:4, Original words open ──────────
await go(reader("John", 1));
await page.evaluate(() => {
  const v = document.querySelector('.vtext[data-hv="4"]');
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
await tile("verse-tools", bySelector('[class*="sheet-rise"]'), { top: 0.02 });
await page.keyboard.press("Escape");
await wait(800);

// ── 1b. Word study: a word tapped, its partner lit, its entry open ──────
// The one feature that has to be caught mid-interaction. The two lines mean
// nothing until a word is selected: the picture has to show the tap, or it is
// just Greek above English.
await go(reader("John", 1));
await page.evaluate(() => {
  const v = document.querySelector('.vtext[data-hv="1"]');
  const r = v.getClientRects()[0];
  v.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX: r.x + 8, clientY: r.y + r.height / 2 }),
  );
});
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
// The sheet remembers which sections a reader has opened, and the verse-tools
// shot above left this one open — so clicking the header here would CLOSE it,
// and the tap below would find nothing to tap. Open it only if it is shut.
// The header carries no aria-expanded; its chevron flips instead, which is the
// component's own record of the state.
const wordsSectionOpen = () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('[class*="sheet-rise"] button')].find((x) =>
      /^Original words/.test((x.textContent || "").trim()),
    );
    return !!b?.querySelector('svg[class*="rotate-180"]');
  });
if (!(await wordsSectionOpen())) {
  await clickByText(/^Original words/, '[class*="sheet-rise"] button');
}
await wait(2500);
// "Word" — the noun the whole verse turns on, and the one a reader is most
// likely to want the Greek for. Falling back to any word would shoot a
// meaningless one silently, so a miss is an error instead.
const tapped = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[class*="sheet-rise"] button')];
  const w = btns.find((b) => /^(λόγος|Λόγος|Word)$/.test((b.textContent || "").trim()));
  w?.click();
  return w ? w.textContent.trim() : null;
});
if (!tapped) throw new Error("word study: no 'Word' token to tap");
// The selection paints its partner amber in the other line; until that shows,
// the entry underneath has not rendered either.
await page
  .waitForFunction(
    () => !!document.querySelector('[class*="sheet-rise"] button[class*="bg-amber"]'),
    null,
    { timeout: 20_000 },
  )
  .catch(() => {
    throw new Error(`word study: tapped "${tapped}" but nothing was selected`);
  });
await wait(1200);
await dismissNudge();
// Cropped from lower down than its neighbour. The entry the tap opens is the
// whole point of this tile and it sits at the bottom of the sheet, below a
// 16:10 window taken from the top — and the sheet does not scroll, so there is
// nothing to pull up. Starting further down spends the verse's own reference,
// which the tile can afford: what it has to show is a word, its partner, and
// what the word means.
await tile("word-study", bySelector('[class*="sheet-rise"]'), { top: 0.14 });
await page.keyboard.press("Escape");
await wait(800);
await go(reader("John", 1));

// ── 2. Book overview: the head of the John card ─────────────────────────
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button[aria-expanded]")].find((x) =>
    /Overview$/.test((x.textContent || "").trim()),
  );
  b?.click();
});
await wait(2000);
await dismissNudge();
// The card is the toggle's own parent — an unclassed div with no handle.
await tile(
  "overview",
  `const b = [...document.querySelectorAll("button[aria-expanded]")]
     .find((x) => /Overview$/.test((x.textContent || "").trim()));
   return b && b.parentElement;`,
);

// ── 3. Chapter map: the four places in John 2 ───────────────────────────
await go(reader("John", 2));
await wait(2000);
await clickByText(/^Map/);
await wait(4000);
await dismissNudge();
await tile("chapter-map", bySelector('div[class*="rounded-t-2xl"]'));

// ── 4. Dictionary: the head of the Bethlehem article ────────────────────
await go(`${ORIGIN}/try/bible/dictionary?entry=Bethlehem`);
await tile("dictionary", bySelector("article"));

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
await tile("search", bySelector('div[class*="max-w-lg"][class*="rounded-xl"]'));

// ── 6. Comprehension: a question with its options ───────────────────────
await go(`${ORIGIN}/try/bible/questions/John/1`);
// No wrapper to grab: frame the option buttons and reach back up over the
// question and its type chip.
await tile(
  "quiz",
  `const opts = [...document.querySelectorAll("button")]
     .filter((b) => /^(The Word|The Law|The Light|The Spirit)$/.test((b.textContent || "").trim()));
   if (!opts.length) return null;
   const rects = opts.map((o) => o.getBoundingClientRect());
   const left = Math.min(...rects.map((r) => r.left)) - 18;
   const right = Math.max(...rects.map((r) => r.right)) + 18;
   const top = rects[0].top - 130;
   // The four options come to less than 16:10, so the crop runs a little past
   // the last one onto the quiz's own footer row — real page, not a gap.
   const bottom = document.body.getBoundingClientRect().bottom;
   return {
     getBoundingClientRect: () => ({
       x: left, y: top, width: right - left, height: bottom - top,
     }),
   };`,
);

await ctx.close();
await browser.close();
