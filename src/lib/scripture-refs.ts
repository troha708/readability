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

/**
 * Does a parsed reference point at this verse?
 *
 * The four shapes the parser emits each cover a different span, and a range
 * has to match anywhere inside it, not just at its first verse — a note citing
 * "Romans 8:28-30" is about verse 29 as much as verse 28.
 */
export function passageCoversVerse(
  passage: ScripturePassage,
  book: string,
  chapter: number,
  verse: number,
): boolean {
  if (passage.book !== book) return false;

  // Chapter-only ("Isaiah 40") or a chapter range ("Leviticus 13-14"): every
  // verse of every chapter in the span.
  if (passage.verse == null) {
    return chapter >= passage.chapter && chapter <= (passage.endChapter ?? passage.chapter);
  }

  // Cross-chapter verse range ("Genesis 1:31-2:1"): open at the far end of the
  // first chapter and at the near end of the last, whole chapters between.
  if (passage.endChapter != null && passage.endVerse != null) {
    if (chapter < passage.chapter || chapter > passage.endChapter) return false;
    if (chapter === passage.chapter && verse < passage.verse) return false;
    if (chapter === passage.endChapter && verse > passage.endVerse) return false;
    return true;
  }

  // Single verse or a range inside one chapter.
  return (
    chapter === passage.chapter &&
    verse >= passage.verse &&
    verse <= (passage.endVerse ?? passage.verse)
  );
}

// Notes cite books both in full and abbreviated. The abbreviations are the
// Tyndale corpus's own, counted across data/tyndale and data/tyndale-intros —
// "1 Cor" alone appears 464 times, "2 Kgs" 483, "1 Sam" 379. Until these were
// listed, none of them matched a book, so the bare-reference pass below
// claimed the bare "4:14-17" out of "1 Cor 4:14-17" and resolved it against
// whatever book was open: an Ephesians note linked to Ephesians 4:14-17.
//
// Variants are listed where the corpus uses them (1 Thes / 1 Thess, Ps / Pss).
// "Phil" is Philippians and "Phlm" Philemon — the pair worth being careful
// about, since one is a common prefix of the other's full name.
const BOOK_ALIASES: Record<string, string> = {
  Psalm: "Psalms",
  Ps: "Psalms",
  Pss: "Psalms",
  "Song of Songs": "Song of Solomon",
  Song: "Song of Solomon",
  Gen: "Genesis",
  Exod: "Exodus",
  Ex: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Josh: "Joshua",
  Judg: "Judges",
  "1 Sam": "1 Samuel",
  "2 Sam": "2 Samuel",
  "1 Kgs": "1 Kings",
  "2 Kgs": "2 Kings",
  "1 Chr": "1 Chronicles",
  "2 Chr": "2 Chronicles",
  Neh: "Nehemiah",
  Esth: "Esther",
  Prov: "Proverbs",
  Eccl: "Ecclesiastes",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezek: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Obad: "Obadiah",
  Jon: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zeph: "Zephaniah",
  Hag: "Haggai",
  Zech: "Zechariah",
  Mal: "Malachi",
  Matt: "Matthew",
  Rom: "Romans",
  "1 Cor": "1 Corinthians",
  "2 Cor": "2 Corinthians",
  Gal: "Galatians",
  Eph: "Ephesians",
  Phil: "Philippians",
  Col: "Colossians",
  "1 Thes": "1 Thessalonians",
  "2 Thes": "2 Thessalonians",
  "1 Thess": "1 Thessalonians",
  "2 Thess": "2 Thessalonians",
  "1 Tim": "1 Timothy",
  "2 Tim": "2 Timothy",
  Phlm: "Philemon",
  Philem: "Philemon",
  Heb: "Hebrews",
  Jas: "James",
  "1 Pet": "1 Peter",
  "2 Pet": "2 Peter",
  "1 Jn": "1 John",
  "2 Jn": "2 John",
  "3 Jn": "3 John",
  Rev: "Revelation",
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
  `(?<!\\d\\s)\\b(${BOOK_PATTERN})\\.?\\s+(\\d{1,3}):(\\d{1,3})(?:[-–](\\d{1,3})(?::(\\d{1,3}))?)?`,
  "g",
);

// "Isaiah 40", "Leviticus 13-14" — a trailing ":" means it was a verse ref
// (already claimed by the pass above; the lookahead just prevents a partial
// re-match of its book-and-chapter prefix).
const CHAPTER_REF = new RegExp(
  `(?<!\\d\\s)\\b(${BOOK_PATTERN})\\.?\\s+(\\d{1,3})(?:[-–](\\d{1,3}))?\\b(?!:)`,
  "g",
);

