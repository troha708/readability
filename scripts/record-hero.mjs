#!/usr/bin/env node
/**
 * Renders the hero's phone video: the reader at a 390x844 phone viewport,
 * scrolling John 1, tapping a verse, and reading the study notes that open.
 *
 * This does NOT screen-record. Playwright's recorder emits only ~12-15 unique
 * frames a second while a page this heavy is moving and pads the rest by
 * repeating them, which is what made earlier cuts look laggy — measured, and
 * no better headed on the GPU, so the recorder is the limit rather than the
 * renderer. Instead each frame is posed and screenshotted individually, then
 * the frames are encoded to WebM in a browser via canvas.captureStream() +
 * MediaRecorder. Every frame is a complete paint, so nothing repeats.
 *
 * Record against a PRODUCTION server, not `next dev` — the dev build paints a
 * Next.js indicator badge into the bottom-left of every frame.
 *
 *   NEXT_DIST_DIR=.next-prod npm run build
 *   NEXT_DIST_DIR=.next-prod npx next start -p 3100
 *   node scripts/record-hero.mjs          # writes public/hero/reader.webm
 *
 * Playwright is not a project dependency; run this wherever it is installed
 * and point HERO_ROOT back at the repo.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.HERO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = join(ROOT, ".hero-recording");
const DEST = join(ROOT, "public", "hero", "reader.webm");
const POSTER = join(ROOT, "public", "hero", "reader-poster.jpg");
const ORIGIN = process.env.HERO_ORIGIN ?? "http://localhost:3100";
const READER_URL = `${ORIGIN}/try/bible/read?book=John&chapter=1&version=BSB`;
const W = 390;
const H = 844;
// 30, not 60: MediaRecorder timestamps by wall clock, and the encode loop
// cannot reliably draw + emit 60 frames a second, so a 60fps pose list came
// out as a 27s video of 13.7s of motion — correct frames, half speed. 30fps
// it can hold, and every frame is still a distinct paint.
const FPS = 30;
const BITRATE = 1_200_000;

// Sine easing rather than cubic: cubic's mid-scroll velocity is high enough to
// read as a lurch over a long pan, even with every frame present.
const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const frames = (seconds) => Math.max(1, Math.round(seconds * FPS));

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(dirname(DEST), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  colorScheme: "dark",
  hasTouch: true,
});
// Nothing that dims, interrupts or teaches: this should read as someone
// already using the app, not a first run.
await ctx.addInitScript(() => {
  localStorage.setItem("theme", "dark");
  localStorage.setItem("hint-map-seen", "true");
  localStorage.setItem("readerTutorialSeen", "true");
  localStorage.setItem("signupNudgeSeen", "true");
});

const page = await ctx.newPage();
await page.goto(READER_URL, { waitUntil: "networkidle", timeout: 120000 });
await page.locator("article p").first().waitFor({ state: "visible", timeout: 60000 });

// Every frame is posed by hand, so the page's own transitions must not also be
// animating between screenshots — they would land half-finished and at the
// mercy of how long each screenshot took.
await page.addStyleTag({
  content: `*, *::before, *::after { transition: none !important; animation: none !important; }
            html { scroll-behavior: auto !important; }`,
});
await page.waitForTimeout(500);

const shots = [];
async function shoot() {
  shots.push(await page.screenshot({ type: "jpeg", quality: 92 }));
}

/** Pose the page at a scroll offset, one frame per step. */
async function scrollTo(from, to, seconds) {
  const n = frames(seconds);
  for (let i = 0; i < n; i++) {
    const y = from + (to - from) * easeInOut(i / (n - 1 || 1));
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await shoot();
  }
}
async function hold(seconds) {
  const n = frames(seconds);
  for (let i = 0; i < n; i++) await shoot();
}

