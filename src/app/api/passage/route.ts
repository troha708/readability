import { NextRequest, NextResponse } from "next/server";
import { getVerseRange } from "@/lib/content/verse-versions";
import { isProtestantCanonBook } from "@/lib/bible-book-order";
import { COMPARE_VERSIONS } from "@/lib/translations";

/** Hard cap on peeked verses — a peek is a glance, not a chapter. */
const MAX_VERSES = 12;

/**
 * A short run of verses in one translation, for the reader's note-reference
 * peek. Falls back to BSB when the requested translation lacks the passage.
 *
 * GET /api/passage?book=Malachi&chapter=4&verse=5&end=6&version=BSB
 * → { version: "BSB", verses: [{ verse, text }] }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";
  const chapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const start = parseInt(searchParams.get("verse") ?? "1", 10);
  const end = parseInt(searchParams.get("end") ?? String(start), 10);
  // The version becomes a file path segment; accept offered translations only.
  const requested = searchParams.get("version") ?? "BSB";
  const version = COMPARE_VERSIONS.includes(requested) ? requested : "BSB";

  if (
    !isProtestantCanonBook(book) ||
    !Number.isFinite(chapter) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 1 ||
    end < start
  ) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const capped = Math.min(end, start + MAX_VERSES - 1);
  let used = version;
  let verses = getVerseRange(version, book, chapter, start, capped);
  if (verses.length === 0 && version !== "BSB") {
    used = "BSB";
    verses = getVerseRange("BSB", book, chapter, start, capped);
  }
  if (verses.length === 0) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  return NextResponse.json({ version: used, verses });
}
