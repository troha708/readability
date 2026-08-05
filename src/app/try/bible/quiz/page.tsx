import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { sectionSummaries, totalQuestionCount, sampleQuestions } from "@/lib/content/quiz-index";
import { QuestionCard } from "./question-card";

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
    `A free Bible quiz with ${total.toLocaleString()} questions covering all 66 books: ` +
    `multiple choice, true or false, and fill in the blank. Every question links to ` +
    `the verse it comes from, so a wrong answer takes you straight to the passage.`;
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
  const samples = sampleQuestions("gospels", 3);

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
            Bible — multiple choice, true or false, and fill in the blank. Every
            question is checked against the Berean Standard Bible, and every one
            links to the verse it came from, so getting it wrong takes you to
            the passage rather than just telling you the answer.
          </p>

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

          <h2 className="font-display pt-4 text-xl font-semibold text-neutral-900 dark:text-white">
            Try a few
          </h2>
          <p>
            Three from the Gospels. Reveal the answer, or open the verse to read
            it in context.
          </p>
          <ol className="qz-list">
            {samples.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </ol>

          <h2 className="font-display pt-4 text-xl font-semibold text-neutral-900 dark:text-white">
            Quiz a single chapter
          </h2>
          <p>
            Every chapter has its own five-question quiz that scores you and
            tracks what you&apos;ve completed. Pick a chapter from the{" "}
            <Link
              href="/try/bible/start"
              className="underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:decoration-neutral-600 dark:hover:text-amber-400"
            >
              reading roadmap
            </Link>
            , or open a section above and follow any chapter heading.
          </p>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
