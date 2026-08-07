/**
 * Gate for note cross-references: every scripture reference the reader turns
 * into a link must point at a book we ship and a chapter that exists.
 *
 * Written after a bug report — an Ephesians note citing "1 Cor 4:14-17" linked
 * to Ephesians 4:14-17 — which turned out to be two faults at once: no
 * abbreviations in the book table, and citation lists ("1 Chr 15:18, 21;
 * 16:38") whose continuations fell back to the chapter being read. Both are
 * silent when the number happens to exist in the current book, so this checks
 * the whole corpus rather than trusting spot checks.
 *
 *   npx tsx scripts/validate-scripture-refs.mts
 *
 * Exits non-zero on any reference to an unknown book or a chapter past the end
 * of a real one. Citation-shaped text we deliberately DON'T link (apocrypha,
 * rabbinic tracts) is printed for review, not failed on.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parseScriptureRefs, scriptureRefLabel } from "@/lib/scripture-refs";
import { BIBLE_BOOK_ORDER } from "@/lib/bible-book-order";
import { loadChapterNumbers } from "@/lib/content/chapter-text";

const canon = BIBLE_BOOK_ORDER as readonly string[];

// Real chapter counts from the shipped BSB text: a link to a chapter that
// doesn't exist is a dead destination, so it counts as a failure too.
const maxChapter = new Map<string, number>();
for (const b of canon) {
  const nums = loadChapterNumbers("BSB", b) ?? [];
  if (nums.length) maxChapter.set(b, Math.max(...nums));
}

const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".json")) files.push(p);
  }
};
for (const d of ["data/tyndale", "data/tyndale-intros"]) walk(d);

let refs = 0;
let checkedFiles = 0;
const skipped: string[] = [];
const unknownBook = new Map<string, number>();
const outOfRange: string[] = [];
const notLinked = new Map<string, number>();

// Anything shaped like a citation, so we can see what we chose NOT to link.
const CITATION = /(?:([1-4])\s*)?([A-Z][A-Za-z]{1,14})\.?\s+(\d{1,3}):(\d{1,3})/g;

for (const file of files) {
  const base = basename(file, ".json");
  if (!canon.includes(base)) {
    skipped.push(base);
    continue;
  }
  checkedFiles++;
  // Walk the actual string values. Stringifying the whole file inserts
  // quotes and escapes between fields, which invents separators the reader
  // never sees and would hide the citation-list case entirely.
  const strings: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  try {
    collect(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    continue;
  }
  const text = strings.join("\n");

  const parsed = parseScriptureRefs(text, base, -1);
  const covered: [number, number][] = [];
  for (const r of parsed) {
    refs++;
    covered.push([r.index, r.index + r.length]);
    const top = maxChapter.get(r.book);
    if (top == null) {
      unknownBook.set(r.book, (unknownBook.get(r.book) ?? 0) + 1);
      continue;
    }
    if (r.chapter < 1 || r.chapter > top || (r.endChapter != null && r.endChapter > top)) {
      const ctx = text.slice(Math.max(0, r.index - 70), r.index + r.length + 15).replace(/\s+/g, " ");
      outOfRange.push(`${base}: -> ${scriptureRefLabel(r)} (max ${top})\n        …${ctx}…`);
    }
  }

  for (const m of text.matchAll(CITATION)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (covered.some(([a, b]) => s >= a && e <= b)) continue;
    const name = ((m[1] ?? "") + " " + m[2]).trim();
    notLinked.set(name, (notLinked.get(name) ?? 0) + 1);
  }
}

const top = (m: Map<string, number>, n = 30) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

console.log(`files checked: ${checkedFiles} (skipped non-book: ${skipped.join(", ") || "none"})`);
console.log(`references linked: ${refs}`);
console.log(`UNKNOWN BOOK: ${unknownBook.size ? JSON.stringify(top(unknownBook)) : "none"}`);
console.log(`OUT-OF-RANGE CHAPTER: ${outOfRange.length}`);
for (const p of outOfRange.slice(0, 15)) console.log("   " + p);
console.log(`citation-shaped but NOT linked: ${JSON.stringify(top(notLinked))}`);

const failures = unknownBook.size + outOfRange.length;
if (failures > 0) {
  console.error(`FAILED: ${failures} reference(s) point somewhere that doesn't exist.`);
  process.exit(1);
}
console.log("OK: every linked reference resolves to a real book and chapter.");
