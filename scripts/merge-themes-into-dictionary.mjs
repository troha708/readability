#!/usr/bin/env node
/**
 * Fold the 298 Tyndale theme essays into the dictionary as ordinary articles,
 * tagged `theme`.
 *
 * The theme hub was removed in July on the grounds that it overlapped the
 * dictionary. Measured, it mostly does not: 14 of the 298 titles collide
 * outright and 31 collide once a leading article is stripped, leaving 267 — "The Fall", "God's Covenant with Abraham", "Promised Land" —
 * that are topics no dictionary of people and places carries. The essays also run
 * longer on average (362 words against 232), and they are the better half of a
 * per-chapter index: median 4 citations per chapter and topical, against the
 * dictionary's median 18 dominated by name stubs.
 *
 * Two things need deciding per article rather than in bulk:
 *
 * Letter bucket. dictLetterOf() reads the first character of the id, and 90 of
 * the essays are titled "The …". Filing "The Fall" under T would bury it, so
 * the id is built from the title with a leading article dropped; the displayed
 * title keeps it.
 *
 * Collisions. Stripping the article means "The Land" wants the id `Land`,
 * which a real dictionary entry already owns — 31 of the 298 land this way.
 * Nothing is overwritten: the essay is a different treatment of the subject,
 * not a duplicate, so it takes a `…Theme` id and both are kept. Cases where
 * the two also share a display title are listed, since those are the ones a
 * reader could not tell apart in a result list.
 *
 * Idempotent: re-running detects articles already tagged `theme` and rewrites
 * them rather than duplicating.
 *
 *   node scripts/merge-themes-into-dictionary.mjs [--dry]
 */
import fs from "fs";
import path from "path";

const DICT_DIR = path.join(process.cwd(), "data", "tyndale-dictionary");
const THEMES = path.join(process.cwd(), "data", "tyndale-themes", "articles.json");
const DRY = process.argv.includes("--dry");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const wordCount = (blocks = []) =>
  blocks
    .map((b) => (b.runs ?? []).map((r) => r.s).join(""))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

/** Dictionary ids are the title stripped to alphanumerics. */
const toId = (s) => s.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
/** Leading article dropped so the essay files under its subject's letter. */
const sortTitle = (t) => t.replace(/^(?:The|A|An)\s+/i, "");
const letterOf = (id) => {
  const c = (id[0] ?? "").toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
};

const themes = read(THEMES).articles;
const index = read(path.join(DICT_DIR, "_index.json"));
// The authoritative category is the 5th slot of _index.json, which is what the
// app reads. _llm-categories.json is only a partial input to
// categorize-dictionary.mjs — it covers 1,973 of the 6,010 and carries values
// (`nature`) that never reach the shipped type. It is not touched here.
const cats = new Map(index.entries.map((e) => [e[0], e[4]]));

// Every existing id, and which letter file holds it.
const letters = new Map();
const ownerOf = new Map();
for (const fn of fs.readdirSync(DICT_DIR)) {
  if (!fn.endsWith(".json") || fn.startsWith("_")) continue;
  const file = read(path.join(DICT_DIR, fn));
  letters.set(file.letter, file);
  for (const id of Object.keys(file.articles ?? {})) ownerOf.set(id, file.letter);
}

const added = [];
const skipped = [];
const collided = [];
const readded = [];

for (const theme of Object.values(themes)) {
  const title = theme.t;
  const id = toId(sortTitle(title));
  if (!id) {
    skipped.push(`${title} — no usable id`);
    continue;
  }
  const letter = letterOf(id);
  if (!letters.has(letter)) {
    letters.set(letter, { letter, articles: {} });
  }
  const target = letters.get(letter);
  let finalId = id;
  const existingLetter = ownerOf.get(id);

  if (existingLetter !== undefined) {
    const holder = letters.get(existingLetter);
    if (cats.get(id) === "theme") {
      // Already merged on an earlier run — rewrite in place.
      holder.articles[id] = { t: title, b: theme.b };
      readded.push(title);
      continue;
    }
    // A real article owns the plain id. The essay is a different treatment of
    // the same subject, not a duplicate of it, so both are kept and the essay
    // takes a suffixed id.
    finalId = `${id}Theme`;
    if (ownerOf.has(finalId)) {
      skipped.push(`${title} — ${finalId} already taken`);
      continue;
    }
    const sameTitle = holder.articles[id].t === title;
    collided.push(`${title}${sameTitle ? "  <-- identical title to the existing article" : ` (alongside "${holder.articles[id].t}")`}`);
  }

  const bucket = letters.get(letterOf(finalId));
  bucket.articles[finalId] = { t: title, b: theme.b };
  cats.set(finalId, "theme");
  ownerOf.set(finalId, bucket.letter);
  added.push(finalId);
}

// Rebuild the search index from the letter files so it can never drift.
const entries = [];
for (const [letter, file] of [...letters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  for (const [id, a] of Object.entries(file.articles)) {
    entries.push([id, a.t, letter, wordCount(a.b), cats.get(id)].filter((v) => v !== undefined));
  }
}
entries.sort((a, b) => a[1].localeCompare(b[1]));

console.log(
  `added ${added.length} · re-added ${readded.length} · skipped ${skipped.length} · id-suffixed ${collided.length}`,
);
if (skipped.length) console.log("skipped:\n  " + skipped.join("\n  "));
if (collided.length) console.log("kept alongside an existing article:\n  " + collided.join("\n  "));
console.log(`index: ${index.count} -> ${entries.length}`);

if (DRY) {
  console.log("(dry run — nothing written)");
  process.exit(0);
}

for (const [letter, file] of letters) {
  fs.writeFileSync(path.join(DICT_DIR, `${letter}.json`), JSON.stringify(file));
}
fs.writeFileSync(
  path.join(DICT_DIR, "_index.json"),
  JSON.stringify({ ...index, count: entries.length, entries }),
);
console.log("written");
