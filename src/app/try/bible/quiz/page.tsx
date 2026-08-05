import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { sectionSummaries, totalQuestionCount, randomPool } from "@/lib/content/quiz-index";
import { RandomQuiz } from "./random-quiz";

/**
 * The quiz hub: the category page above the 1,189 per-chapter quizzes, which
 * were indexable but orphaned — nothing linked to them and nothing targeted
 * the terms people actually search ("bible quiz", "gospel quiz") rather than
 * the long tail ("John 5 quiz").
 *
 * Everything here is server-rendered, questions included. A quiz that fetches
 * its questions client-side is invisible to search, which would defeat the
 * point of the page.
 */

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const total = totalQuestionCount();
  const title = `Bible Quiz — ${total.toLocaleString()} questions on every chapter`;
  const description =
    `${total.toLocaleString()} Bible quiz questions covering all 66 books: ` +
    `multiple choice, true or false, and fill in the blank, each linked to the ` +
    `verse it comes from.`;
  return {
    title,
    description,
    alternates: { canonical: "/try/bible/quiz" },
    openGraph: { title: `${title} | Readability`, description, url: "/try/bible/quiz" },
  };
}

export default function QuizHubPage() {
  const sections = sectionSummaries();
  const total = totalQuestionCount();
  const pool = randomPool(240);

  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/"
          className="text-sm font-medium text-neutral-800 transition-colors hover:text-amber-600 dark:text-white dark:hover:text-amber-400"
        >
          ← Home
        </Link>
      </nav>

      <article className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Bible Quiz
        </h1>

        <div className="mt-8 space-y-6 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          <p>
            {total.toLocaleString()} questions covering every chapter of the
            Bible: multiple choice, true or false, and fill in the blank.
          </p>

          <RandomQuiz pool={pool} />

          <h2 className="font-display pt-4 text-xl font-semibold text-neutral-900 dark:text-white">
            Quiz by section
          </h2>
          <ul className="space-y-3">
            {sections.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/try/bible/quiz/${s.slug}`}
                  className="group flex items-baseline justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3 transition-colors hover:border-amber-500 dark:border-neutral-700 dark:hover:border-amber-500"
                >
                  <span>
                    <span className="font-semibold text-neutral-900 group-hover:text-amber-700 dark:text-white dark:group-hover:text-amber-400">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-300">
                      {s.blurb}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                    {s.questionCount.toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="pt-4">
            Each chapter also has its own scored quiz, from the{" "}
            <Link
              href="/try/bible/start"
              className="underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:decoration-neutral-600 dark:hover:text-amber-400"
            >
              reading roadmap
            </Link>{" "}
            or any chapter heading above.
          </p>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
