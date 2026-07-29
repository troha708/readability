#!/usr/bin/env node
/**
 * Build the reverse-interlinear word data for the verse sheet's "Original
 * words" section — two aligned sentences (original + BSB) that link word by
 * word.
 *
 * Source: the bereanbible.com "BSB Translation Tables" (bsb_tables.tsv) — one
 * row per original-language word, carrying the word, transliteration, parsing,
 * Strong's number, the BSB's rendering of that word, and separate Greek-order
 * and BSB-order sort keys. The BSB and its tables are dedicated to the public
 * domain. The "BSB version" column reconstructs the shipped BSB text word for
 * word (verified against data/BSB across whole books).
 *
 * Output: data/interlinear/<Book>.json
 *   { book, verses: { "3:16": [ [orig, translit, parse, strong, bsb, gkSort, bsbSort, gloss], … ] } }
 *   `gloss` is the concise TAGNT/TAHOT English gloss (from data/strongs) for
 *   the word's Strong's number — the quick meaning the old word list showed.
 *   One entry per row (array index = stable word id used to link the two lines).
 *   Greek line  = entries with a non-empty `orig`, sorted by gkSort.
 *   BSB line    = entries with a non-empty `bsb`,  sorted by bsbSort.
 *   A supplied English word (no original) is orig="" ; an untranslated original
 *   (e.g. the Hebrew object marker) is bsb="".
 *
 * Definitions are joined at serve time from data/lexicon/strongs.json
 * (openscriptures) by Strong's number, so they are not duplicated here.
 *
 * Usage: node scripts/build-interlinear.mjs --tsv <path/to/bsb_tables.tsv>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const TSV = arg("tsv");
if (!TSV) {
  console.error("Usage: node scripts/build-interlinear.mjs --tsv <bsb_tables.tsv>");
  process.exit(1);
}

// Column indices (0-based) in bsb_tables.tsv
const C_GK_SORT = 1, C_BSB_SORT = 2, C_ORIG = 5, C_TRANSLIT = 7,
      C_PARSE = 8, C_STR_HEB = 10, C_STR_GRK = 11, C_VERSEID = 12, C_BSB = 18;

const BOOK_ALIAS = { Psalm: "Psalms" };

function cleanBsb(t) {
  t = (t ?? "").trim();
  if (t === "-" || t === "vvv") return "";        // untranslated / folded into a neighbour
  t = t.replace(/[[\]{}]/g, "");                    // strip editorial [ ] { } markers
  if (t.replace(/[.\s]/g, "") === "") return "";    // ". . ." ellipsis marker
  return t.trim();
}

function strong(cols) {
  const g = (cols[C_STR_GRK] ?? "").trim();
  const h = (cols[C_STR_HEB] ?? "").trim();
  if (g) return "G" + g;
  if (h) return "H" + h;
  return "";
}

// "1 Kings 2:3" -> { book: "1 Kings", cv: "2:3" }
function splitVerseId(vid) {
  const m = vid.match(/^(.*) (\d+:\d+)$/);
  if (!m) return null;
  return { book: BOOK_ALIAS[m[1]] || m[1], cv: m[2] };
}

// Concise per-word English gloss, restored from the STEPBible (TAGNT/TAHOT)
// word data already in data/strongs: the most common gloss for each Strong's
// number. Keyed by number, so it needs no fragile per-verse alignment between
// the two taggers (their word order and tagging don't line up verse by verse).
const gloss = {};
{
  const freq = {};
  const dir = path.join(root, "data", "strongs");
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed.verses) continue;
    for (const cv in parsed.verses) {
      for (const [g, s] of parsed.verses[cv]) {
        if (!s || !g) continue;
        freq[s] ||= {};
        freq[s][g] = (freq[s][g] || 0) + 1;
      }
    }
  }
  for (const s in freq) {
    gloss[s] = Object.entries(freq[s]).sort((a, b) => b[1] - a[1])[0][0];
  }
}

const books = {};
let cur = null;

const lines = fs.readFileSync(TSV, "utf-8").split("\n");
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const cols = line.split("\t");
  if (cols.length <= C_BSB) continue;

  const vidRaw = (cols[C_VERSEID] ?? "").trim();
  if (vidRaw) cur = splitVerseId(vidRaw);
  if (!cur) continue;

  const orig = (cols[C_ORIG] ?? "").trim();
  const bsb = cleanBsb(cols[C_BSB]);
  if (!orig && !bsb) continue; // structural padding rows carry neither

  const st = strong(cols);
  const entry = [
    orig,
    (cols[C_TRANSLIT] ?? "").trim(),
    (cols[C_PARSE] ?? "").trim(),
    st,
    bsb,
    Number(cols[C_GK_SORT]) || 0,
    Number(cols[C_BSB_SORT]) || 0,
    gloss[st] || "",
  ];

  (books[cur.book] ||= { book: cur.book, verses: {} });
  (books[cur.book].verses[cur.cv] ||= []).push(entry);
}

const outDir = path.join(root, "data", "interlinear");
fs.mkdirSync(outDir, { recursive: true });
let nBooks = 0, nVerses = 0, nWords = 0;
for (const [book, obj] of Object.entries(books)) {
  fs.writeFileSync(path.join(outDir, `${book}.json`), JSON.stringify(obj));
  nBooks++;
  nVerses += Object.keys(obj.verses).length;
  for (const v of Object.values(obj.verses)) nWords += v.length;
}
console.log(`Wrote ${nBooks} books, ${nVerses} verses, ${nWords} words → data/interlinear/`);
