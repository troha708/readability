import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { isProtestantCanonBook } from "@/lib/bible-book-order";
import type { RawBookPlaces } from "@/lib/content/places";

/**
 * Chapter-map place index for one book, from the OpenBible.info Bible
 * Geocoding dataset (CC BY 4.0). Whole book per request: the client caches
 * it and slices per chapter, so scrolling through a book costs one fetch.
 *
 * GET /api/places?book=Genesis
 * → { book, chapters: { "12": { p: [[name, x, y, kind, uncertain, [verses], modern]], u?: [[name, [verses]]] } } }
 */

const bookCache = new Map<string, RawBookPlaces | null>();

function loadPlaces(book: string): RawBookPlaces | null {
  const cached = bookCache.get(book);
  if (cached !== undefined) return cached;
  const file = join(process.cwd(), "data", "places", `${book}.json`);
  let places: RawBookPlaces | null = null;
  if (existsSync(file)) {
    try {
      places = JSON.parse(readFileSync(file, "utf-8")) as RawBookPlaces;
    } catch {
      places = null;
    }
  }
  bookCache.set(book, places);
  return places;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";

  if (!isProtestantCanonBook(book)) {
    return NextResponse.json({ error: "Invalid book" }, { status: 400 });
  }

  const places = loadPlaces(book) ?? { book, chapters: {} };
  return NextResponse.json(places);
}
