/**
 * Detects scripture references inside note and book-introduction prose so the
 * reader can tap one and peek at the verses without leaving the chapter.
 *
 * Handled shapes:
 *   "Malachi 3:1"        book chapter:verse
 *   "Daniel 7:13-14"     verse range
 *   "Genesis 1:31-2:1"   cross-chapter verse range
 *   "Isaiah 40"          chapter only
 *   "Leviticus 13-14"    chapter range
 *   "(15:38)"            bare chapter:verse — resolved against the current book
 *
 * References to the chapter currently being read are skipped: that text is
 * already on screen, so a link would be noise without utility.
 */
import { BIBLE_BOOK_ORDER, chapterReference } from "@/lib/bible-book-order";

/** A passage a reference points at, independent of where it was cited. */
export type ScripturePassage = {
  /** Canonical book name (e.g. "Psalms" for a "Psalm 2:7" citation). */
  book: string;
  chapter: number;
  /** Missing for chapter-only references like "Isaiah 40". */
  verse?: number;
  endVerse?: number;
  /** Set for chapter ranges ("Leviticus 13-14") and cross-chapter verse ranges. */
  endChapter?: number;
};

export type ScriptureRef = ScripturePassage & {
  /** Character offset of the reference in the source text. */
  index: number;
  length: number;
};

/** "Psalm 2:7", "Mark 14:32-42", "Leviticus 13-14" — display label for a ref. */
export function scriptureRefLabel(r: ScripturePassage): string {
  let label = chapterReference(r.book, r.chapter);
  if (r.verse != null) {
    label += `:${r.verse}`;
    if (r.endChapter != null && r.endVerse != null) {
      label += `-${r.endChapter}:${r.endVerse}`;
    } else if (r.endVerse != null) {
      label += `-${r.endVerse}`;
    }
  } else if (r.endChapter != null) {
    label += `-${r.endChapter}`;
  }
  return label;
}

// Notes cite books by full canonical name; the only variants that occur are
// the singular "Psalm 2:7" and the alternate Song title.
const BOOK_ALIASES: Record<string, string> = {
  Psalm: "Psalms",
  "Song of Songs": "Song of Solomon",
};

const BOOK_PATTERN = [
  ...(BIBLE_BOOK_ORDER as readonly string[]),
  ...Object.keys(BOOK_ALIASES),
]
  // Longest name first so e.g. "Song of Solomon" wins over "Song".
  .sort((a, b) => b.length - a.length)
  .map((n) => n.replace(/ /g, "\\s+"))
  .join("|");

function canonicalBook(matched: string): string {
  const name = matched.replace(/\s+/g, " ");
  return BOOK_ALIASES[name] ?? name;
}

// "Malachi 3:1", "Daniel 7:13-14", "Genesis 1:31-2:1"
const VERSE_REF = new RegExp(
  `\\b(${BOOK_PATTERN})\\s+(\\d{1,3}):(\\d{1,3})(?:[-–](\\d{1,3})(?::(\\d{1,3}))?)?`,
  "g",
);

// "Isaiah 40", "Leviticus 13-14" — a trailing ":" means it was a verse ref
// (already claimed by the pass above; the lookahead just prevents a partial
// re-match of its book-and-chapter prefix).
const CHAPTER_REF = new RegExp(
  `\\b(${BOOK_PATTERN})\\s+(\\d{1,3})(?:[-–](\\d{1,3}))?\\b(?!:)`,
  "g",
);

// Same-book shorthand: "(15:38)", "(14:32-42)". The colon keeps plain numbers
// and ranges ("13 by 8", "13-14") from matching.
const BARE_REF = /\b(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3})(?::(\d{1,3}))?)?/g;

export function parseScriptureRefs(
  text: string,
  currentBook: string,
  currentChapter?: number,
): ScriptureRef[] {
  const refs: ScriptureRef[] = [];
  const isFree = (start: number, end: number) =>
    refs.every((r) => end <= r.index || start >= r.index + r.length);

  const push = (ref: ScriptureRef) => {
    // A reference to the chapter on screen stays plain text.
    const spansOtherChapter = ref.endChapter != null && ref.endChapter !== currentChapter;
    if (
      ref.book === currentBook &&
      ref.chapter === currentChapter &&
      !spansOtherChapter
    ) {
      return;
    }
    refs.push(ref);
  };

  for (const m of text.matchAll(VERSE_REF)) {
    const ref: ScriptureRef = {
      index: m.index,
      length: m[0].length,
      book: canonicalBook(m[1]),
      chapter: parseInt(m[2], 10),
      verse: parseInt(m[3], 10),
    };
    if (m[5] != null) {
      ref.endChapter = parseInt(m[4], 10);
      ref.endVerse = parseInt(m[5], 10);
    } else if (m[4] != null) {
      ref.endVerse = parseInt(m[4], 10);
    }
    push(ref);
  }

  for (const m of text.matchAll(CHAPTER_REF)) {
    if (!isFree(m.index, m.index + m[0].length)) continue;
    const ref: ScriptureRef = {
      index: m.index,
      length: m[0].length,
      book: canonicalBook(m[1]),
      chapter: parseInt(m[2], 10),
    };
    if (m[3] != null) ref.endChapter = parseInt(m[3], 10);
    push(ref);
  }

  for (const m of text.matchAll(BARE_REF)) {
    if (!isFree(m.index, m.index + m[0].length)) continue;
    const ref: ScriptureRef = {
      index: m.index,
      length: m[0].length,
      book: currentBook,
      chapter: parseInt(m[1], 10),
      verse: parseInt(m[2], 10),
    };
    if (m[4] != null) {
      ref.endChapter = parseInt(m[3], 10);
      ref.endVerse = parseInt(m[4], 10);
    } else if (m[3] != null) {
      ref.endVerse = parseInt(m[3], 10);
    }
    push(ref);
  }

  return refs.sort((a, b) => a.index - b.index);
}
