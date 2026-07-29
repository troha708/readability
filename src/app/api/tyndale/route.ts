import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { isProtestantCanonBook } from "@/lib/bible-book-order";
import { tyndaleNotesForVerse, type TyndaleTuple } from "@/lib/content/tyndale";

/**
 * Tyndale Open Study Notes covering one verse (Tyndale House Publishers,
 * CC BY-SA 4.0 — data/tyndale/_attribution.json).
 *
 * GET /api/tyndale?book=Matthew&chapter=5&verse=13
 * → { notes: [{ range: "5:13", text: "Salt was used…" }] }
 */

const bookCache = new Map<string, TyndaleTuple[] | null>();

function loadNotes(book: string): TyndaleTuple[] | null {
  const cached = bookCache.get(book);
  if (cached !== undefined) return cached;
  const file = join(process.cwd(), "data", "tyndale", `${book}.json`);
  let notes: TyndaleTuple[] | null = null;
  if (existsSync(file)) {
    try {
      notes = (JSON.parse(readFileSync(file, "utf-8")) as { notes: TyndaleTuple[] }).notes;
    } catch {
      notes = null;
    }
  }
  bookCache.set(book, notes);
  return notes;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";
  const chapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const verse = parseInt(searchParams.get("verse") ?? "", 10);

  if (!isProtestantCanonBook(book) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const tuples = loadNotes(book) ?? [];
  return NextResponse.json({ notes: tyndaleNotesForVerse(tuples, chapter, verse) });
}
