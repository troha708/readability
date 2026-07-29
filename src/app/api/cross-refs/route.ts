import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { isProtestantCanonBook } from "@/lib/bible-book-order";
import { getVerseText } from "@/lib/content/verse-versions";
import { COMPARE_VERSIONS } from "@/lib/translations";

/**
 * Cross-references for one verse, from the OpenBible.info dataset (CC-BY,
 * derived from the Treasury of Scripture Knowledge), with a preview of each
 * target verse in the requested translation.
 *
 * GET /api/cross-refs?book=John&chapter=3&verse=16&version=BSB
 * → { refs: [{ book, chapter, verse, endChapter, endVerse, text }] }
 */

type RefTuple = [string, number, number, number, number];

const bookCache = new Map<string, Record<string, RefTuple[]> | null>();

function loadRefs(book: string): Record<string, RefTuple[]> | null {
  const cached = bookCache.get(book);
  if (cached !== undefined) return cached;
  const file = join(process.cwd(), "data", "crossrefs", `${book}.json`);
  let refs: Record<string, RefTuple[]> | null = null;
  if (existsSync(file)) {
    try {
      refs = (JSON.parse(readFileSync(file, "utf-8")) as { refs: Record<string, RefTuple[]> }).refs;
    } catch {
      refs = null;
    }
  }
  bookCache.set(book, refs);
  return refs;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";
  const chapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const verse = parseInt(searchParams.get("verse") ?? "", 10);
  const versionParam = searchParams.get("version") ?? "BSB";
  const version = COMPARE_VERSIONS.includes(versionParam) ? versionParam : "BSB";

  if (!isProtestantCanonBook(book) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const tuples = loadRefs(book)?.[`${chapter}:${verse}`] ?? [];
  const refs = tuples.map(([toBook, toCh, toV, endCh, endV]) => ({
    book: toBook,
    chapter: toCh,
    verse: toV,
    endChapter: endCh || undefined,
    endVerse: endV || undefined,
    text: getVerseText(version, toBook, toCh, toV) ?? "",
  }));

  return NextResponse.json({ refs });
}
