#!/usr/bin/env node
/**
 * Seed Supabase with formatted Bible data: translations, books, chapters, chunks.
 *
 * Usage:
 *   node scripts/seed-bible.mjs WEB          # seed one translation
 *   node scripts/seed-bible.mjs WEB KJV      # seed multiple
 *   node scripts/seed-bible.mjs --all        # seed all downloaded translations
 *
 * Reads data/<ABBR>/ directories (HTML from api.bible) and builds ~1500-word
 * chunks that respect paragraph and section-heading boundaries.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

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

const TARGET_WORDS = 1500;
const DATA_DIR = path.join(root, "data");

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)"
  );
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ── CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let translationsToSeed = args.filter((a) => !a.startsWith("-")).map((a) => a.toUpperCase());

if (args.includes("--all") || translationsToSeed.length === 0) {
  // Find all data/<DIR>/_manifest.json
  translationsToSeed = fs
    .readdirSync(DATA_DIR)
    .filter((d) =>
      fs.existsSync(path.join(DATA_DIR, d, "_manifest.json"))
    )
    .map((d) => d.toUpperCase());
}

if (translationsToSeed.length === 0) {
  console.error(
    'No translations found. Run "npm run bible:fetch WEB" first.'
  );
  process.exit(1);
}

// ── HTML helpers ─────────────────────────────────────────────────────

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function wordCount(html) {
  return stripTags(html).trim().split(/\s+/).filter(Boolean).length;
}

function splitIntoBlocks(html) {
  const blocks = [];
  const re = /<p[\s>][^]*?<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[0]);
  }
  if (blocks.length === 0 && html.trim()) {
    blocks.push(html.trim());
  }
  return blocks;
}

function isHeading(block) {
  return /^<p\s[^>]*class="s[^"]*"/.test(block);
}

// ── Chunk builder ────────────────────────────────────────────────────

function buildChunks(blocks) {
  if (blocks.length === 0) return [];

  // Chunking retired: each chapter is a single unit. Splitting chapters into
  // ~1500-word chunks caused section headings to bleed across chunk
  // boundaries (out-of-range headings piled onto the next chunk's first
  // paragraph), so the whole chapter is now stored as one chunk.
  return [blocks.join("\n")];
}

// ── Main ─────────────────────────────────────────────────────────────

const OT_BOOKS = new Set([
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song Of Solomon", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
]);

async function ensureBooks(bookNamesFromFiles) {
  const bookIdByName = new Map();
  for (let i = 0; i < bookNamesFromFiles.length; i++) {
    const name = bookNamesFromFiles[i];
    const testament = OT_BOOKS.has(name) ? "OT" : "NT";
    const { data: book, error } = await supabase
      .from("books")
      .insert({ name, testament })
      .select("id")
      .single();
    if (error) {
      const existing = await supabase
        .from("books")
        .select("id")
        .eq("name", name)
        .single();
      if (existing.data) bookIdByName.set(name, existing.data.id);
      else throw error;
    } else {
      bookIdByName.set(name, book.id);
    }
  }
  return bookIdByName;
}

async function ensureTranslation(manifest) {
  const { abbreviation, name, apiBibleId } = manifest;
  const { data, error } = await supabase
    .from("translations")
    .insert({
      abbreviation,
      name,
      api_bible_id: apiBibleId || null,
    })
    .select("id")
    .single();
  if (error) {
    const existing = await supabase
      .from("translations")
      .select("id")
      .eq("abbreviation", abbreviation)
      .single();
    if (existing.data) return existing.data.id;
    throw error;
  }
  return data.id;
}

async function seedTranslation(abbr) {
  const dir = path.join(DATA_DIR, abbr);
  const manifestPath = path.join(dir, "_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`No _manifest.json in data/${abbr}/`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`\nSeeding ${manifest.abbreviation}: ${manifest.name}`);

  const translationId = await ensureTranslation(manifest);

  // Collect all book JSON files
  const bookFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_manifest.json")
    .sort();

  // Gather book names in file order
  const bookNames = bookFiles.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    return data.book;
  });

  const bookIdByName = await ensureBooks(bookNames);

  for (const file of bookFiles) {
    const bookData = JSON.parse(
      fs.readFileSync(path.join(dir, file), "utf8")
    );
    const bookName = bookData.book;
    const bookId = bookIdByName.get(bookName);
    if (!bookId) {
      console.warn(`  Skip (no book row): ${bookName}`);
      continue;
    }

    for (const ch of bookData.chapters || []) {
      const chapterNum = ch.chapter;
      const html = ch.html || "";
      const fullText = stripTags(html);
      const blocks = splitIntoBlocks(html);
      const chunkHtmls = buildChunks(blocks);

      // Upsert chapter
      let chapterId;
      const { data: chapterRow, error: chErr } = await supabase
        .from("chapters")
        .insert({
          book_id: bookId,
          translation_id: translationId,
          chapter_number: chapterNum,
          full_text: fullText,
        })
        .select("id")
        .single();

      if (chErr) {
        const existing = await supabase
          .from("chapters")
          .select("id")
          .eq("book_id", bookId)
          .eq("translation_id", translationId)
          .eq("chapter_number", chapterNum)
          .single();
        if (!existing.data) throw chErr;
        chapterId = existing.data.id;

        await supabase
          .from("chunks")
          .delete()
          .eq("chapter_id", chapterId);
      } else {
        chapterId = chapterRow.id;
      }

      for (let i = 0; i < chunkHtmls.length; i++) {
        await supabase.from("chunks").upsert(
          {
            chapter_id: chapterId,
            chunk_number: i + 1,
            text: chunkHtmls[i],
          },
          { onConflict: "chapter_id,chunk_number" }
        );
      }
    }
    console.log(`  ${bookName}: ${(bookData.chapters || []).length} chapters`);
  }
}

async function main() {
  for (const abbr of translationsToSeed) {
    await seedTranslation(abbr);
  }
  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