// Same-book shorthand: "(15:38)", "(14:32-42)". The colon keeps plain numbers
// and ranges ("13 by 8", "13-14") from matching.
const BARE_REF = /\b(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3})(?::(\d{1,3}))?)?/g;

// A capitalised word — optionally with a leading numeral, optionally
// abbreviated with a full stop — sitting immediately before a bare reference.
// That shape is a book name we don't recognise, so the digits after it are NOT
// same-book shorthand and must not be resolved against the current book.
//
// This is the guard the "1 Cor" bug needed as much as the alias list: the
// corpus also cites books we deliberately don't carry — 1 Maccabees, Sirach,
// 2 Baruch, Tobit, 1 Enoch, the Mishnah tract Gittin — and without it those
// become links to whatever chapter is open. An unrecognised book now yields
// plain text, which is the honest outcome.
//
// Deliberately only capitalised words: "see 15:38" and "verses 15:38" are
// genuine shorthand and keep working, because a lower-case word before the
// digits is prose, not a citation.
const PRECEDING_BOOK_WORD = /(?:^|[\s(])(?:[1-4]\s*)?[A-Z][A-Za-z]*\.?\s+$/;

// Nothing but list punctuation and further verse numbers between two
// references — the second continues the first's book. Citations run
// "1 Chr 15:18, 21; 16:38; 26:4, 8, 15": the bare verses between the
// chapter:verse pairs are part of the same list, so the separator has to
// tolerate them or the chain breaks at the first "…, 21; …" and everything
// after it falls back to the wrong book. Anything wordier ("… 12:9. Later,
// 14:33 …") is a new sentence and gets no inheritance.
const LIST_SEPARATOR = /^[\s,;]*(?:\d{1,3}(?:[-–]\d{1,3})?[\s,;]*)*(?:and\s+|or\s+)?$/i;

/**
 * The book a bare reference continues from, or null if it starts fresh.
 *
 * Citation lists name the book once: "1 Cor 12:9-10, 14:33-36, 15:1-8". Read
 * as same-book shorthand, the tail of that list points at the chapter being
 * read instead — which is how a note in 1 Timothy (six chapters) came to link
 * to 1 Timothy 14:33-36. Where the number happens to exist in the current
 * book the link is worse still, because it goes somewhere real and wrong.
 */
type Span = { index: number; length: number; book: string };

/** End offset of the span closest before `index`, or -1 if there is none. */
function nearestEnd(spans: readonly Span[], index: number): number {
  let best = -1;
  for (const s of spans) {
    const end = s.index + s.length;
    if (end <= index && end > best) best = end;
  }
  return best;
}

function continuedBook(text: string, index: number, found: readonly Span[]): string | null {
  let prior: Span | null = null;
  for (const r of found) {
    const end = r.index + r.length;
    if (end <= index && (!prior || end > prior.index + prior.length)) prior = r;
  }
  if (!prior) return null;
  return LIST_SEPARATOR.test(text.slice(prior.index + prior.length, index))
    ? prior.book
    : null;
}

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

  // Spans we refused to link because they cite a book we don't recognise.
  // Tracked so that the rest of such a citation's list is refused too:
  // "1 Maccabees 2:18; 6:28" must drop both halves, not just the first.
  const suppressed: { index: number; length: number; book: string }[] = [];

  for (const m of text.matchAll(BARE_REF)) {
    if (!isFree(m.index, m.index + m[0].length)) continue;
    const unknownBook = PRECEDING_BOOK_WORD.test(text.slice(0, m.index));
    // A continuation of an unrecognised citation is itself unrecognised —
    // and `suppressed` must win over `refs` when it is the nearer of the two,
    // or "…; 6:28" would inherit from whatever legitimate reference happened
    // to come before the apocryphal one.
    const continuesSuppressed =
      continuedBook(text, m.index, suppressed) !== null &&
      (continuedBook(text, m.index, refs) === null ||
        nearestEnd(suppressed, m.index) > nearestEnd(refs, m.index));
    if (unknownBook || continuesSuppressed) {
      suppressed.push({ index: m.index, length: m[0].length, book: "" });
      continue;
    }
    const ref: ScriptureRef = {
      index: m.index,
      length: m[0].length,
      book: continuedBook(text, m.index, refs) ?? currentBook,
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
