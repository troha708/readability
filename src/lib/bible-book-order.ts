/** Protestant canon order used by roadmap and reader UI. */

export const OT_BOOK_ORDER = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
] as const;

export const NT_BOOK_ORDER = [
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;

export const BIBLE_BOOK_ORDER = [...OT_BOOK_ORDER, ...NT_BOOK_ORDER] as const;

export type BibleBookName = (typeof BIBLE_BOOK_ORDER)[number];

/** WEB and other sources may include Psalm 151 as an extra chapter; Protestant canon ends at 150. */
export const PROTESTANT_PSALMS_MAX_CHAPTER = 150;

/**
 * The singular unit a book's divisions are called. Psalms are cited as
 * "Psalm 23", not "Chapter 23"; every other book uses "Chapter".
 */
export function chapterUnit(bookName: string): string {
  return bookName === "Psalms" ? "Psalm" : "Chapter";
}

/**
 * A human reference for a book + chapter. Psalms read "Psalm 23" (singular),
 * every other book is just "<Book> <n>" (e.g. "Genesis 12").
 */
export function chapterReference(bookName: string, chapterNumber: number): string {
  if (bookName === "Psalms") return `Psalm ${chapterNumber}`;
  return `${bookName} ${chapterNumber}`;
}

/** `indexOf` on `as const` arrays expects a literal union; use this for arbitrary `string` (e.g. DB names). */
export function bibleBookSortIndex(name: string): number {
  const lower = name.toLowerCase();
  const order = BIBLE_BOOK_ORDER as readonly string[];
  // Case-insensitive: the DB stores "Song of Solomon" but the canon list above
  // uses "Song Of Solomon"; an exact match would push it to the end (999).
  const i = order.findIndex((n) => n.toLowerCase() === lower);
  return i >= 0 ? i : 999;
}

/**
 * Standard canonical genre groupings, used to label the roadmap timeline.
 * Hebrews sits with the General Letters (authorship is debated), matching
 * NT_BOOK_ORDER. "History" intentionally appears in both testaments — the
 * roadmap renders them under separate OT/NT sections, so there's no clash.
 */
const BOOK_GENRES: { genre: string; books: readonly string[] }[] = [
  { genre: "Law", books: ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"] },
  {
    genre: "History",
    books: [
      "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
      "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther",
    ],
  },
  { genre: "Wisdom & Poetry", books: ["Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon"] },
  { genre: "Major Prophets", books: ["Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel"] },
  {
    genre: "Minor Prophets",
    books: [
      "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
      "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
    ],
  },
  { genre: "Gospels", books: ["Matthew", "Mark", "Luke", "John"] },
  { genre: "History", books: ["Acts"] },
  {
    genre: "Paul's Letters",
    books: [
      "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
      "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
      "1 Timothy", "2 Timothy", "Titus", "Philemon",
    ],
  },
  {
    genre: "General Letters",
    books: ["Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude"],
  },
  { genre: "Prophecy", books: ["Revelation"] },
];

const BOOK_GENRE_BY_NAME = new Map<string, string>(
  BOOK_GENRES.flatMap(({ genre, books }) =>
    books.map((b) => [b.toLowerCase(), genre] as const),
  ),
);

/**
 * The canonical genre group (Law, Gospels, Paul's Letters, …) a book belongs
 * to, or null if unknown. Case-insensitive: the DB stores "Song of Solomon"
 * while the canon list uses "Song Of Solomon".
 */
export function bookGenre(name: string): string | null {
  return BOOK_GENRE_BY_NAME.get(name.toLowerCase()) ?? null;
}

const CANON_BOOK_NAMES_LOWER = new Set(
  (BIBLE_BOOK_ORDER as readonly string[]).map((n) => n.toLowerCase()),
);

/**
 * True for the 66 Protestant-canon books (case-insensitive). The KJV source
 * includes the Apocrypha (Ecclesiasticus, Tobit, 1-2 Maccabees, …), which the
 * seed added to the shared `books` table; use this to keep those out of
 * canon-only UI like the reader's book dropdown.
 */
export function isProtestantCanonBook(name: string): boolean {
  return CANON_BOOK_NAMES_LOWER.has(name.toLowerCase());
}
