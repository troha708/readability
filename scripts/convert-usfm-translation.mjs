#!/usr/bin/env node
/**
 * Convert an ebible.org USFM package into the same formatted-HTML JSON shape
 * that convert-bsb-usfm.mjs produces, so seed-translation-pg.mjs can load it.
 * Generalized from the BSB converter with one addition: ebible texts (ASV
 * especially) tag words with Strong's attributes (\w word|strong="G1722"\w*),
 * which are unwrapped to their display text.
 *
 * Usage:
 *   node scripts/convert-usfm-translation.mjs --src <usfm-dir> --abbr ASV --name "American Standard Version (1901)"
 *
 * Output: data/<ABBR>/<Book>.json + data/<ABBR>/_manifest.json
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

const SRC_DIR = arg("src");
const ABBR = arg("abbr");
const NAME = arg("name");
if (!SRC_DIR || !ABBR || !NAME) {
  console.error(
    'Usage: node scripts/convert-usfm-translation.mjs --src <dir> --abbr ASV --name "American Standard Version (1901)"',
  );
  process.exit(1);
}
const OUT_DIR = path.join(root, "data", ABBR);

// USFM file code → app book name (Protestant canon, 66 books).
const CODE_TO_BOOK = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers",
  DEU: "Deuteronomy", JOS: "Joshua", JDG: "Judges", RUT: "Ruth",
  "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
  "1CH": "1 Chronicles", "2CH": "2 Chronicles", EZR: "Ezra", NEH: "Nehemiah",
  EST: "Esther", JOB: "Job", PSA: "Psalms", PRO: "Proverbs",
  ECC: "Ecclesiastes", SNG: "Song of Solomon", ISA: "Isaiah", JER: "Jeremiah",
  LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea",
  JOL: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah",
  NAM: "Nahum", HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai",
  ZEC: "Zechariah", MAL: "Malachi", MAT: "Matthew", MRK: "Mark",
  LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Romans",
  "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians",
  EPH: "Ephesians", PHP: "Philippians", COL: "Colossians",
  "1TH": "1 Thessalonians", "2TH": "2 Thessalonians", "1TI": "1 Timothy",
  "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews",
  JAS: "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John",
  "2JN": "2 John", "3JN": "3 John", JUD: "Jude", REV: "Revelation",
};

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert the inline content of a USFM line into HTML, stripping footnotes,
 * cross-references, and word-attribute markup. Mirrors the BSB converter,
 * plus \w unwrapping for ebible's Strong's-tagged texts.
 */
function inlineToHtml(raw) {
  let s = raw;
  // Drop footnotes and cross-reference notes entirely (may nest \fr \ft \xt …).
  s = s.replace(/\\f\b[\s\S]*?\\f\*/g, "");
  s = s.replace(/\\x\b[\s\S]*?\\x\*/g, "");
  // Word-level markup: \w text|strong="G1722"\w* (also \+w) → display text.
  s = s.replace(/\\\+?w\s+([^|\\]*?)(?:\|[^\\]*?)?\\\+?w\*/g, "$1");
  // Cross-reference links: "\ref Genesis 1:1|GEN 1:1\ref*" → display text only.
  s = s.replace(/\\ref\s+([\s\S]*?)\\ref\*/g, (_m, inner) =>
    inner.split("|")[0].trim(),
  );
  // Words of Jesus.
  s = s.replace(/\\wj\*/g, "</wj>").replace(/\\wj\b\s?/g, "<wj>");
  // Any leftover character/paragraph markers (\add, \nd, stray \ft, etc.):
  // drop the markers, keep their text.
  s = s.replace(/\\\+?[a-z]+\d*\*/gi, "");
  s = s.replace(/\\\+?[a-z]+\d*\b\s?/gi, "");
  // Leftover attribute fragments would be markup bugs; scrub defensively.
  s = s.replace(/\|strong="[^"]*"/g, "");
  // Escape the actual scripture text (protecting our own tags).
  s = s.replace(/<wj>/g, "WJO").replace(/<\/wj>/g, "WJC");
  s = escapeHtml(s);
  s = s.replace(/WJO/g, "<wj>").replace(/WJC/g, "</wj>");
  return s.replace(/\s+/g, " ").trim();
}

// Paragraph-style USFM markers → HTML paragraph class.
const PARA_CLASS = {
  p: "p", m: "p", pmo: "p", pi: "p", mi: "p", nb: "p",
  q1: "q1", q2: "q2", q3: "q2", qr: "q2", qc: "q2", qa: "q2",
  li1: "q1", li2: "q2", d: "d",
};

