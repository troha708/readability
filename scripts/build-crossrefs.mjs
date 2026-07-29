#!/usr/bin/env node
/**
 * Convert the OpenBible.info cross-references dataset (CC-BY, derived from the
 * Treasury of Scripture Knowledge) into per-book lookup JSON for the reader's
 * verse sheet and /api/cross-refs.
 *
 * Source format (tab-separated):  Gen.1.1  Ps.148.4-Ps.148.5  59
 * (from-verse, to-verse-or-range, community votes)
 *
 * Output: data/crossrefs/<Book>.json
 *   { "book": "...", "refs": { "3:16": [[toBook, ch, v, endCh, endV], ...] } }
 * Targets are sorted by votes (descending) and capped per source verse;
 * negative-vote (community-rejected) references are dropped. endCh/endV are 0
 * for single-verse targets.
 *
 * Prerequisite:
 *   curl -sL https://a.openbible.info/data/cross-references.zip -o %TEMP%\cr.zip
 *   unzip -o %TEMP%\cr.zip
 *
 * Usage: node scripts/build-crossrefs.mjs <path-to-cross_references.txt>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error("Usage: node scripts/build-crossrefs.mjs <cross_references.txt>");
  process.exit(1);
}

const MAX_REFS_PER_VERSE = 12;

// OSIS book code → app book name.
const OSIS_TO_BOOK = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deut: "Deuteronomy", Josh: "Joshua", Judg: "Judges", Ruth: "Ruth",
  "1Sam": "1 Samuel", "2Sam": "2 Samuel", "1Kgs": "1 Kings", "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles", "2Chr": "2 Chronicles", Ezra: "Ezra", Neh: "Nehemiah",
  Esth: "Esther", Job: "Job", Ps: "Psalms", Prov: "Proverbs",
  Eccl: "Ecclesiastes", Song: "Song of Solomon", Isa: "Isaiah", Jer: "Jeremiah",
  Lam: "Lamentations", Ezek: "Ezekiel", Dan: "Daniel", Hos: "Hosea",
  Joel: "Joel", Amos: "Amos", Obad: "Obadiah", Jonah: "Jonah", Mic: "Micah",
  Nah: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah", Hag: "Haggai",
  Zech: "Zechariah", Mal: "Malachi", Matt: "Matthew", Mark: "Mark",
  Luke: "Luke", John: "John", Acts: "Acts", Rom: "Romans",
  "1Cor": "1 Corinthians", "2Cor": "2 Corinthians", Gal: "Galatians",
  Eph: "Ephesians", Phil: "Philippians", Col: "Colossians",
  "1Thess": "1 Thessalonians", "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy", "2Tim": "2 Timothy", Titus: "Titus", Phlm: "Philemon",
  Heb: "Hebrews", Jas: "James", "1Pet": "1 Peter", "2Pet": "2 Peter",
  "1John": "1 John", "2John": "2 John", "3John": "3 John", Jude: "Jude",
  Rev: "Revelation",
};

function parseRef(osis) {
  // "Ps.148.4" → { book, chapter, verse }
  const m = osis.match(/^([0-9A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const book = OSIS_TO_BOOK[m[1]];
  if (!book) return null;
  return { book, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
}

const lines = fs.readFileSync(SRC, "utf8").split("\n");
// per from-book → per "c:v" → [{votes, tuple}]
const byBook = new Map();
let kept = 0;
let dropped = 0;

for (const line of lines.slice(1)) {
  const cols = line.trim().split("\t");
  if (cols.length < 3) continue;
  const [fromRaw, toRaw, votesRaw] = cols;
  const votes = parseInt(votesRaw, 10);
  if (!Number.isFinite(votes) || votes < 0) {
    dropped++;
    continue;
  }

  const from = parseRef(fromRaw);
  if (!from) {
    dropped++;
    continue;
  }

  // Target may be a range "Ps.148.4-Ps.148.5".
  const [toStartRaw, toEndRaw] = toRaw.split("-");
  const toStart = parseRef(toStartRaw);
  if (!toStart) {
    dropped++;
    continue;
  }
  let endCh = 0;
  let endV = 0;
  if (toEndRaw) {
    const toEnd = parseRef(toEndRaw);
    if (toEnd && toEnd.book === toStart.book) {
      endCh = toEnd.chapter === toStart.chapter ? 0 : toEnd.chapter;
      endV = toEnd.verse;
    }
  }

  let book = byBook.get(from.book);
  if (!book) {
    book = new Map();
    byBook.set(from.book, book);
  }
  const key = `${from.chapter}:${from.verse}`;
  let list = book.get(key);
  if (!list) {
    list = [];
    book.set(key, list);
  }
  list.push({
    votes,
    tuple: [toStart.book, toStart.chapter, toStart.verse, endCh, endV],
  });
  kept++;
}

const OUT_DIR = path.join(root, "data", "crossrefs");
fs.mkdirSync(OUT_DIR, { recursive: true });

let totalRefs = 0;
for (const [book, verses] of byBook) {
  const refs = {};
  const keys = [...verses.keys()].sort((a, b) => {
    const [ac, av] = a.split(":").map(Number);
    const [bc, bv] = b.split(":").map(Number);
    return ac - bc || av - bv;
  });
  for (const key of keys) {
    const list = verses
      .get(key)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, MAX_REFS_PER_VERSE);
    refs[key] = list.map((r) => r.tuple);
    totalRefs += list.length;
  }
  fs.writeFileSync(
    path.join(OUT_DIR, `${book}.json`),
    JSON.stringify({ book, refs }),
  );
}

fs.writeFileSync(
  path.join(OUT_DIR, "_attribution.json"),
  JSON.stringify(
    {
      source: "openbible.info cross references (Treasury of Scripture Knowledge, expanded)",
      license: "CC-BY",
      url: "https://www.openbible.info/labs/cross-references/",
    },
    null,
    2,
  ),
);

console.log(
  `Parsed ${kept} references (${dropped} dropped), kept ${totalRefs} after per-verse cap → data/crossrefs/ (${byBook.size} books)`,
);
