"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { IndexedQuestion } from "@/lib/content/quiz-index";

/**
 * A round of questions, one at a time, matching the chapter quiz in Study
 * mode: the same type badge, option styling, feedback panel and grading
 * (case-insensitive, trimmed, accepting the `accept` translation variants).
 *
 * Enter advances once an answer is in — the Next button takes focus when
 * feedback appears, and a window listener covers the case where focus has
 * moved elsewhere. At the end, every question in the round is listed with
 * what was answered and what was right.
 *
 * Unlike the chapter quiz this records no progress: these are practice rounds
 * over arbitrary spans, so there's no chapter to mark complete.
 */

function normalize(s: string) {
  return s.toLowerCase().trim();
}

function acceptedAnswers(q: IndexedQuestion): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [q.answer, ...(q.accept ?? [])]) {
    const key = normalize(a);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True or False",
  fill_blank: "Fill in the Blank",
};

type Result = { question: IndexedQuestion; given: string; correct: boolean };

export function QuizRunner({
  questions,
  onRestart,
  restartLabel,
}: {
  questions: IndexedQuestion[];
  onRestart?: () => void;
  restartLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<string | null>(null);
  const [fillInput, setFillInput] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const total = questions.length;
  const current = questions[index];
  const showFeedback = given !== null;
  const accepted = current ? acceptedAnswers(current) : [];
  const wasCorrect = showFeedback && accepted.some((a) => normalize(a) === normalize(given!));

  useEffect(() => {
    // preventScroll matters: focusing normally makes the browser scroll the
    // button into view, which yanks the page as soon as you answer. Enter is
    // handled by a window listener below, so focus is only here for keyboard
    // users tabbing through.
    if (showFeedback) nextRef.current?.focus({ preventScroll: true });
  }, [showFeedback, index]);

  function answer(value: string) {
    if (showFeedback || !value.trim() || !current) return;
    const correct = acceptedAnswers(current).some((a) => normalize(a) === normalize(value));
    setGiven(value);
    setResults((prev) => [...prev, { question: current, given: value, correct }]);
  }

  const next = useCallback(() => {
    if (index < total - 1) {
      setIndex((i) => i + 1);
      setGiven(null);
      setFillInput("");
    } else {
      setDone(true);
    }
  }, [index, total]);

  // Enter advances whenever an answer is showing, wherever focus happens to be.
  useEffect(() => {
    if (!showFeedback) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFeedback, next]);

  function restart() {
    setIndex(0);
    setGiven(null);
    setFillInput("");
    setResults([]);
    setDone(false);
    onRestart?.();
  }

  if (total === 0) return null;

  // ── Results ──────────────────────────────────────────────────
  if (done) {
    const score = results.filter((r) => r.correct).length;
    return (
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-lg font-semibold text-neutral-900 dark:text-white">
            {score}/{total} correct
          </p>
          <button
            type="button"
            onClick={restart}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-700"
          >
            {restartLabel ?? "Try again"}
          </button>
        </div>

        <ol className="mt-4 space-y-3">
          {results.map((r) => (
            <li
              key={r.question.id}
              className={`rounded-xl border p-4 ${
                r.correct
                  ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
              }`}
            >
              <p
                className={`text-sm font-bold ${
                  r.correct
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                {r.correct ? "✓ Correct" : "✗ Incorrect"}
              </p>
              <p className="mt-1 font-medium text-neutral-900 dark:text-white">
                {r.question.question}
              </p>
              {!r.correct && (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  You answered{" "}
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {r.given}
                  </span>
                  . {acceptedAnswers(r.question).length > 1 ? "Accepted: " : "Answer: "}
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {acceptedAnswers(r.question).join(", ")}
                  </span>
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-500">
                {r.question.verse_reference}{" "}
                <Link
                  href={r.question.readHref}
                  className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400"
                >
                  Read
                </Link>
              </p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // ── Question ─────────────────────────────────────────────────
  function optionClasses(option: string): string {
    const base =
      "w-full rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all ";
    if (!showFeedback) {
      return (
        base +
        "border-neutral-200 bg-white text-neutral-700 hover:border-amber-300 hover:bg-amber-50 active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-amber-600 dark:hover:bg-amber-900/20"
      );
    }
    if (normalize(option) === normalize(current.answer)) {
      return (
        base +
        "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400"
      );
    }
    if (option === given) {
      return (
        base +
        "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-400"
      );
    }
    return (
      base +
      "border-neutral-100 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-600"
    );
  }

  const options =
    current.type === "multiple_choice"
      ? current.options
      : current.type === "true_false"
        ? ["True", "False"]
        : null;

  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-700">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {TYPE_LABEL[current.type] ?? "Question"}
        </span>
        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {index + 1}/{total}
        </span>
      </div>

      <div className="mt-3 h-1 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-1 rounded-full bg-amber-500 transition-all"
          style={{ width: `${((index + (showFeedback ? 1 : 0)) / total) * 100}%` }}
        />
      </div>

      <h3 className="mt-4 text-lg font-semibold leading-relaxed text-neutral-900 dark:text-white">
        {current.question}
      </h3>

      <div className="mt-5 space-y-3">
        {options?.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => answer(option)}
            disabled={showFeedback}
            className={optionClasses(option)}
          >
            {option}
          </button>
        ))}

        {!options && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              answer(fillInput);
            }}
            className="space-y-3"
          >
            <input
              type="text"
              value={fillInput}
              onChange={(e) => setFillInput(e.target.value)}
              disabled={showFeedback}
              placeholder="Type your answer…"
              className={`w-full rounded-xl border-2 px-4 py-3.5 text-sm font-medium outline-none transition-all placeholder:text-neutral-400 ${
                !showFeedback
                  ? "border-neutral-200 bg-white text-neutral-700 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:placeholder:text-neutral-600 dark:focus:border-amber-500"
                  : wasCorrect
                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400"
                    : "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-400"
              }`}
            />
            {!showFeedback && (
              <button
                type="submit"
                disabled={!fillInput.trim()}
                className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit
              </button>
            )}
          </form>
        )}
      </div>

      {showFeedback && (
        <div
          className={`mt-6 rounded-xl border p-4 ${
            wasCorrect
              ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
              : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
          }`}
        >
          <p
            className={`text-sm font-bold ${
              wasCorrect ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"
            }`}
          >
            {wasCorrect ? "✓ Correct!" : "✗ Incorrect"}
          </p>
          {!wasCorrect && (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {accepted.length > 1 ? "Accepted answers: " : "The correct answer is "}
              <span className="font-semibold text-neutral-900 dark:text-white">
                {accepted.join(", ")}
              </span>
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            {current.verse_reference}{" "}
            <Link
              href={current.readHref}
              className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400"
            >
              Read
            </Link>
          </p>
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="mt-4 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-700 active:scale-[0.98]"
          >
            {index < total - 1 ? "Next Question →" : "View results"}
          </button>
          <span className="ml-3 text-xs text-neutral-400">or press Enter</span>
        </div>
      )}
    </div>
  );
}
