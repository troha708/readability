import { BIBLE_BOOK_ORDER, OT_BOOK_ORDER } from "@/lib/bible-book-order";
import { existsSync } from "fs";
import { join } from "path";
import type { Metadata } from "next";
import { BibleRoadmap, type BookInfo } from "./bible-roadmap";
import { OfflineRoadmap } from "./offline-roadmap";
import { IS_MOBILE } from "@/lib/build-target";
import { loadChapterNumbers } from "@/lib/content/chapter-text";

export const metadata: Metadata = {
  title: "Bible Library — All 66 Books",
  description:
    "Browse every book and chapter of the Bible. Track your reading progress, take comprehension quizzes, and study with cross-references and word study.",
  openGraph: {
    title: "Bible Library | Readability",
    description:
      "Browse every book and chapter of the Bible. Track your reading progress, take comprehension quizzes, and study with cross-references and word study.",
  },
};

const OT_SET = new Set<string>(OT_BOOK_ORDER);

// The roadmap is built from the on-disk BSB data at build time (the page has no
// per-request inputs, so it prerenders as static HTML and serves from the CDN).
export default function BibleStartPage() {
  if (IS_MOBILE) return <OfflineRoadmap />;

  const books: BookInfo[] = BIBLE_BOOK_ORDER.map((name) => ({
    name,
    testament: OT_SET.has(name) ? "OT" : "NT",
    chapters: (loadChapterNumbers("BSB", name) ?? []).map((chapterNumber) => ({
      chapterNumber,
    })),
  })).filter((b) => b.chapters.length > 0);

  // Detect which books have a summary file on disk
  const booksWithSummary = new Set<string>(
    books
      .filter((b) => {
        const slug = b.name.toLowerCase();
        return existsSync(
          join(process.cwd(), "data", "summaries", slug, `${slug}-book-summary.json`),
        );
      })
      .map((b) => b.name),
  );

  return (
    <BibleRoadmap
      books={books}
      versionAbbr="BSB"
      booksWithSummary={booksWithSummary}
    />
  );
}
