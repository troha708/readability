import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { quizSection } from "@/lib/quiz-sections";
import { bookGroup, bookRoutes } from "@/lib/content/quiz-index";
import { QuestionCard } from "../../question-card";

/**
 * Every question in one book, grouped by chapter, answers collapsed, each
 * linked to its verse. This is where the questions actually live — the page a
 * search for "genesis quiz" should land on.
 */

type Props = { params: Promise<{ section: string; book: string }> };

export const dynamic = "force-static";

export function generateStaticParams() {
  return bookRoutes();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: sectionSlug, book: slug } = await params;
  const group = bookGroup(sectionSlug, slug);
  if (!group) return {};

  const title = `${group.book} Quiz — ${group.count} questions`;
  const description =
    `A ${group.count}-question quiz on the book of ${group.book}, covering all ` +
    `${group.chapters.length} ${group.chapters.length === 1 ? "chapter" : "chapters"}. ` +
    `Multiple choice, true or false, and fill in the blank, with every answer ` +
    `linked to the verse it comes from.`;

  return {
    title,
    description,
    alternates: { canonical: `/try/bible/quiz/${sectionSlug}/${slug}` },
    openGraph: {
      title: `${title} | Readability`,
      description,
      url: `/try/bible/quiz/${sectionSlug}/${slug}`,
    },
  };
}

export default async function QuizBookPage({ params }: Props) {
  const { section: sectionSlug, book: slug } = await params;
  const section = quizSection(sectionSlug);
  const group = bookGroup(sectionSlug, slug);
  if (!section || !group) notFound();

  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href={`/try/bible/quiz/${sectionSlug}`}
          className="text-sm font-medium text-neutral-800 transition-colors hover:text-amber-600 dark:text-white dark:hover:text-amber-400"
        >
          ← {section.title}
        </Link>
      </nav>

      <article className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {group.book} Quiz
        </h1>

        <div className="mt-8 space-y-6 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          <p>
            {group.count} questions across{" "}
            {group.chapters.length === 1
              ? "one chapter"
              : `${group.chapters.length} chapters`}
            . Reveal any answer, or open the verse to read it in context. Each
            chapter heading links to that chapter&apos;s scored quiz.
          </p>

          {group.chapters.map((c) => (
            <section key={`${c.book}-${c.chapter}`} className="pt-2">
              <h2 className="font-display text-lg font-semibold text-neutral-900 dark:text-white">
                <Link
                  href={`/try/bible/questions/${encodeURIComponent(c.book)}/${c.chapter}`}
                  className="hover:text-amber-700 dark:hover:text-amber-400"
                >
                  {c.reference}
                </Link>
              </h2>
              <ol className="qz-list">
                {c.questions.map((q) => (
                  <QuestionCard key={q.id} question={q} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
