import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { BIBLE_BOOK_ORDER, PROTESTANT_PSALMS_MAX_CHAPTER } from "@/lib/bible-book-order";

/**
 * Server-side loader for chapter text, read from the same data/<ABBR>/<Book>.json
 * files that seed Supabase and the offline bundle. Serving the reader from disk
 * keeps the database (and its region latency) out of the request path — Supabase
 * remains the store for auth and reading progress only.
 *
 * The chunk text is derived with the SAME block logic as scripts/seed-bible.mjs
 * and scripts/build-offline-data.mjs (one chunk per chapter, paragraph blocks
 * joined with "\n"), so all three surfaces render identical chapters. The
 * reader's parser matches <p> blocks and ignores anything between them, so the
 * join separator is not rendering-significant.
 */

/**
 * One literal path per offered translation. Doubles as the allowlist that keeps
 * user-supplied version strings out of filesystem paths; the dirs stay literal
 * so Vercel's file tracing has a static prefix to work from (the explicit
 * outputFileTracingIncludes in next.config.ts is the authoritative bundle list).
 */
const VERSION_DIRS: Record<string, string> = {
  BSB: join(process.cwd(), "data", "BSB"),
  KJV: join(process.cwd(), "data", "KJV"),
  WEB: join(process.cwd(), "data", "WEB"),
  ASV: join(process.cwd(), "data", "ASV"),
  GNV: join(process.cwd(), "data", "GNV"),
  YLT: join(process.cwd(), "data", "YLT"),
  DBY: join(process.cwd(), "data", "DBY"),
};

/** Book names come from URLs; allow only filename-shaped names ("1 Samuel",
 * "Esther (Greek)") so they can't traverse out of the data directory. */
const SAFE_BOOK_NAME = /^[A-Za-z0-9][A-Za-z0-9 ()]*$/;

type RawChapter = { chapter: number; html?: string };

export type BookText = {
  book: string;
  chapterNumbers: number[];
  chapters: Map<number, string>;
};

function splitIntoBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<p[\s>][^]*?<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) blocks.push(m[0]);
  if (blocks.length === 0 && html.trim()) blocks.push(html.trim());
  return blocks;
}

function buildChunkText(html: string): string {
  return splitIntoBlocks(html).join("\n");
}

/** Parsed books, cached for the lifetime of the server instance. Bounded by
 * the size of the data dirs themselves (tens of MB across all translations). */
const bookCache = new Map<string, BookText | null>();

export function isOfferedVersion(versionAbbr: string): boolean {
  return versionAbbr in VERSION_DIRS;
}

export function loadBookText(versionAbbr: string, bookName: string): BookText | null {
  const dir = VERSION_DIRS[versionAbbr];
  if (!dir || !SAFE_BOOK_NAME.test(bookName)) return null;

  const cacheKey = `${versionAbbr}/${bookName}`;
  const cached = bookCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: BookText | null = null;
  try {
    const raw = JSON.parse(readFileSync(join(dir, `${bookName}.json`), "utf-8"));
    const chapters = new Map<number, string>();
    for (const ch of (raw.chapters ?? []) as RawChapter[]) {
      // Some sources carry Psalm 151; the app is Protestant-canon only.
      if (bookName === "Psalms" && ch.chapter > PROTESTANT_PSALMS_MAX_CHAPTER) continue;
      chapters.set(ch.chapter, buildChunkText(ch.html ?? ""));
    }
    if (chapters.size > 0) {
      result = {
        book: raw.book ?? bookName,
        chapterNumbers: [...chapters.keys()].sort((a, b) => a - b),
        chapters,
      };
    }
  } catch {
    // Missing or malformed book file — treated as not found.
  }

  bookCache.set(cacheKey, result);
  return result;
}

export function loadChapterText(
  versionAbbr: string,
  bookName: string,
  chapterNum: number,
): string | null {
  return loadBookText(versionAbbr, bookName)?.chapters.get(chapterNum) ?? null;
}

export function loadChapterNumbers(
  versionAbbr: string,
  bookName: string,
): number[] | null {
  return loadBookText(versionAbbr, bookName)?.chapterNumbers ?? null;
}

/** Protestant-canon books available in this translation, in canon order.
 * Existence check only — no parsing — so it stays cheap per request. */
export function listCanonBooks(versionAbbr: string): string[] {
  const dir = VERSION_DIRS[versionAbbr];
  if (!dir) return [];
  return BIBLE_BOOK_ORDER.filter((name) => existsSync(join(dir, `${name}.json`)));
}
