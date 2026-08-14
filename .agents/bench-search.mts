// Times searchVerses directly against the on-disk BSB index, away from the
// dev server, whose recompiles and per-request overhead swamp the thing being
// measured. Run: npx --yes tsx .agents/bench-search.mts
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  CANONICAL_BOOK_ORDER,
  buildVerseIndex,
  searchVerses,
  type IndexedVerse,
} from "../src/lib/search/verse-search.ts";

const dir = join(process.cwd(), "data", "BSB");
const index: IndexedVerse[] = [];
for (const book of CANONICAL_BOOK_ORDER) {
  const file = join(dir, `${book}.json`);
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, "utf-8")) as {
    chapters?: { chapter: number; html?: string }[];
  };
  for (const ch of data.chapters ?? []) {
    index.push(...buildVerseIndex(book, ch.chapter, ch.html ?? ""));
  }
}
console.log(`index: ${index.length} verses\n`);

const QUERIES = [
  "pick up your cross", //          has synonyms (pick -> take/carry/lift)
  "love your enemies", //           has synonyms (love, enemies)
  "in the beginning was the word", // no synonyms at all
  "the lord is my shepherd", //     no synonyms at all
  "pick up your cross and follow me",
];

const RUNS = 40;
for (const q of QUERIES) {
  searchVerses(index, q); // warm
  const t0 = process.hrtime.bigint();
  let n = 0;
  for (let i = 0; i < RUNS; i++) n = searchVerses(index, q).length;
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6 / RUNS;
  console.log(`${ms.toFixed(1).padStart(7)}ms  ${String(n).padStart(4)} hits  ${q}`);
}
