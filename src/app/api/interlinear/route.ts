import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { isProtestantCanonBook } from "@/lib/bible-book-order";

/**
 * Reverse interlinear for one verse: each original-language word with the BSB's
 * rendering of it, plus a Greek-order and a BSB-order sort key so the client
 * can show two aligned sentences that link word by word. Word alignment from
 * the public-domain BSB Translation Tables (bereanbible.com); definitions
 * joined from the Strong's dictionaries (openscriptures, CC-BY-SA) by number.
 *
 * GET /api/interlinear?book=John&chapter=3&verse=16
 * → { words: [{ id, orig, translit, parse, strong, bsb, gkSort, bsbSort, lemma, def, kjv }] }
 */

// [orig, translit, parse, strong, bsb, gkSort, bsbSort, gloss]
type WordTuple = [string, string, string, string, string, number, number, string];
// [text, link, strong] — link is a `words` id, or negative if the KJV word has no Greek partner
type KjvTuple = [string, number, string];
type LexEntry = { lemma: string; translit: string; def: string; kjv: string };

const bookCache = new Map<string, Record<string, WordTuple[]> | null>();
const kjvCache = new Map<string, Record<string, KjvTuple[]> | null>();
let lexiconCache: Record<string, LexEntry> | null = null;

function loadVerses<T>(dir: string, book: string, cache: Map<string, Record<string, T[]> | null>) {
  const cached = cache.get(book);
  if (cached !== undefined) return cached;
  const file = join(process.cwd(), "data", dir, `${book}.json`);
  let verses: Record<string, T[]> | null = null;
  if (existsSync(file)) {
    try {
      verses = (JSON.parse(readFileSync(file, "utf-8")) as { verses: Record<string, T[]> }).verses;
    } catch {
      verses = null;
    }
  }
  cache.set(book, verses);
  return verses;
}

const loadWords = (book: string) => loadVerses<WordTuple>("interlinear", book, bookCache);
const loadKjv = (book: string) => loadVerses<KjvTuple>("interlinear-kjv", book, kjvCache);

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

  const words = tuples.map(([orig, translit, parse, strong, bsb, gkSort, bsbSort, gloss], id) => {
    const entry = lexicon[strong];
    return {
      id,
      orig,
      translit,
      parse,
      strong,
      bsb,
      gkSort,
      bsbSort,
      gloss: gloss ?? "",
      lemma: entry?.lemma ?? "",
      def: entry?.def ?? "",
      kjv: entry?.kjv ?? "",
    };
  });

  const kjv = (loadKjv(book)?.[`${chapter}:${verse}`] ?? []).map(([text, link, strong]) => {
    const entry = lexicon[strong];
    return {
      text,
      link,
      strong,
      lemma: entry?.lemma ?? "",
      translit: entry?.translit ?? "",
      def: entry?.def ?? "",
    };
  });

  return NextResponse.json({ words, kjv });
}
