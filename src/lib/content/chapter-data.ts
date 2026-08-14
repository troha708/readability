import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

/**
 * Server-side loaders for the per-chapter content that lives on disk:
 * comprehension questions, section headings, and book summaries. Shared by the
 * read page, the quiz page, and /api/chapter so the file conventions and
 * normalization live in exactly one place.
 */

export type ChapterQuestion = {
  id: string;
  type: "multiple_choice" | "true_false" | "fill_blank";
  question: string;
  options?: string[];
  answer: string;
  // Additional acceptable answers (e.g. the same word as it appears in a
  // different translation) for fill-in-the-blank grading.
  accept?: string[];
  verse_reference: string;
};

export type SectionHeading = {
  beforeVerse: number;
  heading: string;
};

type RawQuestion = {
  id: string;
  type: string;
  question: string;
  options?: string[];
  answer?: string;
  correct?: string;
  accept?: string[];
  verse_reference?: string;
  verse_ref?: string;
};

function normalizeQuestion(raw: RawQuestion): ChapterQuestion {
  const typeMap: Record<string, ChapterQuestion["type"]> = {
    fill_in_the_blank: "fill_blank",
  };
  return {
    id: raw.id,
    type: (typeMap[raw.type] ?? raw.type) as ChapterQuestion["type"],
    question: raw.question,
    options: raw.options,
    answer: String(raw.answer ?? raw.correct ?? ""),
    accept: raw.accept,
    verse_reference: raw.verse_reference ?? raw.verse_ref ?? "",
  };
}

/** Questions live under data/questions/{BookName}/ with two historical
 * filename conventions; the slug form is preferred. */
export function loadQuestions(bookName: string, chapterNum: number): ChapterQuestion[] {
  const slug = bookName.toLowerCase().replace(/ /g, "-");
  const questionsDir = join(process.cwd(), "data", "questions", bookName);
  for (const fileName of [`${slug}-${chapterNum}.json`, `chapter_${chapterNum}.json`]) {
    try {
      const raw = readFileSync(join(questionsDir, fileName), "utf-8");
      return (JSON.parse(raw).questions ?? []).map(normalizeQuestion);
    } catch {
      // try next candidate
    }
  }
  return [];
}

/**
 * Translations that ship without inline section headings and so receive the
 * BSB heading overlay (public domain). BSB itself carries its \s1/\s2 headings
 * inline in the chunk HTML, so it must NOT also receive the overlay or
 * headings double up.
 *
 * Empty since the ASV/Geneva/Young's/Darby texts were dropped from the compare
 * set — they were the only versions that needed it. The overlay plumbing is
 * kept because it threads through the reader's rendering path, and would come
 * straight back into use if a heading-less translation is ever added.
 */
export const OVERLAY_HEADING_VERSIONS = new Set<string>([]);

export function loadHeadings(
  bookName: string,
  chapterNum: number,
  versionAbbr: string,
): SectionHeading[] | null {
  if (!OVERLAY_HEADING_VERSIONS.has(versionAbbr)) return null;
  try {
    const headingsPath = join(process.cwd(), "data", "headings", `${bookName}.json`);
    if (existsSync(headingsPath)) {
      const data = JSON.parse(readFileSync(headingsPath, "utf-8"));
      return data.chapters?.[String(chapterNum)] ?? null;
    }
  } catch {
    // no headings for this chapter
  }
  return null;
}

/**
 * Totals across all content files, for marketing copy. Runs at build time
 * (the landing page is statically prerendered), so the numbers stay in sync
 * with the data without a hardcoded count.
 */
export function countContentStats(): { questions: number } {
  let questions = 0;

  const questionsRoot = join(process.cwd(), "data", "questions");
  for (const book of readdirSync(questionsRoot)) {
    const dir = join(questionsRoot, book);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        questions += (JSON.parse(readFileSync(join(dir, file), "utf-8")).questions ?? []).length;
      } catch {
        // skip malformed file
      }
    }
  }

  return { questions };
}

export function loadBookSummary(bookName: string): string | null {
  try {
    const summaryPath = join(
      process.cwd(),
      "data",
      "summaries",
      bookName.toLowerCase(),
      `${bookName.toLowerCase()}-book-summary.json`,
    );
    if (existsSync(summaryPath)) {
      return JSON.parse(readFileSync(summaryPath, "utf-8")).summary ?? null;
    }
  } catch {
    // no book summary for this book
  }
  return null;
}

export type IntroField = { label: string; value: string };
export type IntroSection = { heading: string | null; paragraphs: string[] };
export type BookIntro = {
  book: string;
  fields: IntroField[];
  sections: IntroSection[];
};

/**
 * The Tyndale House book introduction shown at the start of every book (2026-07-13,
 * replacing our own overviews on the reading surface after a blind comparison).
 * A Purpose/Author/Date/Setting sidebar plus the introductory essay; CC BY-SA 4.0,
 * built by scripts/build-tyndale-intros.py into data/tyndale-intros/{Book}.json.
 */
export function loadBookIntro(bookName: string): BookIntro | null {
  try {
    const introPath = join(process.cwd(), "data", "tyndale-intros", `${bookName}.json`);
    if (existsSync(introPath)) {
      return JSON.parse(readFileSync(introPath, "utf-8")) as BookIntro;
    }
  } catch {
    // no intro for this book
  }
  return null;
}
