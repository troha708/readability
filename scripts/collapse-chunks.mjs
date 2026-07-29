#!/usr/bin/env node
/**
 * One-time migration: collapse each chapter's chunks into a single chunk.
 *
 * Chunking has been retired (splitting chapters into ~1500-word chunks caused
 * section headings to bleed across chunk boundaries). This rewrites existing
 * data so every chapter has exactly one chunk containing the full chapter HTML.
 *
 * Usage:
 *   node scripts/collapse-chunks.mjs --dry-run   # report scope, no writes
 *   node scripts/collapse-chunks.mjs             # perform the migration
 *
 * For each chapter with >1 chunk it concatenates the chunk text in order,
 * writes the combined text into the first chunk, then deletes the rest. The
 * first chunk is updated (not deleted) first, so a crash can never leave a
 * chapter with zero chunks (worst case is recoverable duplication).
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const supabase = createClient(url, key);
console.log(
  `Connected to ${url}\n  key: ${serviceKey ? "service role" : "anon (writes may be blocked by RLS)"} | dryRun: ${dryRun}`,
);

const PAGE = 1000;

/** Count chunks per chapter across the whole table (paginated). */
async function chunkCountsByChapter() {
  const counts = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("chunks")
      .select("chapter_id, chunk_number")
      .order("chapter_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data.length) break;
    for (const r of data) counts.set(r.chapter_id, (counts.get(r.chapter_id) ?? 0) + 1);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return counts;
}

async function main() {
  const counts = await chunkCountsByChapter();
  const totalChapters = counts.size;
  const totalChunks = [...counts.values()].reduce((a, b) => a + b, 0);
  const multi = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  console.log(
    `Chapters: ${totalChapters} | total chunks: ${totalChunks} | chapters with >1 chunk: ${multi.length}`,
  );

  if (dryRun) {
    console.log("Dry run — no writes performed.");
    return;
  }
  if (multi.length === 0) {
    console.log("Nothing to do — every chapter already has a single chunk.");
    return;
  }

  // Pre-flight: confirm we can actually write. With the anon key, RLS can
  // silently block updates/deletes (0 rows affected, no error). Probe with a
  // same-value update (no content change) and abort before touching anything
  // if it does not take effect.
  {
    const probeId = multi[0];
    const { data: pc, error: pErr } = await supabase
      .from("chunks")
      .select("chunk_number, text")
      .eq("chapter_id", probeId)
      .order("chunk_number")
      .limit(1);
    if (pErr) throw pErr;
    const { data: pRes, error: pwErr } = await supabase
      .from("chunks")
      .update({ text: pc[0].text })
      .eq("chapter_id", probeId)
      .eq("chunk_number", pc[0].chunk_number)
      .select("chunk_number");
    if (pwErr) throw pwErr;
    if (!pRes || pRes.length === 0) {
      console.error(
        "\nWrite check FAILED: update affected 0 rows — RLS is blocking writes with this key.\n" +
          "Add SUPABASE_SERVICE_ROLE_KEY to .env.local and re-run. No data was changed.",
      );
      process.exit(2);
    }
    console.log("Write capability OK.");
  }

  let done = 0;
  for (const chapterId of multi) {
    const { data: chunks, error } = await supabase
      .from("chunks")
      .select("chunk_number, text")
      .eq("chapter_id", chapterId)
      .order("chunk_number");
    if (error) throw error;
    if (chunks.length <= 1) continue;

    const first = chunks[0].chunk_number;
    const combined = chunks.map((c) => c.text).join("\n");

    // 1) write the full chapter into the first chunk
    const up = await supabase
      .from("chunks")
      .update({ text: combined })
      .eq("chapter_id", chapterId)
      .eq("chunk_number", first);
    if (up.error) throw up.error;

    // 2) delete the remaining chunks
    const del = await supabase
      .from("chunks")
      .delete()
      .eq("chapter_id", chapterId)
      .neq("chunk_number", first);
    if (del.error) throw del.error;

    // 3) normalize the surviving chunk to chunk_number = 1
    if (first !== 1) {
      const ren = await supabase
        .from("chunks")
        .update({ chunk_number: 1 })
        .eq("chapter_id", chapterId)
        .eq("chunk_number", first);
      if (ren.error) throw ren.error;
    }

    done++;
    if (done % 50 === 0) console.log(`  collapsed ${done}/${multi.length}`);
  }
  console.log(`Done. Collapsed ${done} chapters into single chunks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
