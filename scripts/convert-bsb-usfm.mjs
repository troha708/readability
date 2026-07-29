#!/usr/bin/env node
/**
 * Convert the public-domain Berean Standard Bible (BSB) USFM into the same
 * formatted-HTML JSON shape that fetch-formatted-bible.mjs produces for
 * api.bible translations, so seed-bible.mjs can load it unchanged.
 *
 * The BSB is not available on our api.bible plan, but bereanbible.com ships
 * the full text as CC0 USFM (the same source we already use for section
 * headings). This converter keeps section headings (\s1/\s2) and cross-
 * reference lines (\r) inline in the HTML, so the reader's formatter renders
 * them as subheadings without needing the separate data/headings overlay.
 *
 * Prerequisites (same as extract-bsb-headings.mjs):
 *   curl -sL https://bereanbible.com/bsb_usfm.zip -o %TEMP%\bsb_usfm.zip
 *   unzip -o %TEMP%\bsb_usfm.zip -d %TEMP%\bsb_usfm
 *
 * Usage:
 *   node scripts/convert-bsb-usfm.mjs
 *
 * Output: data/BSB/<Book>.json  +  data/BSB/_manifest.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const USFM_DIR =
  process.platform === "win32"
    ? path.join(
        process.env.TEMP || process.env.TMP || "/tmp",
        "bsb_usfm",
        "bsb_usfm",
      )
    : "/tmp/bsb_usfm/bsb_usfm";

const OUT_DIR = path.join(root, "data", "BSB");

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

// USFM SIL book code for data-verse-id (matches api.bible's verse ids).
const CODE_TO_SID = {
  GEN: "GEN", EXO: "EXO", LEV: "LEV", NUM: "NUM", DEU: "DEU", JOS: "JOS",
  JDG: "JDG", RUT: "RUT", "1SA": "1SA", "2SA": "2SA", "1KI": "1KI",
  "2KI": "2KI", "1CH": "1CH", "2CH": "2CH", EZR: "EZR", NEH: "NEH",
  EST: "EST", JOB: "JOB", PSA: "PSA", PRO: "PRO", ECC: "ECC", SNG: "SNG",
  ISA: "ISA", JER: "JER", LAM: "LAM", EZK: "EZK", DAN: "DAN", HOS: "HOS",
  JOL: "JOL", AMO: "AMO", OBA: "OBA", JON: "JON", MIC: "MIC", NAM: "NAM",
  HAB: "HAB", ZEP: "ZEP", HAG: "HAG", ZEC: "ZEC", MAL: "MAL", MAT: "MAT",
  MRK: "MRK", LUK: "LUK", JHN: "JHN", ACT: "ACT", ROM: "ROM", "1CO": "1CO",
  "2CO": "2CO", GAL: "GAL", EPH: "EPH", PHP: "PHP", COL: "COL", "1TH": "1TH",
  "2TH": "2TH", "1TI": "1TI", "2TI": "2TI", TIT: "TIT", PHM: "PHM",
  HEB: "HEB", JAS: "JAS", "1PE": "1PE", "2PE": "2PE", "1JN": "1JN",
  "2JN": "2JN", "3JN": "3JN", JUD: "JUD", REV: "REV",
};

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert the inline content of a USFM line into HTML, stripping footnotes
 * and reference markup and converting words-of-Jesus markers. Does NOT handle
 * \v (the caller splits on verses first so it can emit verse-number spans and
 * track the running verse for poetry continuation lines).
 */
function inlineToHtml(raw) {
  let s = raw;
  // Drop footnotes entirely (they may nest \fr \ft \fqa \fv \fk).
  s = s.replace(/\\f\b[\s\S]*?\\f\*/g, "");
  // Cross-reference links: "\ref Genesis 1:1|GEN 1:1\ref*" → display text only.
  s = s.replace(/\\ref\s+([\s\S]*?)\\ref\*/g, (_m, inner) =>
    inner.split("|")[0].trim(),
  );
  // Words of Jesus.
  s = s.replace(/\\wj\*/g, "</wj>").replace(/\\wj\b\s?/g, "<wj>");
  // Any leftover character/paragraph markers (\fv, stray \ft, \+xt, etc.).
  s = s.replace(/\\\+?[a-z]+\d*\*/gi, "");
  s = s.replace(/\\\+?[a-z]+\d*\b\s?/gi, "");
  // Escape the actual scripture text (tags above use < > which we must keep,
  // so escape only the raw text by protecting our own tags).
  s = s
    .replace(/<wj>/g, "WJO")
    .replace(/<\/wj>/g, "WJC");
  s = escapeHtml(s);
  s = s
    .replace(/WJO/g, "<wj>")
    .replace(/WJC/g, "</wj>");
  return s.replace(/\s+/g, " ").trim();
}

// Paragraph-style USFM markers → HTML paragraph class.
const PARA_CLASS = {
  p: "p", m: "p", pmo: "p", pc: "p", pi: "p", mi: "p", nb: "p",
  q1: "q1", q2: "q2", q3: "q2", qr: "q2", qc: "q2", qa: "q2",
  li1: "q1", li2: "q2", d: "d",
};

