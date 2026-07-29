import { readFileSync } from "fs";
import { join } from "path";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { chapterReference } from "@/lib/bible-book-order";
import { loadQuestions } from "@/lib/content/chapter-data";
import { Quiz } from "./quiz";
import { OfflineQuiz } from "./offline-quiz";
import { IS_MOBILE } from "@/lib/build-target";

// This page must stay static-renderable: generateStaticParams marks the
// route SSG, so a request-time render cannot touch dynamic APIs (cookies,
// searchParams) — doing so throws DYNAMIC_SERVER_USAGE and 500s. That's why
// chapter numbers are fetched with a plain (cookie-free) Supabase client and
// the translation param is read client-side in <Quiz>.
//
// On web, generateStaticParams returns [] so quiz pages render on demand and
// get cached. On the static mobile build, all book/chapter combinations are
// pre-generated from the offline manifest.
export async function generateStaticParams() {
  if (!IS_MOBILE) return [];
  const manifestPath = join(process.cwd(), "public", "offline", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  return manifest.books.flatMap(
    (b: { name: string; chapters: { n: number }[] }) =>
      b.chapters.map((c) => ({ book: b.name, chapter: String(c.n) })),
  );
}

type Props = {
  params: Promise<{ book: string; chapter: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (IS_MOBILE) return { title: "Quiz — Readability" };
  const { book, chapter } = await params;
  const bookName = decodeURIComponent(book);
  const ref = chapterReference(bookName, parseInt(chapter, 10));
  const title = `${ref} Quiz`;
  const description = `Test your comprehension of ${ref} with multiple-choice, true/false, and fill-in-the-blank questions.`;
  return {
    title,
    description,
    alternates: { canonical: `/try/bible/questions/${book}/${chapter}` },
    openGraph: { title: `${ref} Quiz | Readability`, description },
  };
}

export default async function QuestionsPage({ params }: Props) {
  if (IS_MOBILE) {
    return (
      <Suspense fallback={null}>
        <OfflineQuiz />
      </Suspense>
    );
  }

  const { book, chapter } = await params;
  const bookName = decodeURIComponent(book);
  const chapterNum = parseInt(chapter, 10);

  if (isNaN(chapterNum)) notFound();

  const questions = loadQuestions(bookName, chapterNum);
  if (questions.length === 0 && process.env.NODE_ENV === "development") {
    console.log(`[questions] No questions found for "${bookName}" chapter ${chapterNum}.`);
  }

  // Chapter numbering is the same across translations, so the BSB chapter
  // list serves every version.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  let chapterNumbers: number[] = [];

  const [{ data: translation }, { data: bookData }] = await Promise.all([
    supabase
      .from("translations")
      .select("id")
      .eq("abbreviation", "BSB")
      .single(),
    supabase.from("books").select("id").eq("name", bookName).single(),
  ]);

  if (translation && bookData) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("chapter_number")
      .eq("book_id", bookData.id)
      .eq("translation_id", translation.id)
      .order("chapter_number");
    chapterNumbers = chapters?.map((c) => c.chapter_number) ?? [];
  }

  return (
    <Suspense fallback={null}>
      <Quiz
        bookName={bookName}
        chapterNumber={chapterNum}
        questions={questions}
        chapterNumbers={chapterNumbers}
      />
    </Suspense>
  );
}
