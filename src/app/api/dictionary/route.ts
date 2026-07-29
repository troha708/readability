import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  dictLetterOf,
  type DictArticle,
  type DictIndexTuple,
} from "@/lib/content/dictionary";

/**
 * Tyndale Open Bible Dictionary (Tyndale House Publishers, CC BY-SA 4.0 —
 * data/tyndale-dictionary/_attribution.json).
 *
 * GET /api/dictionary                → { entries: [[id, title, letter, words, cat], …] }
 * GET /api/dictionary?id=Melchizedek  → { article: { id, t, b } } | 404
 * GET /api/dictionary?aliases=1       → { aliases: { targetId: [name, …] } }
 */

const DIR = join(process.cwd(), "data", "tyndale-dictionary");

let indexCache: DictIndexTuple[] | null | undefined;
let aliasCache: Record<string, string[]> | null | undefined;

function loadAliases(): Record<string, string[]> | null {
  if (aliasCache !== undefined) return aliasCache;
  try {
    aliasCache = JSON.parse(
      readFileSync(join(DIR, "_place-aliases.json"), "utf-8"),
    ) as Record<string, string[]>;
  } catch {
    aliasCache = null;
  }
  return aliasCache;
}
const letterCache = new Map<string, Record<string, Omit<DictArticle, "id">> | null>();

function loadIndex(): DictIndexTuple[] | null {
  if (indexCache !== undefined) return indexCache;
  const file = join(DIR, "_index.json");
  try {
    indexCache = (JSON.parse(readFileSync(file, "utf-8")) as { entries: DictIndexTuple[] }).entries;
  } catch {
    indexCache = null;
  }
  return indexCache;
}

function loadLetter(letter: string): Record<string, Omit<DictArticle, "id">> | null {
  const cached = letterCache.get(letter);
  if (cached !== undefined) return cached;
  const file = join(DIR, `${letter}.json`);
  let articles: Record<string, Omit<DictArticle, "id">> | null = null;
  if (existsSync(file)) {
    try {
      articles = (JSON.parse(readFileSync(file, "utf-8")) as {
        articles: Record<string, Omit<DictArticle, "id">>;
      }).articles;
    } catch {
      articles = null;
    }
  }
  letterCache.set(letter, articles);
  return articles;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    // Ids are alphanumeric keys; reject anything that couldn't be one.
    if (!/^[A-Za-z0-9]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const article = loadLetter(dictLetterOf(id))?.[id];
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ article: { id, ...article } });
  }

  if (searchParams.get("aliases")) {
    const aliases = loadAliases();
    if (!aliases) {
      return NextResponse.json({ error: "Aliases unavailable" }, { status: 500 });
    }
    return NextResponse.json({ aliases });
  }

  const entries = loadIndex();
  if (!entries) {
    return NextResponse.json({ error: "Dictionary unavailable" }, { status: 500 });
  }
  return NextResponse.json({ entries });
}