function buildChapterHtml(lines, code) {
  const blocks = [];
  let chapterNum = null;
  let currentVerse = null;
  // ebible USFM puts each verse on its own \v line inside an open paragraph
  // (\p / \q1 / …), so paragraph content is accumulated until the next
  // paragraph-level marker and only then converted.
  let paraClass = null;
  let paraContent = "";

  function emitParagraph(cls, content) {
    const parts = content.split(/(\\v\s+\d+(?:[-,]\d+)?\s*)/);
    let html = "";
    let sawVerse = false;
    for (const part of parts) {
      const vm = part.match(/^\\v\s+(\d+(?:[-,]\d+)?)\s*$/);
      if (vm) {
        const num = vm[1];
        currentVerse = parseInt(num, 10);
        sawVerse = true;
        html += `<span data-number="${num}" data-sid="${code} ${chapterNum}:${num}" class="v">${num}</span> `;
      } else {
        const inner = inlineToHtml(part);
        if (inner) html += inner + " ";
      }
    }
    if (!sawVerse && currentVerse != null) {
      html =
        `<span class="verse-span" data-verse-id="${code}.${chapterNum}.${currentVerse}"></span>` +
        html;
    }
    if (!html.trim()) return;
    html = html.replace(/\s+/g, " ").trim();
    const opens = (html.match(/<wj>/g) || []).length;
    const closes = (html.match(/<\/wj>/g) || []).length;
    if (opens > closes) html += "</wj>".repeat(opens - closes);
    blocks.push(`<p class="${cls}">${html}</p>`);
  }

  function flushParagraph() {
    if (paraClass != null) emitParagraph(paraClass, paraContent);
    paraClass = null;
    paraContent = "";
  }

  function openParagraph(cls, rest) {
    flushParagraph();
    paraClass = cls;
    paraContent = rest;
  }

  for (const line of lines) {
    const m = line.match(/^\\(\w+)\*?\s?(.*)$/s);
    if (!m) {
      // Continuation of the previous line's paragraph (rare, but legal USFM).
      if (paraClass != null && line.trim()) paraContent += " " + line;
      continue;
    }
    const marker = m[1];
    const rest = m[2] ?? "";

    if (marker === "c") {
      flushParagraph();
      chapterNum = parseInt(rest, 10);
      currentVerse = null;
      continue;
    }
    if (chapterNum == null) continue;

    // Verse line: content of the currently open paragraph.
    if (marker === "v") {
      if (paraClass == null) paraClass = "p";
      paraContent += ` \\v ${rest}`;
      continue;
    }

    if (marker === "s1" || marker === "ms") {
      flushParagraph();
      const text = inlineToHtml(rest);
      if (text) blocks.push(`<p class="s1">${text}</p>`);
      continue;
    }
    if (marker === "s2") {
      flushParagraph();
      const text = inlineToHtml(rest);
      if (text) blocks.push(`<p class="s2">${text}</p>`);
      continue;
    }
    if (marker === "r" || marker === "mr") {
      flushParagraph();
      const text = inlineToHtml(rest);
      if (text) blocks.push(`<p class="r">${text}</p>`);
      continue;
    }
    if (
      ["b", "id", "usfm", "h", "toc1", "toc2", "toc3", "mt1", "mt2", "mt3",
        "ms1", "sr", "sp", "cl", "cp", "ide", "rem", "toc", "is", "ip", "ie",
        "periph", "sts"].includes(marker)
    ) {
      flushParagraph();
      continue;
    }

    const cls = PARA_CLASS[marker];
    if (cls) {
      openParagraph(cls, rest);
      continue;
    }

    // Unknown paragraph-ish marker: keep the text so nothing is lost.
    if (rest.trim()) openParagraph("p", rest);
  }

  flushParagraph();
  return blocks.join("");
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`USFM directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "_manifest.json"),
    JSON.stringify(
      {
        abbreviation: ABBR,
        name: NAME,
        apiBibleId: null,
        license: "Public Domain",
        source: "ebible.org",
      },
      null,
      2,
    ),
  );

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".usfm"));
  let totalBooks = 0;
  let totalChapters = 0;

  for (const file of files) {
    // ebible filenames look like "73-JHNenggnv.usfm": ordinal, SIL code, id.
    const cm = file.match(/^\d+-([0-9A-Z]{3})/);
    const code = cm?.[1];
    const bookName = code ? CODE_TO_BOOK[code] : undefined;
    if (!bookName) continue;

    const text = fs
      .readFileSync(path.join(SRC_DIR, file), "utf8")
      .replace(/\r/g, "")
      .replace(/^﻿/, "");
    const lines = text.split("\n");

    const chapters = [];
    let current = null;
    for (const line of lines) {
      const cmatch = line.match(/^\\c\s+(\d+)/);
      if (cmatch) {
        current = { chapter: parseInt(cmatch[1], 10), lines: [] };
        chapters.push(current);
      }
      if (current) current.lines.push(line);
    }

    const chapterData = chapters.map((ch) => ({
      chapter: ch.chapter,
      chapterId: `${code}.${ch.chapter}`,
      html: buildChapterHtml(ch.lines, code),
    }));

    fs.writeFileSync(
      path.join(OUT_DIR, `${bookName}.json`),
      JSON.stringify(
        { book: bookName, bibleId: null, abbreviation: ABBR, chapters: chapterData },
        null,
        2,
      ),
    );
    totalBooks++;
    totalChapters += chapterData.length;
    process.stdout.write(`  ${bookName}: ${chapterData.length} chapters\n`);
  }

  console.log(`\nDone. ${totalBooks} books, ${totalChapters} chapters → data/${ABBR}/`);
}

main();
