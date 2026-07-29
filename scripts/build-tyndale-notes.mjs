#!/usr/bin/env node
/**
 * Build per-book verse study notes from the Tyndale Open Study Notes.
 *
 * Source: https://tyndaleopenresources.com/ ("Tyndale Open Study Notes" zip →
 * StudyNotes.xml). © Tyndale House Publishers, CC BY-SA 4.0. The output here
 * is an adaptation (reformatted to JSON, reference links flattened to plain
 * scripture references) and therefore remains CC BY-SA 4.0 — see
 * data/tyndale/_attribution.json for the required attribution statement.
 *
 * Usage:
 *   node scripts/build-tyndale-notes.mjs path/to/StudyNotes.xml
 *
 * Output: data/tyndale/{Book}.json
 *   { book, notes: [[chapter, verse, endChapter, endVerse, text], ...] }
 * sorted by start position, then narrower ranges first — the order the verse
 * sheet displays them in.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data", "tyndale");

// Tyndale book codes (as used in item names / bref links) → canon names.
const BOOK_CODES = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deut: "Deuteronomy", Josh: "Joshua", Judg: "Judges", Ruth: "Ruth",
  ISam: "1 Samuel", IISam: "2 Samuel", IKgs: "1 Kings", IIKgs: "2 Kings",
  IChr: "1 Chronicles", IIChr: "2 Chronicles", Ezra: "Ezra", Neh: "Nehemiah",
  Esth: "Esther", Job: "Job", Ps: "Psalms", Pr: "Proverbs",
  Eccl: "Ecclesiastes", Song: "Song of Solomon", Isa: "Isaiah",
  Jer: "Jeremiah", Lam: "Lamentations", Ezek: "Ezekiel", Dan: "Daniel",
  Hos: "Hosea", Joel: "Joel", Amos: "Amos", Obad: "Obadiah", Jon: "Jonah",
  Mic: "Micah", Nah: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah",
  Hagg: "Haggai", Zech: "Zechariah", Mal: "Malachi",
  Matt: "Matthew", Mark: "Mark", Luke: "Luke", John: "John", Acts: "Acts",
  Rom: "Romans", ICor: "1 Corinthians", IICor: "2 Corinthians",
  Gal: "Galatians", Eph: "Ephesians", Phil: "Philippians", Col: "Colossians",
  IThes: "1 Thessalonians", IIThes: "2 Thessalonians", ITim: "1 Timothy",
  IITim: "2 Timothy", Titus: "Titus", Phlm: "Philemon", Heb: "Hebrews",
  Jas: "James", IPet: "1 Peter", IIPet: "2 Peter", IJn: "1 John",
  IIJn: "2 John", IIIJn: "3 John", Jude: "Jude", Rev: "Revelation",
};

/**
 * Parse a Tyndale reference like "Matt.5.13", "Matt.5.13-16", "Gen.1.1-2.3".
 * Returns { book, c, v, ec, ev } or null. Verse letters ("Ps.9.1a") are
 * tolerated and stripped.
 */
function parseRef(ref) {
  const m = /^([A-Za-z]+)\.(\d+)\.(\d+)[a-z]?(?:[-–](?:(\d+)\.)?(\d+)[a-z]?)?$/.exec(ref);
  if (!m) return null;
  const book = BOOK_CODES[m[1]];
  if (!book) return null;
  const c = parseInt(m[2], 10);
  const v = parseInt(m[3], 10);
  const ec = m[4] ? parseInt(m[4], 10) : c;
  const ev = m[5] ? parseInt(m[5], 10) : v;
  return { book, c, v, ec, ev };
}

/** "Ezekiel 16:4", "Genesis 1:22-25", "Genesis 1:1–2:3" — display text for a bref. */
function refDisplay(r) {
  const name = r.book === "Psalms" ? "Psalm" : r.book;
  if (r.ec !== r.c) return `${name} ${r.c}:${r.v}–${r.ec}:${r.ev}`;
  if (r.ev !== r.v) return `${name} ${r.c}:${r.v}-${r.ev}`;
  return `${name} ${r.c}:${r.v}`;
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  mdash: "—", ndash: "–", hellip: "…",
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

/** One note body: HTML → plain text with scripture refs spelled out in full. */
function cleanBody(html) {
  let s = html;
  // Drop the leading verse-reference label ("5:13") — the UI renders its own.
  s = s.replace(/<span class="sn-ref">[\s\S]*?<\/span>/g, "");
  // bref links → canonical full-name references (so the app can linkify them);
  // any other link (e.g. ?item= study-note links) keeps its inner text.
  s = s.replace(/<a href="\?bref=([^"]+)">([\s\S]*?)<\/a>/g, (_, bref, inner) => {
    const r = parseRef(bref.trim());
    return r ? refDisplay(r) : inner;
  });
  s = s.replace(/<a [^>]*>([\s\S]*?)<\/a>/g, "$1");
  // Paragraph boundaries → newlines, then strip all remaining tags.
  s = s.replace(/<\/p>\s*<p[^>]*>/g, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/ /g, " ");
  // Collapse whitespace but preserve paragraph newlines.
  s = s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return s;
}

function main() {
  const xmlPath = process.argv[2];
  if (!xmlPath || !fs.existsSync(xmlPath)) {
    console.error("Usage: node scripts/build-tyndale-notes.mjs path/to/StudyNotes.xml");
    process.exit(1);
  }
  const xml = fs.readFileSync(xmlPath, "utf-8");

  const perBook = new Map(); // canon name → [[c,v,ec,ev,text],...]
  let total = 0;
  const skipped = [];

  const itemRe = /<item name="([^"]+)" typename="StudyNote"[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const [, name, body] = m;
    const ref = parseRef(name);
    if (!ref) {
      skipped.push(name);
      continue;
    }
    const paras = [...body.matchAll(/<p class="sn-text">([\s\S]*?)<\/p>/g)].map((p) => p[1]);
    // Fallback-extracted bodies (items without sn-text paragraphs) lead with
    // the item's raw dotted ref ("John.1.1") as a first line — drop it.
    const text = cleanBody(paras.join("\n") || body).replace(
      /^[0-9A-Za-z]+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?\n/,
      "",
    );
    if (!text) {
      skipped.push(name);
      continue;
    }
    if (!perBook.has(ref.book)) perBook.set(ref.book, []);
    perBook.get(ref.book).push([ref.c, ref.v, ref.ec, ref.ev, text]);
    total++;
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const span = (n) => (n[2] - n[0]) * 1000 + (n[3] - n[1]);
  for (const [book, notes] of perBook) {
    notes.sort((a, b) => a[0] - b[0] || a[1] - b[1] || span(a) - span(b));
    fs.writeFileSync(
      path.join(OUT_DIR, `${book}.json`),
      JSON.stringify({ book, notes }),
    );
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "_attribution.json"),
    JSON.stringify(
      {
        source: "Tyndale Open Study Notes, Tyndale House Publishers",
        license: "CC BY-SA 4.0",
        url: "https://tyndaleopenresources.com/",
        attribution:
          "Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers is available for free at http://www.tyndaleopenresources.com.",
        notes:
          "Reformatted from StudyNotes.xml to per-book JSON by scripts/build-tyndale-notes.mjs; verse-reference labels removed, internal links flattened to full scripture references. This adapted dataset remains CC BY-SA 4.0.",
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Books: ${perBook.size}, notes: ${total}, skipped: ${skipped.length}`);
  if (skipped.length) console.log("Skipped names:", skipped.slice(0, 20).join(", "));
}

main();
