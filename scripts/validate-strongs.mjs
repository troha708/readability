#!/usr/bin/env node
/**
 * Validation gate for the word-study data (data/strongs + data/lexicon).
 * Run after build-strongs.mjs. Checks:
 *
 *   1. Every emitted Strong's number resolves in the lexicon (both serving
 *      paths silently drop unresolvable numbers).
 *   2. Coverage against the BSB text: every BSB verse should have a word
 *      list; verses on either side without a counterpart are reported
 *      (small counts are expected — versification seams, e.g. 3 John 15).
 *   3. Known-answer spot checks — verses whose correct tagging is
 *      documented, guarding against a regression to misaligned data
 *      (the old ebible ASV source tagged John 1:1 "with" as G1722).
 *
 * Exits non-zero on any hard failure (checks 1 and 3).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const strongsDir = path.join(root, "data", "strongs");
const bsbDir = path.join(root, "data", "BSB");

const lexicon = JSON.parse(
  fs.readFileSync(path.join(root, "data", "lexicon", "strongs.json"), "utf8"),
);

let failures = 0;

// ── 1. Lexicon resolution & tuple shape ─────────────────────────────
let entries = 0;
const unresolvable = new Map();
let badShape = 0;
const badShapeSamples = [];
const books = fs
  .readdirSync(strongsDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const data = new Map();
for (const f of books) {
  const j = JSON.parse(fs.readFileSync(path.join(strongsDir, f), "utf8"));
  data.set(j.book, j.verses);
  for (const [key, list] of Object.entries(j.verses)) {
    for (const tuple of list) {
      entries++;
      const [, num, surface, translit] = tuple;
      if (!lexicon[num]) unresolvable.set(num, (unresolvable.get(num) ?? 0) + 1);
      // every entry carries a surface form + transliteration, with no
      // leftover STEPBible markup (morpheme slashes, punctuation tokens)
      if (
        tuple.length !== 4 ||
        !surface ||
        !translit ||
        /[\\/()¶]/.test(surface + translit)
      ) {
        badShape++;
        if (badShapeSamples.length < 8) {
          badShapeSamples.push(`${j.book} ${key}: ${JSON.stringify(tuple)}`);
        }
      }
    }
  }
}
if (unresolvable.size) {
  failures++;
  console.error(
    `FAIL: ${unresolvable.size} numbers unresolvable in lexicon:`,
    [...unresolvable.entries()].slice(0, 10),
  );
} else {
  console.log(`OK: all ${entries} word entries resolve in the lexicon.`);
}
if (badShape) {
  failures++;
  console.error(
    `FAIL: ${badShape} entries missing/dirty surface form or transliteration:`,
    badShapeSamples,
  );
} else {
  console.log("OK: every entry has a clean surface form + transliteration.");
}

// ── 2. Coverage vs BSB ──────────────────────────────────────────────
let bsbVerses = 0;
let missingWordLists = 0;
let extraWordLists = 0;
const missingSamples = [];
for (const [book, verses] of data) {
  const bsbFile = path.join(bsbDir, `${book}.json`);
  if (!fs.existsSync(bsbFile)) continue;
  const bsb = JSON.parse(fs.readFileSync(bsbFile, "utf8"));
  const bsbKeys = new Set();
  for (const ch of bsb.chapters) {
    for (const m of ch.html.matchAll(/data-number="(\d+)"/g)) {
      bsbKeys.add(`${ch.chapter}:${m[1]}`);
      bsbVerses++;
    }
  }
  for (const key of bsbKeys) {
    if (!verses[key]) {
      missingWordLists++;
      if (missingSamples.length < 12) missingSamples.push(`${book} ${key}`);
    }
  }
  for (const key of Object.keys(verses)) {
    if (!bsbKeys.has(key)) extraWordLists++;
  }
}
console.log(
  `Coverage: ${bsbVerses} BSB verses; ${missingWordLists} without word lists` +
    `${missingSamples.length ? ` (${missingSamples.join("; ")}${missingWordLists > 12 ? "; …" : ""})` : ""}; ` +
    `${extraWordLists} word lists with no BSB verse.`,
);

// ── 3. Known-answer spot checks ─────────────────────────────────────
const CHECKS = [
  // [book, "c:v", mustInclude [wordSubstring, num, translit?], mustExclude [wordSubstring, num]]
  // translit (when given) is the exact expected surface-form transliteration:
  // the inflected word from the text, not the lexicon's dictionary form
  // (John 1:1 must show theon/θεόν, not theos/θεός).
  {
    book: "John", key: "1:1",
    include: [
      ["beginning", "G746", "archē"],
      ["with", "G4314", "pros"],
      ["Word", "G3056", "logos"],
      ["was", "G1510", "ēn"],
      ["God", "G2316", "theon"],
    ],
    exclude: [["with", "G1722"]],
  },
  {
    book: "Genesis", key: "1:1",
    include: [
      ["beginning", "H7225", "bereshit"],
      ["created", "H1254", "bara'"],
      ["God", "H430", "'elohim"],
      ["heavens", "H8064", "hashamayim"],
    ],
    exclude: [],
  },
  {
    book: "Psalms", key: "23:1",
    include: [["shepherd", "H7462"]],
    exclude: [],
  },
  {
    book: "Matthew", key: "6:8",
    include: [["known", "G1492"]], // extended G6063 must resolve by lemma
    exclude: [["known", "G6063"]],
  },
];
for (const { book, key, include, exclude } of CHECKS) {
  const list = data.get(book)?.[key] ?? [];
  for (const [wordSub, num, translit] of include) {
    const hit = list.find(
      ([w, n]) => n === num && w.toLowerCase().includes(wordSub.toLowerCase()),
    );
    if (!hit) {
      failures++;
      console.error(`FAIL: ${book} ${key} missing [${wordSub}, ${num}]. Got:`, JSON.stringify(list));
    } else if (translit && hit[3] !== translit) {
      failures++;
      console.error(`FAIL: ${book} ${key} [${wordSub}, ${num}] transliterated "${hit[3]}", expected "${translit}".`);
    }
  }
  for (const [wordSub, num] of exclude) {
    const hit = list.find(
      ([w, n]) => n === num && w.toLowerCase().includes(wordSub.toLowerCase()),
    );
    if (hit) {
      failures++;
      console.error(`FAIL: ${book} ${key} contains forbidden [${wordSub}, ${num}].`);
    }
  }
}

// The list is an interlinear — reading the transliteration column top to
// bottom must read the verse itself: repeated words, articles, and
// untranslated markers (Hebrew object marker) included.
const VERSE_CHECKS = [
  ["John", "1:1", "En archē ēn ho logos kai ho logos ēn pros ton theon kai theos ēn ho logos"],
  ["Genesis", "1:1", "bereshit bara' 'elohim 'et hashamayim ve'et ha'aretz"],
];
for (const [book, key, expected] of VERSE_CHECKS) {
  const got = (data.get(book)?.[key] ?? []).map((t) => t[3]).join(" ");
  if (got !== expected) {
    failures++;
    console.error(`FAIL: ${book} ${key} reads "${got}", expected "${expected}".`);
  }
}
if (!failures) console.log("OK: all known-answer spot checks pass.");

process.exit(failures ? 1 : 0);