function buildChapterHtml(lines, code) {
  const sid = CODE_TO_SID[code];
  const blocks = [];
  let chapterNum = null;
  let currentVerse = null;
  // Open a wj across line boundaries is not expected; balance per line.

  function emitParagraph(cls, content) {
    // Split the content on verse markers, keeping the running verse so poetry
    // continuation lines (no \v) still carry a verse id for anchoring. Verse
    // numbers are emitted inline and text directly (no per-verse wrapper span),
    // so words-of-Jesus runs that straddle a verse number stay well nested.
    const parts = content.split(/(\\v\s+\d+(?:[-,]\d+)?\s*)/);
    let html = "";
    let sawVerse = false;
    for (const part of parts) {
      const vm = part.match(/^\\v\s+(\d+(?:[-,]\d+)?)\s*$/);
      if (vm) {
        const num = vm[1];
        currentVerse = parseInt(num, 10);
        sawVerse = true;
        html += `<span data-number="${num}" data-sid="${sid} ${chapterNum}:${num}" class="v">${num}</span> `;
      } else {
        const inner = inlineToHtml(part);
        if (inner) html += inner;
      }
    }
    // Poetry/continuation line with no verse marker: prepend an invisible
    // anchor so the reader can still resolve the line's verse for headings and
    // explanation icons.
    if (!sawVerse && currentVerse != null) {
      html =
        `<span class="verse-span" data-verse-id="${sid}.${chapterNum}.${currentVerse}"></span>` +
        html;
    }
    if (!html.trim()) return;
    // Balance any unclosed words-of-Jesus span within the paragraph.
    const opens = (html.match(/<wj>/g) || []).length;
    const closes = (html.match(/<\/wj>/g) || []).length;
    if (opens > closes) html += "</wj>".repeat(opens - closes);
    blocks.push(`<p class="${cls}">${html}</p>`);
  }

  for (const line of lines) {
    const m = line.match(/^\\(\w+)\*?\s?(.*)$/s);
    if (!m) continue;
    const marker = m[1];
    const rest = m[2] ?? "";

    if (marker === "c") {
      chapterNum = parseInt(rest, 10);
      currentVerse = null;
      continue;
    }
    if (chapterNum == null) continue;

    // Section headings (render as <h3> by the reader's formatter).
    if (marker === "s1" || marker === "ms") {
      const text = inlineToHtml(rest);
      if (text) blocks.push(`<p class="s1">${text}</p>`);
      continue;
    }
    if (marker === "s2") {
      const text = inlineToHtml(rest);
      if (text) blocks.push(`<p class="s2">${text}</p>`);
      continue;
    }
    // Parallel-passage reference lines (italic, small).
    if (marker === "r" || marker === "mr") {
      const text = inlineToHtml(rest);
      if (text) blocks.push(`<p class="r">${text}</p>`);
      continue;
    }
    // Stanza break / metadata / chapter-level markers we don't render.
    if (
      ["b", "id", "usfm", "h", "toc1", "toc2", "toc3", "mt1", "mt2", "mt3",
        "ms1", "sr", "sp", "cl", "cp"].includes(marker)
    ) {
      continue;
    }

    const cls = PARA_CLASS[marker];
    if (cls) {
      emitParagraph(cls, rest);
      continue;
    }

    // Unknown paragraph-ish marker: treat as a normal paragraph so no text is lost.
    if (rest.trim()) emitParagraph("p", rest);
  }

  return blocks.join("");
}

function main() {
  if (!fs.existsSync(USFM_DIR)) {
    console.error(`USFM directory not found: ${USFM_DIR}`);
    console.error("Download it first:");
    console.error("  curl -sL https://bereanbible.com/bsb_usfm.zip -o %TEMP%\\bsb_usfm.zip");
    console.error("  unzip -o %TEMP%\\bsb_usfm.zip -d %TEMP%\\bsb_usfm");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "_manifest.json"),
    JSON.stringify(
      { abbreviation: "BSB", name: "Berean Standard Bible", apiBibleId: null },
      null,
      2,
    ),
  );

  const files = fs.readdirSync(USFM_DIR).filter((f) => f.endsWith(".usfm"));
  let totalBooks = 0;
  let totalChapters = 0;

  for (const file of files) {
    const code = file.replace(".usfm", "");
    const bookName = CODE_TO_BOOK[code];
    if (!bookName) continue;

    const text = fs.readFileSync(path.join(USFM_DIR, file), "utf8").replace(/\r/g, "");
    const lines = text.split("\n");

    // Group lines by chapter.
    const chapters = [];
    let current = null;
    for (const line of lines) {
      const cm = line.match(/^\\c\s+(\d+)/);
      if (cm) {
        current = { chapter: parseInt(cm[1], 10), lines: [] };
        chapters.push(current);
      }
      if (current) current.lines.push(line);
      else if (line.match(/^\\c\s/)) {
        /* unreachable */
      }
    }

    const chapterData = chapters.map((ch) => ({
      chapter: ch.chapter,
      chapterId: `${code}.${ch.chapter}`,
      html: buildChapterHtml(ch.lines, code),
    }));

    fs.writeFileSync(
      path.join(OUT_DIR, `${bookName}.json`),
      JSON.stringify(
        { book: bookName, bibleId: null, abbreviation: "BSB", chapters: chapterData },
        null,
        2,
      ),
    );
    totalBooks++;
    totalChapters += chapterData.length;
    process.stdout.write(`  ${bookName}: ${chapterData.length} chapters\n`);
  }

  console.log(`\nDone. ${totalBooks} books, ${totalChapters} chapters → data/BSB/`);
}

main();
