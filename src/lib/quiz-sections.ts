/**
 * Quiz sections: the canon grouped into eight coherent chunks, each its own
 * page. The groupings mirror BOOK_GENRES in bible-book-order.ts (so the quiz
 * hub and the roadmap timeline label the same books the same way), collapsed
 * where a genre split would produce a page too thin to be worth indexing —
 * Major and Minor Prophets become one "Prophets", Paul's and General Letters
 * become one "Letters".
 *
 * These are the pages that carry the search terms. Individual chapter quizzes
 * ("John 5 quiz") are long tail and already exist; the volume is in the
 * category terms ("gospel quiz", "old testament trivia"), which had no page at
 * all before this.
 */

export type QuizSection = {
  slug: string;
  title: string;
  /** Shown under the title and used as the meta description prefix. */
  blurb: string;
  books: readonly string[];
};

export const QUIZ_SECTIONS: readonly QuizSection[] = [
  {
    slug: "law",
    title: "The Law",
    blurb:
      "Creation, the flood, the patriarchs, the exodus from Egypt, and the giving of the Law at Sinai.",
    books: ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"],
  },
  {
    slug: "history",
    title: "Old Testament History",
    blurb:
      "Conquest and judges, the united and divided kingdoms, exile, and the return to Jerusalem.",
    books: [
      "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
      "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther",
    ],
  },
  {
    slug: "wisdom",
    title: "Wisdom & Poetry",
    blurb: "Job, the Psalms, Proverbs, Ecclesiastes, and the Song of Solomon.",
    books: ["Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon"],
  },
  {
    slug: "prophets",
    title: "The Prophets",
    blurb:
      "Isaiah through Malachi — the major and minor prophets, their oracles, visions, and calls to return.",
    books: [
      "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
      "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
      "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
    ],
  },
  {
    slug: "gospels",
    title: "The Gospels",
    blurb:
      "Matthew, Mark, Luke and John — the birth, ministry, teaching, death and resurrection of Jesus.",
    books: ["Matthew", "Mark", "Luke", "John"],
  },
  {
    slug: "acts",
    title: "Acts",
    blurb:
      "Pentecost, the first church, Stephen and Saul, and Paul's journeys across the Roman world.",
    books: ["Acts"],
  },
  {
    slug: "letters",
    title: "The Letters",
    blurb:
      "Romans through Jude — Paul's letters to the churches and the general epistles.",
    books: [
      "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
      "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
      "1 Timothy", "2 Timothy", "Titus", "Philemon",
      "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude",
    ],
  },
  {
    slug: "revelation",
    title: "Revelation",
    blurb:
      "The letters to the seven churches, the throne room, the seals and trumpets, and the new Jerusalem.",
    books: ["Revelation"],
  },
];

const BY_SLUG = new Map(QUIZ_SECTIONS.map((s) => [s.slug, s]));

export function quizSection(slug: string): QuizSection | undefined {
  return BY_SLUG.get(slug);
}

const SECTION_BY_BOOK = new Map(
  QUIZ_SECTIONS.flatMap((s) => s.books.map((b) => [b.toLowerCase(), s] as const)),
);

/** The section a book belongs to, or undefined for a non-canon book. */
export function sectionForBook(bookName: string): QuizSection | undefined {
  return SECTION_BY_BOOK.get(bookName.toLowerCase());
}
