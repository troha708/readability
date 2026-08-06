#!/usr/bin/env node
/**
 * Records the hero's phone video: a silent screen capture of the reader at a
 * 390x844 phone viewport, scrolling John 1, tapping a verse, and reading the
 * study notes that open.
 *
 * Record against a PRODUCTION server, not `next dev` — the dev build paints a
 * Next.js indicator badge over the bottom-left corner, and it ends up baked
 * into the frames.
 *
 *   NEXT_DIST_DIR=.next-prod npm run build
 *   NEXT_DIST_DIR=.next-prod npx next start -p 3100
 *   node scripts/record-hero.mjs            # writes public/hero/reader.webm
 *
 * Playwright is not a project dependency; install it wherever you run this.
 * Output is VP8 WebM, which is what Playwright can produce without ffmpeg.
 */
import { chromium } from "playwright";
import { readdirSync, copyFileSync, mkdirSync, statSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Playwright is not a project dependency, so this usually runs from wherever
// it is installed; HERO_ROOT then points back at the repo.
const ROOT = process.env.HERO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = join(ROOT, ".hero-recording");
const DEST_DIR = join(ROOT, "public", "hero");
const ORIGIN = process.env.HERO_ORIGIN ?? "http://localhost:3100";
const W = 390;
const H = 844;

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(DEST_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  colorScheme: "dark",
  hasTouch: true,
  recordVideo: { dir: TMP, size: { width: W, height: H } },
});

// Nothing that dims, interrupts, or teaches: this is meant to read as someone
// already using the app, not a first run.
await ctx.addInitScript(() => {
  localStorage.setItem("theme", "dark");
  localStorage.setItem("hint-map-seen", "true");
  localStorage.setItem("readerTutorialSeen", "true");
  localStorage.setItem("signupNudgeSeen", "true");
});

const page = await ctx.newPage();
await page.goto(`${ORIGIN}/try/bible/read?book=John&chapter=1&version=BSB`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForTimeout(1800);

/** Scroll the way a thumb does: many small steps, not one jump. */
async function glide(px, steps = 20, pause = 32) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await page.waitForTimeout(pause);
  }
}

await glide(420);
await page.waitForTimeout(800);

// Tap a verse. Click the paragraph's own centre via the locator so Playwright
// waits for it to be stable first — a raw coordinate click can land in the gap
// between lines, or fire while a smooth scroll is still settling, and then no
// sheet opens at all.
const verse = page.locator("article p").filter({ hasText: /light of men|In Him was life/ }).first();
await verse.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await verse.click({ position: { x: 60, y: 10 } });

// Assert each beat rather than pressing on. A missed tap or a selector that
// matches nothing still produces a perfectly clean video of the wrong thing,
// which is exactly the failure worth catching here. The study-notes control
// exists only inside the sheet, so waiting on it proves the tap landed.
const section = page.getByRole("button", { name: /study notes/i }).first();
await section.waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(1400);

// Open the study notes and read down them.
await section.click();
await page.waitForTimeout(400);
const expanded = page.locator("section, div").filter({ hasText: /Echoing Genesis|logos/ }).last();
await expanded.waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(1200);

const sheetScroll = page.locator(".overflow-y-auto").last();
for (let i = 0; i < 16; i++) {
  await sheetScroll.evaluate((el) => el.scrollBy(0, 24)).catch(() => {});
  await page.waitForTimeout(65);
}
await page.waitForTimeout(1400);

// Close and settle, so the loop point rejoins the reading view cleanly.
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
await glide(200, 10, 34);
await page.waitForTimeout(900);

await ctx.close();
await browser.close();

const file = readdirSync(TMP).find((f) => f.endsWith(".webm"));
if (!file) throw new Error("playwright wrote no video");
const dest = join(DEST_DIR, "reader.webm");
copyFileSync(join(TMP, file), dest);
rmSync(TMP, { recursive: true, force: true });
console.log(`wrote ${dest} — ${(statSync(dest).size / 1024).toFixed(0)}KB`);
