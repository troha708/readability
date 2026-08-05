import { BIBLE_BOOK_ORDER } from "@/lib/bible-book-order";
import { loadChapterNumbers } from "@/lib/content/chapter-text";
import { loadQuestions, type ChapterQuestion } from "@/lib/content/chapter-data";
import { QUIZ_SECTIONS, type QuizSection } from "@/lib/quiz-sections";

/**
 * Server-side index over data/questions, built once per process and cached.
 *
 * The quiz hub and section pages are search surfaces, so their questions have
 * to be in the server-rendered HTML — a client-side quiz that fetches its
 * questions ranks for nothing. This module does the reading; the pages do the
 * rendering.
 */

export type IndexedQuestion = ChapterQuestion & {
  book: string;
  chapter: number;
  /** Deep link into the reader at the verse this question is drawn from. */
  readHref: string;
};

export type ChapterGroup = {
  book: string;
  chapter: number;
  reference: string;
  questions: IndexedQuestion[];
};

export type BookGroup = {
  book: string;
  chapters: ChapterGroup[];
  count: number;
};

/**
 * "Genesis 1:27" / "Psalm 1:14-19" -> the first verse number, or null.
 * A handful of references list discontinuous verses ("Acts 15:1,5"); the first
 * is the right place to land a reader either way.
 */
export function firstVerseOf(reference: string): number | null {
  const m = reference.match(/:(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Where a wrong answer sends the reader. Verse-level when the question carries
 * a reference, chapter-level when it doesn't — 390 questions in the later New
 * Testament predate the verse_reference field, and a jump to the top of the
 * chapter is still a jump to the answer.
 */
function readHrefFor(book: string, chapter: number, reference: string): string {
  const base = `/try/bible/read?book=${encodeURIComponent(book)}&chapter=${chapter}`;
  const verse = reference ? firstVerseOf(reference) : null;
  return verse ? `${base}&verse=${verse}` : base;
}

let cache: Map<string, BookGroup[]> | null = null;

function build(): Map<string, BookGroup[]> {
  const bySection = new Map<string, BookGroup[]>();
  for (const section of QUIZ_SECTIONS) bySection.set(section.slug, []);

  for (const book of BIBLE_BOOK_ORDER) {
    const section = QUIZ_SECTIONS.find((s) =>
      s.books.some((b) => b.toLowerCase() === book.toLowerCase()),
    );
    if (!section) continue;

    const chapterNumbers = loadChapterNumbers("BSB", book);
    if (!chapterNumbers) continue;

    const chapters: ChapterGroup[] = [];
    for (const chapter of chapterNumbers) {
      const questions = loadQuestions(book, chapter);
      if (questions.length === 0) continue;
      chapters.push({
        book,
        chapter,
        // Psalms are cited "Psalm 23", not "Psalms 23".
        reference: book === "Psalms" ? `Psalm ${chapter}` : `${book} ${chapter}`,
        questions: questions.map((q) => ({
          ...q,
          book,
          chapter,
          readHref: readHrefFor(book, chapter, q.verse_reference),
        })),
      });
    }

    if (chapters.length === 0) continue;
    bySection.get(section.slug)!.push({
      book,
      chapters,
      count: chapters.reduce((n, c) => n + c.questions.length, 0),
    });
  }

  return bySection;
}

function index(): Map<string, BookGroup[]> {
  if (!cache) cache = build();
  return cache;
}

export function sectionBooks(slug: string): BookGroup[] {
  return index().get(slug) ?? [];
}

export function sectionQuestionCount(slug: string): number {
  return sectionBooks(slug).reduce((n, b) => n + b.count, 0);
}

export function totalQuestionCount(): number {
  return QUIZ_SECTIONS.reduce((n, s) => n + sectionQuestionCount(s.slug), 0);
}

export type SectionSummary = QuizSection & {
  questionCount: number;
  bookCount: number;
  chapterCount: number;
};

export function sectionSummaries(): SectionSummary[] {
  return QUIZ_SECTIONS.map((s) => {
    const books = sectionBooks(s.slug);
    return {
      ...s,
      questionCount: books.reduce((n, b) => n + b.count, 0),
      bookCount: books.length,
      chapterCount: books.reduce((n, b) => n + b.chapters.length, 0),
    };
  });
}

/** "1 Samuel" -> "1-samuel". Book pages are per-book search targets. */
export function bookSlug(book: string): string {
  return book.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function bookGroup(sectionSlug: string, slug: string): BookGroup | undefined {
  return sectionBooks(sectionSlug).find((b) => bookSlug(b.book) === slug);
}

/** Every (section, book) pair that has questions — the static routes. */
export function bookRoutes(): { section: string; book: string }[] {
  return QUIZ_SECTIONS.flatMap((s) =>
    sectionBooks(s.slug).map((b) => ({ section: s.slug, book: bookSlug(b.book) })),
  );
}

