import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { isProtestantCanonBook } from "@/lib/bible-book-order";
import type { RawBookThemes } from "@/lib/content/chapter-themes";

/**
 * Which Tyndale theme essays cite each chapter of one book, built by
 * scripts/build-chapter-themes.mts from the essays' own prose citations.
 *
 * Whole book per request, like /api/places: the client caches it and slices
 * per chapter, so reading through a book costs one fetch rather than one per
 * chapter.
 *
 * GET /api/chapter-themes?book=Romans
 * → { book, chapters: { "8": [[id, title, refCount], …] } }
 */

const bookCache = new Map<string, RawBookThemes | null>();

function loadThemes(book: string): RawBookThemes | null {
  const cached = bookCache.get(book);
  if (cached !== undefined) return cached;
  const file = join(process.cwd(), "data", "chapter-themes", `${book}.json`);
  let themes: RawBookThemes | null = null;
  if (existsSync(file)) {
    try {
      themes = JSON.parse(readFileSync(file, "utf-8")) as RawBookThemes;
    } catch {
      themes = null;
    }
  }
  bookCache.set(book, themes);
  return themes;
}

export function GET(req: NextRequest) {
  const book = req.nextUrl.searchParams.get("book");
  if (!book || !isProtestantCanonBook(book)) {
    return NextResponse.json({ error: "unknown book" }, { status: 400 });
  }
  const themes = loadThemes(book);
  if (!themes) {
    // A book no essay happens to cite is a normal outcome, not an error —
    // the reader just shows no Themes row for it.
    return NextResponse.json(
      { book, chapters: {} },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
    );
  }
  return NextResponse.json(themes, {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
