import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  CANONICAL_BOOK_ORDER,
  buildVerseIndex,
  searchVerses,
  bookInScope,
  type IndexedVerse,
  type SearchScope,
} from "@/lib/search/verse-search";
import { PROTESTANT_PSALMS_MAX_CHAPTER } from "@/lib/bible-book-order";

/**
 * Verse-level full-text search. Reads the translation's chapter HTML from
 * data/{VERSION}/ (the same files the seed scripts load into Supabase), builds
 * an in-memory verse index once per server instance, and ranks exact-phrase
 * hits above all-words hits in canonical book order.
 *
 * GET /api/search?q=...&version=BSB&scope=all|ot|nt&limit=25&offset=0
 * → { results: [{ book, chapter, verse, text, phrase }], total, query }
 */

const indexCache = new Map<string, IndexedVerse[] | null>();

function loadIndex(version: string): IndexedVerse[] | null {
  const cached = indexCache.get(version);
  if (cached !== undefined) return cached;

  // The version becomes a path segment; allow only plausible abbreviations.
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(version)) {
    indexCache.set(version, null);
    return null;
  }
  const dir = join(process.cwd(), "data", version);
  if (!existsSync(dir)) {
    indexCache.set(version, null);
    return null;
  }

  const index: IndexedVerse[] = [];
  for (const book of CANONICAL_BOOK_ORDER) {
    const file = join(dir, `${book}.json`);
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf-8")) as {
        chapters?: { chapter: number; html?: string }[];
      };
      for (const ch of data.chapters ?? []) {
        // WEB carries the apocryphal Psalm 151; the app's canon stops at 150.
        if (book === "Psalms" && ch.chapter > PROTESTANT_PSALMS_MAX_CHAPTER) continue;
        index.push(...buildVerseIndex(book, ch.chapter, ch.html ?? ""));
      }
    } catch {
      // Unreadable book file: skip rather than fail the whole search.
    }
  }

  const result = index.length > 0 ? index : null;
  indexCache.set(version, result);
  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const version = searchParams.get("version") ?? "BSB";
  const scopeParam = searchParams.get("scope");
  const scope: SearchScope =
    scopeParam === "ot" || scopeParam === "nt" ? scopeParam : "all";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
    50,
  );
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  if (query.length < 2) {
    return NextResponse.json({ results: [], total: 0, query });
  }

  const index = loadIndex(version);
  if (!index) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  const matches = searchVerses(index, query).filter((hit) =>
    bookInScope(hit.book, scope),
  );

  return NextResponse.json({
    results: matches.slice(offset, offset + limit),
    total: matches.length,
    query,
  });
}
