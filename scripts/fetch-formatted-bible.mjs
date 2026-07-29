#!/usr/bin/env node
/**
 * Download every chapter of a Bible translation from api.bible as formatted HTML.
 *
 * Usage:
 *   node scripts/fetch-formatted-bible.mjs WEB
 *   node scripts/fetch-formatted-bible.mjs KJV
 *   node scripts/fetch-formatted-bible.mjs --id 9879dbb7cfe39e4d-04 --abbr WEB
 *
 * Outputs one JSON file per book into data/<ABBR>/.
 * Each file: { book, bibleId, abbreviation, chapters: [{ chapter, chapterId, html }] }
 *
 * Requires API_BIBLE_KEY in .env.local.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ── Load .env.local ──────────────────────────────────────────────────
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const API_KEY = process.env.API_BIBLE_KEY;
if (!API_KEY) {
  console.error("Set API_BIBLE_KEY in .env.local");
  process.exit(1);
}

const BASE = "https://rest.api.bible/v1";
const DELAY_MS = 250;

// ── CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let targetAbbr = null;
let targetId = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--id" && args[i + 1]) {
    targetId = args[++i];
  } else if (args[i] === "--abbr" && args[i + 1]) {
    targetAbbr = args[++i];
  } else if (!args[i].startsWith("-")) {
    targetAbbr = args[i];
  }
}

if (!targetAbbr && !targetId && !args.includes("--list")) {
  console.error(
    "Usage:\n" +
      "  node scripts/fetch-formatted-bible.mjs WEB\n" +
      "  node scripts/fetch-formatted-bible.mjs KJV\n" +
      "  node scripts/fetch-formatted-bible.mjs --id <bibleId> --abbr <ABBR>\n" +
      "  node scripts/fetch-formatted-bible.mjs --list"
  );
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────
async function apiFetch(urlPath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE}${urlPath}`, {
      headers: { "api-key": API_KEY },
    });
    if (res.ok) return (await res.json()).data;
    const body = await res.text();
    if (res.status >= 500 && attempt < retries) {
      const wait = attempt * 5000;
      console.warn(`  Retry ${attempt}/${retries} after ${res.status} (waiting ${wait}ms)`);
      await sleep(wait);
      continue;
    }
    throw new Error(`API ${res.status} for ${urlPath}: ${body}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching list of available bibles...");
  const bibles = await apiFetch("/bibles");

  // --list mode
  if (args.includes("--list")) {
    const english = bibles.filter(
      (b) => (b.language?.id || "").startsWith("eng")
    );
    console.log("English bibles available on your plan:\n");
    for (const b of english) {
      console.log(
        `  ${(b.abbreviation || b.abbreviationLocal || "???").padEnd(10)} ${b.name}  (${b.id})`
      );
    }
    return;
  }

  // Find the bible
  let bible;
  if (targetId) {
    bible = bibles.find((b) => b.id === targetId);
    if (!bible) {
      console.error(`Bible ID "${targetId}" not found.`);
      process.exit(1);
    }
    if (!targetAbbr)
      targetAbbr = bible.abbreviation || bible.abbreviationLocal || "UNKNOWN";
  } else {
    const upper = targetAbbr.toUpperCase();
    bible = bibles.find(
      (b) =>
        (b.abbreviation || "").toUpperCase() === upper ||
        (b.abbreviationLocal || "").toUpperCase() === upper
    );
    if (!bible) {
      console.error(
        `"${targetAbbr}" not found. Run with --list to see available bibles.`
      );
      process.exit(1);
    }
  }

  const bibleId = bible.id;
  const abbr = targetAbbr.toUpperCase();
  console.log(`Using ${abbr}: ${bible.name} (${bibleId})`);

  // Fetch all books with chapter lists
  const books = await apiFetch(
    `/bibles/${bibleId}/books?include-chapters=true`
  );
  console.log(`Found ${books.length} books`);

  const outDir = path.join(root, "data", abbr);
  fs.mkdirSync(outDir, { recursive: true });

  // Save a manifest so the seed script knows the translation name
  fs.writeFileSync(
    path.join(outDir, "_manifest.json"),
    JSON.stringify(
      { abbreviation: abbr, name: bible.name, apiBibleId: bibleId },
      null,
      2
    )
  );

  for (const book of books) {
    const chapters = (book.chapters || []).filter(
      (c) => c.number !== "intro"
    );
    const bookFile = path.join(outDir, `${book.name}.json`);

    // Resume support: skip books already fully downloaded
    if (fs.existsSync(bookFile)) {
      const existing = JSON.parse(fs.readFileSync(bookFile, "utf8"));
      if (
        existing.chapters &&
        existing.chapters.length === chapters.length
      ) {
        console.log(`Skipping ${book.name} (already downloaded)`);
        continue;
      }
    }

    const chapterData = [];
    for (const ch of chapters) {
      const params = new URLSearchParams({
        "content-type": "html",
        "include-titles": "true",
        "include-verse-numbers": "true",
        "include-verse-spans": "true",
      });
      const data = await apiFetch(
        `/bibles/${bibleId}/chapters/${ch.id}?${params}`
      );
      chapterData.push({
        chapter: parseInt(ch.number, 10),
        chapterId: ch.id,
        html: data.content || "",
      });
      process.stdout.write(`  ${book.name} ch ${ch.number}\r`);
      await sleep(DELAY_MS);
    }

    fs.writeFileSync(
      bookFile,
      JSON.stringify(
        {
          book: book.name,
          bibleId,
          abbreviation: abbr,
          chapters: chapterData,
        },
        null,
        2
      )
    );
    console.log(`  ${book.name} – ${chapterData.length} chapters`);
  }

  console.log(`\nDone. Files saved to data/${abbr}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