// ── 1. Read down the chapter ────────────────────────────────────
// Open on the scripture, not the Book Overview card that sits above it: at
// scrollY 0 the card fills the screen, and starting there meant the clip
// opened on the overview and appeared to jump into the chapter.
const TARGET_VERSE = 12;
const startY = await page.evaluate(() => {
  const article = document.querySelector("article");
  const header = document.querySelector("header");
  const headerH = header ? header.getBoundingClientRect().height : 0;
  return Math.round(window.scrollY + article.getBoundingClientRect().top - headerH - 6);
});
await page.evaluate((y) => window.scrollTo(0, y), startY);
await page.waitForTimeout(250);

// End the pan with the verse we're about to tap already comfortably on screen.
// Letting Playwright's click scroll it into view instead put an uncaptured
// jump between two frames — that was the lurch back and forth.
const endY = await page.evaluate((v) => {
  const el = document.querySelector(`article .vtext[data-hv="${v}"]`);
  const r = el.getBoundingClientRect();
  return Math.round(window.scrollY + r.top - window.innerHeight * 0.4);
}, TARGET_VERSE);

await hold(0.6);
await scrollTo(startY, endY, 4.2);
await hold(0.5);

// ── 2. Tap the verse; drive the sheet up by hand ────────────────
const verse = page.locator(`article .vtext[data-hv="${TARGET_VERSE}"]`).first();
await verse.click();

const section = page.getByRole("button", { name: /study notes/i }).first();
await section.waitFor({ state: "visible", timeout: 10000 });
// Prove we opened the verse we meant to, not whichever one happened to be
// under the cursor.
const opened = await page.locator(".fixed.inset-0.z-50").getByText(/John 1:\d+/).first().innerText();
if (!opened.includes(`1:${TARGET_VERSE}`)) {
  throw new Error(`tapped the wrong verse: sheet says "${opened.trim()}"`);
}

const SHEET = ".fixed.inset-0.z-50";
/** Slide the sheet panel and fade its backdrop: 0 = offscreen, 1 = seated. */
async function poseSheet(p) {
  await page.evaluate(
    ({ sel, p }) => {
      const root = document.querySelector(sel);
      if (!root) return;
      const [backdrop, panel] = root.children;
      panel.style.transform = `translateY(${(1 - p) * 100}%)`;
      backdrop.style.opacity = String(p);
    },
    { sel: SHEET, p },
  );
}

const rise = frames(0.42);
for (let i = 0; i < rise; i++) {
  await poseSheet(easeInOut(i / (rise - 1)));
  await shoot();
}
await poseSheet(1);
// A full beat with the sheet seated before anything else happens — the verse
// and its tools want reading before the notes open on top of them.
await hold(1.0);

// ── 3. Open the study notes and read down them ──────────────────
const SCROLLER = ".fixed.inset-0.z-50 .overflow-y-auto";
await section.click();
// Confirm it actually expanded without pinning to any one verse's wording —
// the notes differ per verse, and matching on their text broke the moment the
// clip moved from verse 1 to verse 12. Overflowing content is the real signal.
await page.waitForFunction(
  (sel) => {
    const el = document.querySelector(sel);
    return !!el && el.scrollHeight > el.clientHeight + 20;
  },
  SCROLLER,
  { timeout: 10000 },
);
await hold(0.45);
const reach = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? el.scrollHeight - el.clientHeight : 0;
}, SCROLLER);
const travel = Math.min(reach, 300);
const readFrames = frames(2.9);
for (let i = 0; i < readFrames; i++) {
  const y = travel * easeInOut(i / (readFrames - 1 || 1));
  await page.evaluate(({ sel, y }) => {
    const el = document.querySelector(sel);
    if (el) el.scrollTop = y;
  }, { sel: SCROLLER, y });
  await shoot();
}
await hold(0.6);

// ── 4. Dismiss, and carry on reading ────────────────────────────
const fall = frames(0.36);
for (let i = 0; i < fall; i++) {
  await poseSheet(1 - easeInOut(i / (fall - 1)));
  await shoot();
}
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
// Carry on down the chapter rather than back up, so the loop never appears to
// rewind past where it started.
await scrollTo(endY, endY + 340, 2.2);
await hold(0.5);

