#!/usr/bin/env node
/**
 * Build the offline content bundle consumed by the native (Capacitor) app.
 *
 * Usage:
 *   node scripts/build-offline-data.mjs            # build BSB + KJV + WEB
 *   node scripts/build-offline-data.mjs BSB        # build one translation
 *
 * The first translation is the default/primary: it sets manifest.defaultVersion
 * and supplies the canonical book/chapter structure for the roadmap.
 *
 * Output goes to public/offline/ which is GITIGNORED and only generated for
 * the mobile build; the web deployment serves content from data/ directly
 * and doesn't ship the offline bundle.
 *
 * The chapter text is regenerated from data/<ABBR>/<Book>.json using the SAME
 * block logic as scripts/seed-bible.mjs, so the offline reader shows exactly
 * what the live (Supabase-backed) reader shows. Each chapter = one chunk
 * (chunking was retired; see seed-bible.mjs).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DATA_DIR = path.join(root, "data");
const OUT_DIR = path.join(root, "public", "offline");

// ── Canon (mirrors src/lib/bible-book-order.ts) ──────────────────────
const OT_BOOK_ORDER = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
];
const NT_BOOK_ORDER = [
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];
const CANON = [...OT_BOOK_ORDER, ...NT_BOOK_ORDER];
const CANON_SET = new Set(CANON);
const OT_SET = new Set(OT_BOOK_ORDER);
const PROTESTANT_PSALMS_MAX_CHAPTER = 150;

// ── HTML helpers (mirror seed-bible.mjs) ─────────────────────────────
function splitIntoBlocks(html) {
  const blocks = [];
  const re = /<p[\s>][^]*?<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[0]);
  if (blocks.length === 0 && html.trim()) blocks.push(html.trim());
  return blocks;
}

function buildChunkText(html) {
  // One chunk per chapter: join the paragraph blocks exactly as seed-bible does.
  return splitIntoBlocks(html).join("\n");
}

// ── FS helpers ───────────────────────────────────────────────────────
function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj));
}
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

// ── Build one translation's text ─────────────────────────────────────
// Returns Map<bookName, { testament, chapters: number[] }>
function buildTranslationText(abbr) {
  const dir = path.join(DATA_DIR, abbr);
  if (!fs.existsSync(dir)) {
    throw new Error(`No data/${abbr}/ directory — run the bible fetch first.`);
  }
  const bookStructure = new Map();

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_manifest.json");

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const bookName = data.book;
    if (!CANON_SET.has(bookName)) continue; // skip apocrypha etc.

    const chaptersOut = {};
    const chapterNums = [];
    for (const ch of data.chapters || []) {
      const n = ch.chapter;
      if (bookName === "Psalms" && n > PROTESTANT_PSALMS_MAX_CHAPTER) continue;
      chaptersOut[n] = buildChunkText(ch.html || "");
      chapterNums.push(n);
    }
    chapterNums.sort((a, b) => a - b);

    writeJson(path.join(OUT_DIR, "text", abbr, `${bookName}.json`), chaptersOut);
    bookStructure.set(bookName, {
      testament: OT_SET.has(bookName) ? "OT" : "NT",
      chapters: chapterNums,
    });
  }
  return bookStructure;
}

// ── Main ─────────────────────────────────────────────────────────────
// Translations we show by licence rather than own (API.Bible). They are
// fetched a verse at a time on the web and must never be copied to a device:
// the publishers permit display, not redistribution. Kept as a literal list
// so this guard has no import dependency on the app's TypeScript.
const LICENSED_ONLY = ["ESV", "NIV", "NLT", "NASB", "CSB", "NKJV", "GNT", "CEV"];

function main() {
  const args = process.argv.slice(2).map((a) => a.toUpperCase());
  const translations = args.length
    ? args
    : ["BSB", "KJV", "WEB", "ASV", "GNV", "YLT", "DBY", "JPS"];

  const licensed = translations.filter((abbr) => LICENSED_ONLY.includes(abbr));
  if (licensed.length > 0) {
    throw new Error(
      `Refusing to bundle licensed translation(s): ${licensed.join(", ")}.\n` +
        "These are shown by permission on the web and fetched per verse; " +
        "bundling them into the app would be redistribution, which the " +
        "licence does not grant.",
    );
  }

  console.log(`Building offline bundle → public/offline/`);
  console.log(`Translations: ${translations.join(", ")}\n`);

  rmrf(OUT_DIR);
  ensureDir(OUT_DIR);

  // Text per translation. Use the first translation's structure as the
  // canonical book/chapter list for the roadmap.
  const structures = new Map();
  for (const abbr of translations) {
    console.log(`  text: ${abbr}`);
    structures.set(abbr, buildTranslationText(abbr));
  }

  // Copy the original-content data dirs verbatim (same filenames the server
  // code already expects, so the offline provider mirrors server logic).
  for (const sub of ["questions", "headings", "summaries", "crossrefs", "strongs", "lexicon", "places", "tyndale", "tyndale-dictionary", "people"]) {
    const ok = copyDir(path.join(DATA_DIR, sub), path.join(OUT_DIR, sub));
    console.log(`  copy: ${sub}${ok ? "" : " (missing, skipped)"}`);
  }

  // Build the manifest from the primary translation, in canon order.
  const primary = structures.get(translations[0]);
  const books = CANON.filter((name) => primary.has(name)).map((name) => {
    const info = primary.get(name);
    const slug = name.toLowerCase();
    const hasSummary = fs.existsSync(
      path.join(OUT_DIR, "summaries", slug, `${slug}-book-summary.json`),
    );
    return {
      name,
      testament: info.testament,
      hasSummary,
      chapters: info.chapters.map((n) => ({ n, chunks: 1 })),
    };
  });

  const translationManifest = translations.map((abbr) => {
    const manifestPath = path.join(DATA_DIR, abbr, "_manifest.json");
    const m = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      : { abbreviation: abbr, name: abbr };
    return { abbr: m.abbreviation || abbr, name: m.name || abbr };
  });

  writeJson(path.join(OUT_DIR, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    defaultVersion: translations[0],
    translations: translationManifest,
    books,
  });

  console.log(
    `\nDone. ${books.length} books, ${translations.length} translations.`,
  );
}

main();
