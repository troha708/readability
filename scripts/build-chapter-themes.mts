/**
 * Per-chapter theme index: which of the 298 Tyndale theme essays cite this
 * chapter, so the reader can offer them beside the chapter map.
 *
 * The essays carry no structured anchors — the citations are plain prose — so
 * they are parsed with the same parseScriptureRefs the notes use, the one
 * audited to 41,462 references with none pointing at a book or chapter that
 * does not exist.
 *
 * Essays are ranked per chapter by how often they cite it, so a chapter's most
 * relevant essays come first rather than whatever sorts alphabetically. Ids are
 * the dictionary's, taken from _index.json rather than recomputed, so the links
 * survive the `…Theme` suffixes the merge had to add for collisions.
 *
 *   npx tsx scripts/build-chapter-themes.mts
 *
 * Output: data/chapter-themes/{Book}.json
 *   { book, chapters: { "8": [[id, title, refCount], …] } }
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseScriptureRefs } from "@/lib/scripture-refs";
import { BIBLE_BOOK_ORDER } from "@/lib/bible-book-order";

type Run = { s: string };
type Block = { h?: 2 | 3; runs: Run[] };
type Art = { t: string; b: Block[] };

const OUT = join(process.cwd(), "data", "chapter-themes");
const prose = (b: Block[] = []) =>
  b.map((x) => (x.runs ?? []).map((r) => r.s).join("")).join("\n");

// Dictionary ids for the merged theme articles, keyed by display title.
const index = JSON.parse(
  readFileSync(join(process.cwd(), "data", "tyndale-dictionary", "_index.json"), "utf8"),
) as { entries: [string, string, string, number, string?][] };
const idByTitle = new Map<string, string>();
for (const [id, title, , , cat] of index.entries) {
  if (cat === "theme") idByTitle.set(title, id);
}

const themes = (
  JSON.parse(
    readFileSync(join(process.cwd(), "data", "tyndale-themes", "articles.json"), "utf8"),
  ) as { articles: Record<string, Art> }
).articles;

// book -> chapter -> id -> count
const byBook = new Map<string, Map<number, Map<string, { title: string; n: number }>>>();
let missingId = 0;

for (const art of Object.values(themes)) {
  const id = idByTitle.get(art.t);
  if (!id) {
    missingId++;
    continue;
  }
  // " none" as the current book: an essay sits in no chapter, so bare
  // same-book shorthand has nothing to resolve against and is dropped rather
  // than guessed at.
  for (const ref of parseScriptureRefs(prose(art.b), " none", -1)) {
    if (ref.book === " none") continue;
    const chapters = byBook.get(ref.book) ?? new Map();
    byBook.set(ref.book, chapters);
    // A range spanning chapters counts for each chapter it covers.
    const last = ref.endChapter && ref.endChapter > ref.chapter ? ref.endChapter : ref.chapter;
    for (let c = ref.chapter; c <= last; c++) {
      const arts = chapters.get(c) ?? new Map();
      chapters.set(c, arts);
      const cur = arts.get(id) ?? { title: art.t, n: 0 };
      cur.n++;
      arts.set(id, cur);
    }
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let files = 0;
let pairs = 0;
let chapters = 0;
for (const book of BIBLE_BOOK_ORDER as readonly string[]) {
  const found = byBook.get(book);
  if (!found || found.size === 0) continue;
  const out: Record<string, [string, string, number][]> = {};
  for (const [chapter, arts] of [...found.entries()].sort((a, b) => a[0] - b[0])) {
    const rows = [...arts.entries()]
      .map(([id, v]) => [id, v.title, v.n] as [string, string, number])
      // Most-citing first, then alphabetical, so the ordering is stable.
      .sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]));
    out[String(chapter)] = rows;
    chapters++;
    pairs += rows.length;
  }
  writeFileSync(join(OUT, `${book}.json`), JSON.stringify({ book, chapters: out }));
  files++;
}

console.log(
  `${files} books · ${chapters} chapters · ${pairs} chapter/essay pairs` +
    (missingId ? ` · ${missingId} essays had no dictionary id` : ""),
);
if (existsSync(join(OUT, "Romans.json"))) {
  const r = JSON.parse(readFileSync(join(OUT, "Romans.json"), "utf8"));
  console.log("Romans 8 ->", (r.chapters["8"] ?? []).slice(0, 5).map((x: [string, string, number]) => `${x[1]} (${x[2]})`).join(", "));
}
