import { NextRequest, NextResponse } from "next/server";
import { getVerseVersions } from "@/lib/content/verse-versions";
import { isProtestantCanonBook } from "@/lib/bible-book-order";

/**
 * One verse across every offered translation, for the reader's verse sheet.
 *
 * GET /api/verse?book=John&chapter=3&verse=16
 * → { versions: [{ abbr, name, text }] }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";
  const chapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const verse = parseInt(searchParams.get("verse") ?? "", 10);

  // The book name becomes a file path segment; accept canon names only.
  if (!isProtestantCanonBook(book) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const versions = getVerseVersions(book, chapter, verse);
  if (versions.length === 0) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }

  return NextResponse.json({ versions });
}
