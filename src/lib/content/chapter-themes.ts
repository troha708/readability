/**
 * Per-chapter theme index: the Tyndale theme essays that cite a given chapter.
 *
 * Built by scripts/build-chapter-themes.mts from the essays' prose citations —
 * they carry no structured anchors, so the references are parsed with the same
 * parseScriptureRefs the notes use. Ids are the dictionary's, so an entry opens
 * at /try/bible/dictionary?entry=<id> like any other article.
 *
 * Shape mirrors the place index: whole book per request, sliced per chapter by
 * the client.
 */

/** [dictionary id, display title, how many times it cites this chapter]. */
export type ThemeTuple = [string, string, number];

export type ChapterTheme = {
  id: string;
  title: string;
  /** Citations of this chapter in that essay — the ranking, not a badge. */
  refs: number;
};

/** Chapter number (as a string key) -> the essays citing it, most first. */
export type RawBookThemes = { book: string; chapters: Record<string, ThemeTuple[]> };

export type BookThemes = Record<string, ChapterTheme[]>;

export function parseBookThemes(raw: RawBookThemes): BookThemes {
  const out: BookThemes = {};
  for (const [chapter, rows] of Object.entries(raw.chapters ?? {})) {
    out[chapter] = rows.map(([id, title, refs]) => ({ id, title, refs }));
  }
  return out;
}
