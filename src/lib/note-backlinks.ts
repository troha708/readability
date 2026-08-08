/**
 * Backlinks between a reader's own notes.
 *
 * A note that cites a passage — "the same promise as (Romans 8:28)" — is about
 * that passage as well as the verse it hangs on, but only the verse it hangs on
 * knows about it. This turns the citation around: open Romans 8:28 and it tells
 * you which of your notes points here, and takes you back to it.
 *
 * Nothing is stored. The links are derived from the notes themselves every time
 * they change, so they can never drift out of step with what a note actually
 * says — edit the reference out of a note and its backlink is gone with it. It
 * also means this works for a signed-out reader, whose notes only ever exist in
 * localStorage, without a table or a migration.
 */
import type { HighlightsMap } from "@/lib/highlights-service";
import {
  parseScriptureRefs,
  passageCoversVerse,
  type ScriptureRef,
} from "@/lib/scripture-refs";
import { bibleBookSortIndex } from "@/lib/bible-book-order";

/** Where a note lives, plus the references its text makes. */
type IndexedNote = {
  book: string;
  chapter: number;
  verse: number;
  note: string;
  refs: ScriptureRef[];
};

export type NoteRefIndex = IndexedNote[];

/** One note pointing at the verse being read. */
export type NoteBacklink = {
  book: string;
  chapter: number;
  verse: number;
  note: string;
  /** The citation as the reader typed it, e.g. "Romans 8:28-30". */
  citation: string;
};

/**
 * Parse every note once, so opening a verse is a comparison rather than a
 * re-parse of the whole collection.
 *
 * References resolve against the note's OWN book and chapter, not the verse
 * being read — that is what makes same-book shorthand like "(15:38)" land in
 * the right book. Passing the chapter too keeps this in step with how the note
 * renders: the parser drops references to the chapter they are written in, so a
 * citation that is deliberately not a link in the note does not become a
 * backlink either.
 */
export function buildNoteRefIndex(highlights: HighlightsMap): NoteRefIndex {
  const index: NoteRefIndex = [];
  for (const [key, highlight] of Object.entries(highlights)) {
    const note = highlight.note?.trim();
    if (!note) continue;
    // "Book:chapter:verse" — the book itself may contain no colon, and the
    // last two fields are always numeric, so split from the right.
    const parts = key.split(":");
    const verse = Number(parts.pop());
    const chapter = Number(parts.pop());
    const book = parts.join(":");
    if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse)) continue;

    const refs = parseScriptureRefs(note, book, chapter);
    if (refs.length === 0) continue;
    index.push({ book, chapter, verse, note, refs });
  }
  return index;
}

/** The reader's notes that cite this verse, in canonical order. */
export function findNoteBacklinks(
  index: NoteRefIndex,
  book: string,
  chapter: number,
  verse: number,
): NoteBacklink[] {
  const found: NoteBacklink[] = [];
  for (const entry of index) {
    // A note never links to the verse it is written on: that note is already
    // on screen, directly above where the backlink would appear.
    if (entry.book === book && entry.chapter === chapter && entry.verse === verse) {
      continue;
    }
    const hit = entry.refs.find((r) => passageCoversVerse(r, book, chapter, verse));
    if (!hit) continue;
    found.push({
      book: entry.book,
      chapter: entry.chapter,
      verse: entry.verse,
      note: entry.note,
      citation: entry.note.slice(hit.index, hit.index + hit.length),
    });
  }
  return found.sort(
    (a, b) =>
      bibleBookSortIndex(a.book) - bibleBookSortIndex(b.book) ||
      a.chapter - b.chapter ||
      a.verse - b.verse,
  );
}
