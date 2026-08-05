import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { QUIZ_SECTIONS, quizSection } from "@/lib/quiz-sections";
import {
  sectionBooks,
  sectionQuestionCount,
  sampleQuestions,
  bookSlug,
} from "@/lib/content/quiz-index";
import { QuestionCard } from "../question-card";

/**
 * A section index: the books it covers, and a handful of its questions so the
 * page has substance of its own rather than being a bare list of links.
 *
 * The questions themselves live on the per-book pages. Rendering a whole
 * section inline produced a 3.3 MB document for Old Testament History, which
 * is both a bad page to serve and an unreliable one to index. Per-book also
 * happens to match how people search — "genesis quiz", "psalms quiz".
 */

type Props = { params: Promise<{ section: string }> };

export const dynamic = "force-static";

export function generateStaticParams() {
  return QUIZ_SECTIONS.map((s) => ({ section: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: slug } = await params;
  const section = quizSection(slug);
  if (!section) return {};

  const count = sectionQuestionCount(slug);
  const title = `${section.title} Quiz — ${count.toLocaleString()} questions`;
  const description = `${section.blurb} ${count.toLocaleString()} questions with answers, each linked to the verse it comes from.`;

  return {
    title,
    description,
    alternates: { canonical: `/try/bible/quiz/${slug}` },
    openGraph: { title: `${title} | Readability`, description, url: `/try/bible/quiz/${slug}` },
  };
}

export default async function QuizSectionPage({ params }: Props) {
  const { section: slug } = await params;
  const section = quizSection(slug);
  if (!section) notFound();

  const books = sectionBooks(slug);
  const count = sectionQuestionCount(slug);
  const samples = sampleQuestions(slug, 5);

  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/try/bible/quiz"
          className="text-sm font-medium text-neutral-800 transition-colors hover:text-amber-600 dark:text-white dark:hover:text-amber-400"
        >
          ← All quizzes
        </Link>
      </nav>

      <article className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {section.title} Quiz
        </h1>

        <div className="mt-8 space-y-6 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          <p>
            {section.blurb} {count.toLocaleString()} questions across{" "}
            {books.length === 1 ? "one book" : `${books.length} books`}, each
            linked to the verse it comes from.
          </p>

          <h2 className="font-display pt-4 text-xl font-semibold text-neutral-900 dark:text-white">
            Choose a book
          </h2>
          <ul className="space-y-2">
            {books.map((b) => (
              <li key={b.book}>
                <Link
                  href={`/try/bible/quiz/${slug}/${bookSlug(b.book)}`}
                  className="group flex items-baseline justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-2.5 transition-colors hover:border-amber-500 dark:border-neutral-700 dark:hover:border-amber-500"
                >
                  <span className="font-semibold text-neutral-900 group-hover:text-amber-700 dark:text-white dark:group-hover:text-amber-400">
                    {b.book}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                    {b.count} questions · {b.chapters.length}{" "}
                    {b.chapters.length === 1 ? "chapter" : "chapters"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <h2 className="font-display pt-4 text-xl font-semibold text-neutral-900 dark:text-white">
            A sample
          </h2>
          <ol className="qz-list">
            {samples.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </ol>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
