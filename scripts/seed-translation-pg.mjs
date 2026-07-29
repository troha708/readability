#!/usr/bin/env node
/**
 * Seed any converted translation from data/<ABBR>/ into Supabase via a direct
 * Postgres connection (DATABASE_URL from .env.local). Reads the output of
 * convert-usfm-translation.mjs (or convert-bsb-usfm.mjs) and writes
 * translations / books / chapters / chunks.
 *
 * Batched: one chapters upsert + one chunks delete + one chunks insert per
 * book (per-chapter round-trips are far too slow against a remote database).
 *
 * Idempotent: upserts the translation and each chapter (one chunk per chapter),
 * leaving other translations untouched.
 *
 * Usage: node scripts/seed-translation-pg.mjs --abbr ASV
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const abbrIdx = process.argv.indexOf("--abbr");
const ABBR = abbrIdx >= 0 ? process.argv[abbrIdx + 1] : undefined;
if (!ABBR) {
  console.error("Usage: node scripts/seed-translation-pg.mjs --abbr ASV");
  process.exit(1);
}
const DATA_DIR = path.join(root, "data", ABBR);

// Load DATABASE_URL from .env.local
const envPath = path.join(root, ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const OT_BOOKS = new Set([
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
  "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
  "Zechariah", "Malachi",
]);

const stripTags = (html) => html.replace(/<[^>]+>/g, "");

async function main() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "_manifest.json"), "utf8"),
  );

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // Translation
    const tr = await client.query(
      `insert into public.translations (abbreviation, name, api_bible_id)
       values ($1, $2, $3)
       on conflict (abbreviation) do update set name = excluded.name
       returning id`,
      [manifest.abbreviation, manifest.name, manifest.apiBibleId ?? null],
    );
    const translationId = tr.rows[0].id;
    console.log(`Translation ${manifest.abbreviation} → ${translationId}`);

    // Existing books by name
    const booksRes = await client.query("select id, name from public.books");
    const bookIdByName = new Map(booksRes.rows.map((b) => [b.name, b.id]));

    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json") && f !== "_manifest.json")
      .sort();

    let chapterCount = 0;
    for (const file of files) {
      const bookData = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, file), "utf8"),
      );
      const bookName = bookData.book;
      const chapters = bookData.chapters || [];
      if (chapters.length === 0) continue;

      let bookId = bookIdByName.get(bookName);
      if (!bookId) {
        const testament = OT_BOOKS.has(bookName) ? "OT" : "NT";
        const ins = await client.query(
          `insert into public.books (name, testament) values ($1, $2) returning id`,
          [bookName, testament],
        );
        bookId = ins.rows[0].id;
        bookIdByName.set(bookName, bookId);
        console.log(`  + created book ${bookName}`);
      }

      const nums = chapters.map((ch) => ch.chapter);
      const htmls = chapters.map((ch) => ch.html || "");
      const fullTexts = htmls.map(stripTags);

      const chRes = await client.query(
        `insert into public.chapters (book_id, translation_id, chapter_number, full_text)
         select $1::uuid, $2::uuid, x.n, x.t
         from unnest($3::int[], $4::text[]) as x(n, t)
         on conflict (book_id, translation_id, chapter_number)
         do update set full_text = excluded.full_text
         returning id, chapter_number`,
        [bookId, translationId, nums, fullTexts],
      );
      const idByChapter = new Map(
        chRes.rows.map((r) => [r.chapter_number, r.id]),
      );
      const chapterIds = nums.map((n) => idByChapter.get(n));

      await client.query(
        `delete from public.chunks where chapter_id = any($1::uuid[])`,
        [chapterIds],
      );
      await client.query(
        `insert into public.chunks (chapter_id, chunk_number, text)
         select x.id, 1, x.html
         from unnest($1::uuid[], $2::text[]) as x(id, html)`,
        [chapterIds, htmls],
      );
      chapterCount += chapters.length;
    }

    console.log(`Seed complete. ${files.length} books, ${chapterCount} chapters.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
