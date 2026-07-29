#!/usr/bin/env node
/**
 * One-off data fix for Song of Solomon.
 *
 * Two book rows existed because the deprecated LEGACY (api.bible) seed used
 * "Song Of Solomon" while the BSB/KJV/WEB seeds used "Song of Solomon":
 *   - "Song of Solomon" (lowercase) — real row, holds BSB/KJV/WEB chapters,
 *     but was mis-tagged testament = NT.
 *   - "Song Of Solomon" (capital)   — vestigial, holds only LEGACY chapters.
 *
 * The roadmap's canon list used the capital spelling, so it rendered the
 * vestigial (chapter-less, for BSB) row greyed out and filtered the real one.
 * The app now uses "Song of Solomon" everywhere; this script reconciles the DB:
 *
 *   1. (always) set the real row's testament to OT.
 *   2. (only with --delete-legacy) delete the vestigial LEGACY-only row and its
 *      chapters/chunks, which otherwise lingers as a 404ing duplicate in the
 *      reader's book picker.
 *
 * Idempotent. Writes via a direct Postgres connection (DATABASE_URL) because the
 * service-role key isn't set locally and the anon key can't write through RLS.
 *
 * Usage: node scripts/fix-song-of-solomon.mjs [--delete-legacy]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const deleteLegacy = process.argv.includes("--delete-legacy");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  // 1. Correct the real row's testament.
  const upd = await client.query(
    `update public.books set testament = 'OT'
      where name = 'Song of Solomon' and testament <> 'OT'
      returning id`,
  );
  console.log(
    upd.rowCount > 0
      ? `Set "Song of Solomon" testament -> OT (${upd.rows[0].id}).`
      : `"Song of Solomon" testament already OT (no change).`,
  );

  // 2. The vestigial LEGACY-only capital row.
  const { rows: legacy } = await client.query(
    `select id from public.books where name = 'Song Of Solomon'`,
  );
  if (legacy.length === 0) {
    console.log(`No "Song Of Solomon" (capital) row — nothing to clean up.`);
  } else if (!deleteLegacy) {
    console.log(
      `Vestigial "Song Of Solomon" row ${legacy[0].id} present. ` +
        `Re-run with --delete-legacy to remove it and its LEGACY chapters/chunks.`,
    );
  } else {
    const id = legacy[0].id;
    const ch = await client.query(
      `select id from public.chapters where book_id = $1`,
      [id],
    );
    const chapterIds = ch.rows.map((r) => r.id);
    if (chapterIds.length) {
      await client.query(`delete from public.chunks where chapter_id = any($1)`, [chapterIds]);
      await client.query(`delete from public.chapters where book_id = $1`, [id]);
    }
    await client.query(`delete from public.books where id = $1`, [id]);
    console.log(
      `Deleted vestigial row ${id} (${chapterIds.length} chapters + chunks).`,
    );
  }
} finally {
  await client.end();
}
