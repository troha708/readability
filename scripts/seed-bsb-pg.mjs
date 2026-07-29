#!/usr/bin/env node
/**
 * Seed the BSB translation into Supabase via a direct Postgres connection
 * (DATABASE_URL). Used because SUPABASE_SERVICE_ROLE_KEY isn't set locally and
 * the anon key can't write through RLS. Reads data/BSB/ (produced by
 * convert-bsb-usfm.mjs) and writes translations / books / chapters / chunks.
 *
 * Idempotent: upserts the translation and each chapter (one chunk per chapter),
 * leaving other translations untouched.
 *
 * Usage: node scripts/seed-bsb-pg.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DATA_DIR = path.join(root, "data", "BSB");

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

      for (const ch of bookData.chapters || []) {
        const html = ch.html || "";
        const fullText = stripTags(html);

        const chRes = await client.query(
          `insert into public.chapters (book_id, translation_id, chapter_number, full_text)
           values ($1, $2, $3, $4)
           on conflict (book_id, translation_id, chapter_number)
           do update set full_text = excluded.full_text
           returning id`,
          [bookId, translationId, ch.chapter, fullText],
        );
        const chapterId = chRes.rows[0].id;

        await client.query("delete from public.chunks where chapter_id = $1", [
          chapterId,
        ]);
        await client.query(
          `insert into public.chunks (chapter_id, chunk_number, text)
           values ($1, 1, $2)`,
          [chapterId, html],
        );
        chapterCount++;
      }
      console.log(`  ${bookName}: ${(bookData.chapters || []).length} chapters`);
    }

    console.log(`\nSeed complete. ${files.length} books, ${chapterCount} chapters.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
