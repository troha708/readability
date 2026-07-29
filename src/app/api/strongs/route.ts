import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { isProtestantCanonBook } from "@/lib/bible-book-order";

/**
 * Original-language interlinear for one verse: every word in text order from
 * STEPBible's word-level tagging (TAGNT/TAHOT, CC BY 4.0), joined to the
 * Strong's dictionaries (openscriptures JSON, CC-BY-SA). `surface` is the
 * word as written in the text (θεόν in John 1:1); `lemma` is the dictionary
 * form the definition belongs to (θεός).
 *
 * GET /api/strongs?book=Genesis&chapter=1&verse=1
 * → { words: [{ word, num, surface, surfaceTranslit, lemma, translit, def, kjv }] }
 */

type WordTuple = [string, string, string, string]; // [gloss, "H7225", surface, surface translit]
type LexEntry = { lemma: string; translit: string; def: string; kjv: string };

const bookCache = new Map<string, Record<string, WordTuple[]> | null>();
let lexiconCache: Record<string, LexEntry> | null = null;

function loadWords(book: string): Record<string, WordTuple[]> | null {
  const cached = bookCache.get(book);
  if (cached !== undefined) return cached;
  const file = join(process.cwd(), "data", "strongs", `${book}.json`);
  let verses: Record<string, WordTuple[]> | null = null;
  if (existsSync(file)) {
    try {
      verses = (JSON.parse(readFileSync(file, "utf-8")) as { verses: Record<string, WordTuple[]> }).verses;
    } catch {
      verses = null;
    }
  }
  bookCache.set(book, verses);
  return verses;
}

function loadLexicon(): Record<string, LexEntry> {
  if (!lexiconCache) {
    try {
      lexiconCache = JSON.parse(
        readFileSync(join(process.cwd(), "data", "lexicon", "strongs.json"), "utf-8"),
      ) as Record<string, LexEntry>;
    } catch {
      lexiconCache = {};
    }
  }
  return lexiconCache;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";
  const chapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const verse = parseInt(searchParams.get("verse") ?? "", 10);

  if (!isProtestantCanonBook(book) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const tuples = loadWords(book)?.[`${chapter}:${verse}`] ?? [];
  const lexicon = loadLexicon();

  const words = tuples.flatMap(([word, num, surface, surfaceTranslit]) => {
    const entry = lexicon[num];
    if (!entry) return [];
    return [{ word, num, surface: surface ?? "", surfaceTranslit: surfaceTranslit ?? "", ...entry }];
  });

  return NextResponse.json({ words });
}