await ctx.close();
console.log(`posed ${shots.length} frames (${(shots.length / FPS).toFixed(1)}s at ${FPS}fps)`);

// Frame 0 doubles as the poster, for reduced-motion and for autoplay refusals.
writeFileSync(POSTER, shots[0]);

// ── Encode ──────────────────────────────────────────────────────
// Serve the frames so the encoding page can load them same-origin; a canvas
// fed from file:// or another origin is tainted and cannot be captured.
const server = createServer((req, res) => {
  const m = /^\/f\/(\d+)\.jpg$/.exec(req.url ?? "");
  if (m) {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(shots[Number(m[1])]);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><meta charset=utf-8><title>encode</title>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const encoder = await browser.newPage();
await encoder.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });

const dataUrl = await encoder.evaluate(
  async ({ count, width, height, fps, bitrate }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");

    // captureStream(0) hands frame timing to us: one requestFrame per drawn
    // image, so the encoder sees exactly the frames we posed and no repeats.
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
      (t) => MediaRecorder.isTypeSupported(t),
    );
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));

    const load = (i) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = `/f/${i}.jpg`;
      });

    // Load and decode EVERY frame before the recorder starts. MediaRecorder
    // timestamps by wall clock, so any work inside the loop stretches the clip:
    // fetching frames as it went made a 13.8s pose list encode as 18.5s. With
    // the images already decoded the loop only draws, which it can hold.
    const imgs = await Promise.all(Array.from({ length: count }, (_, i) => load(i)));
    await Promise.all(imgs.map((im) => im.decode?.().catch(() => {})));

    rec.start();
    const step = 1000 / fps;
    const t0 = performance.now();
    for (let i = 0; i < count; i++) {
      g.drawImage(imgs[i], 0, 0, width, height);
      track.requestFrame();
      // Pace against the loop's own start, so a slow frame doesn't push every
      // later one late.
      const wait = t0 + (i + 1) * step - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    // Let the last frame land before closing the muxer.
    await new Promise((r) => setTimeout(r, 250));
    rec.stop();
    await done;

    const blob = new Blob(chunks, { type: mime });

    // Read the encoded duration back out, so the caller can check the clip
    // plays at the speed it was posed at.
    const probe = document.createElement("video");
    probe.src = URL.createObjectURL(blob);
    const duration = await new Promise((res) => {
      probe.onloadedmetadata = () => {
        // A MediaRecorder blob can report Infinity until it is seeked.
        if (probe.duration === Infinity) {
          probe.currentTime = 1e6;
          probe.ontimeupdate = () => {
            probe.ontimeupdate = null;
            res(probe.duration);
          };
        } else res(probe.duration);
      };
    });

    const buf = await blob.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { mime, b64: btoa(bin), duration };
  },
  { count: shots.length, width: W, height: H, fps: FPS, bitrate: BITRATE },
);

await browser.close();
server.close();

writeFileSync(DEST, Buffer.from(dataUrl.b64, "base64"));
rmSync(TMP, { recursive: true, force: true });

// MediaRecorder timestamps by wall clock, so if the encode loop fell behind the
// target rate the clip silently plays slow — 824 frames meant for 60fps once
// came out as 27 seconds of half-speed motion. Check the duration matches the
// frames we posed.
const expected = shots.length / FPS;
if (Math.abs(dataUrl.duration - expected) > 0.6) {
  throw new Error(
    `encoded ${dataUrl.duration.toFixed(1)}s but posed ${expected.toFixed(1)}s ` +
      `(${shots.length} frames at ${FPS}fps) — the encode loop could not hold the rate`,
  );
}
console.log(
  `wrote ${DEST} — ${(statSync(DEST).size / 1024).toFixed(0)}KB, ${dataUrl.mime}`,
);
console.log(`wrote ${POSTER} — ${(statSync(POSTER).size / 1024).toFixed(0)}KB`);
