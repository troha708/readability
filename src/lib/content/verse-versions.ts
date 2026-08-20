import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { extractVerses } from "@/lib/search/verse-search";
import { extractVerseFragments } from "@/lib/content/verse-markup";
import { COMPARE_VERSIONS, TRANSLATION_NAMES } from "@/lib/translations";

/**
 * Server-side single-verse lookup across every offered translation, for the
 * reader's verse sheet ("Compare translations"). Reads the same on-disk
 * chapter JSON the seed scripts load into Supabase; extracted verse maps are
 * cached per version+book for the life of the server instance.
 */

/**
 * `html` is the verse with its source formatting kept — poetry lines,
 * supplied words, the divine name, words of Jesus — and `quote` is the
 * same verse as plain text with its line breaks and indents intact. Both
 * are for copying; `text` stays the flat, search-consistent form the sheet
 * displays. Absent for licensed translations, which arrive as plain text
 * from the publisher API; a copy then falls back to `text`.
 */
export type VerseVersion = {
  abbr: string;
  name: string;
  text: string;
  html?: string;
  quote?: string;
};

// version/book → chapter → verse → { text, html }
type Entry = { text: string; html?: string; quote?: string };
const bookCache = new Map<string, Map<number, Map<number, Entry>>>();

function loadBookVerses(
  version: string,
  book: string,
): Map<number, Map<number, Entry>> | null {
  const key = `${version}/${book}`;
  const cached = bookCache.get(key);
  if (cached) return cached;

  const file = join(process.cwd(), "data", version, `${book}.json`);
  if (!existsSync(file)) return null;

  try {
    const data = JSON.parse(readFileSync(file, "utf-8")) as {
      chapters?: { chapter: number; html?: string }[];
    };
    const chapters = new Map<number, Map<number, Entry>>();
    for (const ch of data.chapters ?? []) {
      const verses = new Map<number, Entry>();
      // extractVerses stays the source of truth for the text — search and the
      // sheet must not disagree about what a verse says. The fragments only
      // add the formatting alongside it.
      const fragments = extractVerseFragments(ch.html ?? "");
      for (const v of extractVerses(ch.html ?? "")) {
        const fragment = fragments.get(v.verse);
        verses.set(v.verse, { text: v.text, html: fragment?.html, quote: fragment?.text });
      }
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
    const entry = loadBookVerses(abbr, book)?.get(chapter)?.get(verse);
    if (entry) {
      out.push({
        abbr,
        name: TRANSLATION_NAMES[abbr] ?? abbr,
        text: entry.text,
        html: entry.html,
        quote: entry.quote,
      });
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
    const entry = verses.get(v);
    if (entry) out.push({ verse: v, text: entry.text });
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
    loadBookVerses(version, book)?.get(chapter)?.get(verse)?.text ??
    (version !== "BSB"
      ? (loadBookVerses("BSB", book)?.get(chapter)?.get(verse)?.text ?? null)
      : null)
  );
}
