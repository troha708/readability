#!/usr/bin/env node
/**
 * Extract section headings from BSB (Berean Standard Bible) USFM files.
 *
 * The BSB is public domain (CC0) and includes \s1 section headings with
 * verse positions. This script extracts them and writes JSON files per book
 * into data/headings/<BookName>.json.
 *
 * Prerequisites:
 *   - Download BSB USFM: curl -sL https://bereanbible.com/bsb_usfm.zip -o /tmp/bsb_usfm.zip
 *   - Unzip: unzip -o /tmp/bsb_usfm.zip -d /tmp/bsb_usfm
 *
 * Usage:
 *   node scripts/extract-bsb-headings.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const USFM_DIR = process.platform === "win32"
  ? path.join(process.env.TEMP || process.env.TMP || "/tmp", "bsb_usfm", "bsb_usfm")
  : "/tmp/bsb_usfm/bsb_usfm";
const OUT_DIR = path.join(root, "data", "headings");

// Map BSB USFM file codes to your app's book names
const CODE_TO_BOOK = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Solomon",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
};

function parseUsfm(text) {
  const chapters = {};
  let currentChapter = 0;
  let lastVerse = 0;

  for (const line of text.split("\n")) {
    // Chapter marker
    const chMatch = line.match(/^\\c\s+(\d+)/);
    if (chMatch) {
      currentChapter = parseInt(chMatch[1], 10);
      lastVerse = 0;
      continue;
    }

    if (currentChapter === 0) continue;

    // Track verse numbers (can appear multiple times per line)
    const verseMatches = [...line.matchAll(/\\v\s+(\d+)/g)];
    if (verseMatches.length > 0) {
      lastVerse = parseInt(verseMatches[verseMatches.length - 1][1], 10);
    }

    // Section heading — \s1 or \s followed by text
    const sMatch = line.match(/^\\s\d?\s+(.*)/);
    if (sMatch) {
      const heading = sMatch[1].trim();
      if (!heading) continue;

      if (!chapters[currentChapter]) {
        chapters[currentChapter] = [];
      }

      // The heading applies before the next verse.
      // Find the first \v on lines after this heading.
      // For now, we store the last known verse; we'll fix it in a second pass.
      chapters[currentChapter].push({
        heading,
        _afterVerse: lastVerse, // heading comes after this verse was last seen
      });
    }
  }

  // Second pass: assign beforeVerse by scanning the file again
  // We need to find which verse follows each \s1 marker
  const lines = text.split("\n");
  let ch = 0;
  const headingIdx = {}; // ch -> index into chapters[ch]

  for (let i = 0; i < lines.length; i++) {
    const chMatch = lines[i].match(/^\\c\s+(\d+)/);
    if (chMatch) {
      ch = parseInt(chMatch[1], 10);
      if (!headingIdx[ch]) headingIdx[ch] = 0;
      continue;
    }

    if (ch === 0) continue;

    const sMatch = lines[i].match(/^\\s\d?\s+(.*)/);
    if (sMatch && chapters[ch]) {
      // Find the next verse after this line (could be on same line or subsequent lines)
      let nextVerse = null;

      // Check remaining content on lines after the heading (sometimes \p \v on next line)
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const vMatches = [...lines[j].matchAll(/\\v\s+(\d+)/g)];
        if (vMatches.length > 0) {
          // If j === i, these verses are on the heading line itself (unlikely for \s1)
          // Otherwise they're on subsequent lines
          if (j === i) {
            // Verse on same line as heading — unusual but handle it
            nextVerse = parseInt(vMatches[0][1], 10);
          } else {
            nextVerse = parseInt(vMatches[0][1], 10);
          }
          break;
        }
      }

      const idx = headingIdx[ch] || 0;
      if (chapters[ch][idx]) {
        chapters[ch][idx].beforeVerse = nextVerse || 1;
        delete chapters[ch][idx]._afterVerse;
      }
      headingIdx[ch] = idx + 1;
    }
  }

  // Clean up any remaining _afterVerse
  for (const ch of Object.keys(chapters)) {
    for (const h of chapters[ch]) {
      if (h._afterVerse !== undefined) {
        h.beforeVerse = h._afterVerse + 1;
        delete h._afterVerse;
      }
    }
  }

  return chapters;
}

function main() {
  if (!fs.existsSync(USFM_DIR)) {
    console.error(`USFM directory not found: ${USFM_DIR}`);
    console.error("Run these commands first:");
    console.error("  curl -sL https://bereanbible.com/bsb_usfm.zip -o /tmp/bsb_usfm.zip");
    console.error("  unzip -o /tmp/bsb_usfm.zip -d /tmp/bsb_usfm");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(USFM_DIR).filter((f) => f.endsWith(".usfm"));
  let totalBooks = 0;
  let totalHeadings = 0;

  for (const file of files) {
    const code = file.replace(".usfm", "");
    const bookName = CODE_TO_BOOK[code];
    if (!bookName) {
      console.log(`  Skipping ${code} (no mapping)`);
      continue;
    }

    const text = fs.readFileSync(path.join(USFM_DIR, file), "utf8");
    const chapters = parseUsfm(text);

    const chapterCount = Object.keys(chapters).length;
    const headingCount = Object.values(chapters).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    if (headingCount === 0) {
      console.log(`  ${bookName}: no headings found`);
      continue;
    }

    // Convert to sorted output format
    const output = {
      book: bookName,
      source: "Berean Standard Bible (CC0 Public Domain)",
      chapters: {},
    };

    for (const [ch, headings] of Object.entries(chapters).sort(
      ([a], [b]) => Number(a) - Number(b)
    )) {
      output.chapters[ch] = headings.map((h) => ({
        beforeVerse: h.beforeVerse,
        heading: h.heading,
      }));
    }

    const outFile = path.join(OUT_DIR, `${bookName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    console.log(`  ${bookName}: ${chapterCount} chapters, ${headingCount} headings`);
    totalBooks++;
    totalHeadings += headingCount;
  }

  console.log(`\nDone. ${totalBooks} books, ${totalHeadings} headings total.`);
  console.log(`Files saved to data/headings/`);
}

main();
