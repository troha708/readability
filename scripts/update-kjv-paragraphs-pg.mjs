#!/usr/bin/env node
/**
 * One-off: push re-paragraphed KJV chapter HTML into the live DB.
 *
 * Reads a manifest [{ book, chapter, html }] and updates chunks.text (and
 * chapters.full_text) for the KJV translation only, for exactly those chapters.
 * Scoped and idempotent — leaves every other chapter and translation untouched.
 *
 * Usage: node scripts/update-kjv-paragraphs-pg.mjs <manifest.json>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Load DATABASE_URL from .env.local
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node scripts/update-kjv-paragraphs-pg.mjs <manifest.json>");
  process.exit(1);
}
const updates = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const stripTags = (html) => html.replace(/<[^>]+>/g, "");

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tr = await client.query(
      "select id from public.translations where abbreviation = 'KJV'",
    );
    if (!tr.rows.length) throw new Error("KJV translation not found");
    const translationId = tr.rows[0].id;

    const booksRes = await client.query("select id, name from public.books");
    const bookIdByName = new Map(booksRes.rows.map((b) => [b.name, b.id]));

    let ok = 0;
    const missing = [];
    for (const u of updates) {
      const bookId = bookIdByName.get(u.book);
      if (!bookId) { missing.push(`${u.book} (no book)`); continue; }

      const chRes = await client.query(
        `select id from public.chapters
         where book_id = $1 and translation_id = $2 and chapter_number = $3`,
        [bookId, translationId, u.chapter],
      );
      if (!chRes.rows.length) { missing.push(`${u.book} ${u.chapter}`); continue; }
      const chapterId = chRes.rows[0].id;

      await client.query(
        "update public.chapters set full_text = $1 where id = $2",
        [stripTags(u.html), chapterId],
      );
      // One chunk per chapter (see collapse-chunks). Update in place; if for some
      // reason multiple rows exist, keep chunk 1 authoritative.
      const upd = await client.query(
        "update public.chunks set text = $1 where chapter_id = $2 and chunk_number = 1",
        [u.html, chapterId],
      );
      if (upd.rowCount === 0) {
        await client.query(
          "insert into public.chunks (chapter_id, chunk_number, text) values ($1, 1, $2)",
          [chapterId, u.html],
        );
      }
      ok++;
    }
    console.log(`Updated ${ok}/${updates.length} KJV chapters.`);
    if (missing.length) console.log("Missing:", missing);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
