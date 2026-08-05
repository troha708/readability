"use client";

import { useState } from "react";
import type { IndexedQuestion } from "@/lib/content/quiz-index";
import { QuizList } from "./quiz-list";

/**
 * The hub's random round: a handful of questions drawn from across the whole
 * Bible, a new set each time you ask for one.
 *
 * The pool ships with the page (see randomPool) rather than coming from an
 * endpoint, so the first round is in the server-rendered HTML and the whole
 * thing still works on the static mobile export. Rounds are dealt from a
 * shuffled pool without repeats, so nothing comes round again until the pool
 * is spent — at which point it reshuffles.
 */
export function RandomQuiz({
  pool,
  drawSize = 8,
}: {
  pool: IndexedQuestion[];
  drawSize?: number;
}) {
  // Round 0 is the server-rendered draw: the head of the pool, untouched, so
  // the markup is identical on both sides of hydration.
  const [round, setRound] = useState(0);
  const [dealt, setDealt] = useState<IndexedQuestion[]>(() => pool.slice(0, drawSize));
  const [remaining, setRemaining] = useState<IndexedQuestion[] | null>(null);

  function shuffle(xs: IndexedQuestion[]): IndexedQuestion[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function next() {
    // First click shuffles everything the opening round didn't use; after that
    // we keep dealing off the same shuffle until it runs out.
    let source = remaining ?? shuffle(pool.slice(drawSize));
    if (source.length < drawSize) source = shuffle(pool);
    setDealt(source.slice(0, drawSize));
    setRemaining(source.slice(drawSize));
    setRound((r) => r + 1);
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white">
          Random
        </h2>
        <button
          type="button"
          onClick={next}
          className="rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 transition-colors hover:border-amber-500 hover:text-amber-700 dark:border-neutral-600 dark:text-neutral-300 dark:hover:border-amber-500 dark:hover:text-amber-400"
        >
          New questions
        </button>
      </div>
      <QuizList key={round} questions={dealt} />
    </>
  );
}
