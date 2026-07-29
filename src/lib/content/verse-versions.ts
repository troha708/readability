import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { extractVerses } from "@/lib/search/verse-search";
import { COMPARE_VERSIONS, TRANSLATION_NAMES } from "@/lib/translations";

/**
 * Server-side single-verse lookup across every offered translation, for the
 * reader's verse sheet ("Compare translations"). Reads the same on-disk
 * chapter JSON the seed scripts load into Supabase; extracted verse maps are
 * cached per version+book for the life of the server instance.
 */

export type VerseVersion = { abbr: string; name: string; text: string };

// version/book → chapter → verse → text
const bookCache = new Map<string, Map<number, Map<number, string>>>();

function loadBookVerses(
  version: string,
  book: string,
): Map<number, Map<number, string>> | null {
  const key = `${version}/${book}`;
  const cached = bookCache.get(key);
  if (cached) return cached;

  const file = join(process.cwd(), "data", version, `${book}.json`);
  if (!existsSync(file)) return null;

  try {
    const data = JSON.parse(readFileSync(file, "utf-8")) as {
      chapters?: { chapter: number; html?: string }[];
    };
    const chapters = new Map<number, Map<number, string>>();
    for (const ch of data.chapters ?? []) {
      const verses = new Map<number, string>();
      for (const v of extractVerses(ch.html ?? "")) verses.set(v.verse, v.text);
      chapters.set(ch.chapter, verses);
    }
    bookCache.set(key, chapters);
    return chapters;
  } catch {
    return null;
  }
}

export function getVerseVersions(
  book: string,
  chapter: number,
  verse: number,
): VerseVersion[] {
  const out: VerseVersion[] = [];
  for (const abbr of COMPARE_VERSIONS) {
    const text = loadBookVerses(abbr, book)?.get(chapter)?.get(verse);
    if (text) {
      out.push({ abbr, name: TRANSLATION_NAMES[abbr] ?? abbr, text });
    }
  }
  return out;
}

/**
 * A run of verses in one translation, for the note-reference peek. Verses
 * missing from the source (or beyond the chapter's end) are simply skipped.
 */
export function getVerseRange(
  version: string,
  book: string,
  chapter: number,
  start: number,
  end: number,
): { verse: number; text: string }[] {
  const verses = loadBookVerses(version, book)?.get(chapter);
  if (!verses) return [];
  const out: { verse: number; text: string }[] = [];
  for (let v = start; v <= end; v++) {
    const text = verses.get(v);
    if (text) out.push({ verse: v, text });
  }
  return out;
}

/** One verse's text in one translation (BSB fallback), for previews. */
export function getVerseText(
  version: string,
  book: string,
  chapter: number,
  verse: number,
): string | null {
  return (
    loadBookVerses(version, book)?.get(chapter)?.get(verse) ??
    (version !== "BSB"
      ? (loadBookVerses("BSB", book)?.get(chapter)?.get(verse) ?? null)
      : null)
  );
}
