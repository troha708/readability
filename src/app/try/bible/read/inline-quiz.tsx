"use client";

import { useEffect, useRef, useState } from "react";
import { markQuizComplete } from "@/lib/progress-service";
import { chapterUnit } from "@/lib/bible-book-order";

export type QuizQuestion = {
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

type Props = {
  bookName: string;
  chapterNumber: number;
  questions: QuizQuestion[];
  onComplete: () => void;
  /** Move on to the next chapter without quiz credit. */
  onSkip: () => void;
  /** Permanently switch to read mode; the chapter counts as complete. */
  onSwitchToRead: () => void;
};

function normalize(s: string) {
  return s.toLowerCase().trim();
}

export function InlineQuiz({ bookName, chapterNumber, questions, onComplete, onSkip, onSwitchToRead }: Props) {
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [fillInput, setFillInput] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [roundCorrect, setRoundCorrect] = useState(0);
  const [missedInRound, setMissedInRound] = useState<QuizQuestion[]>([]);
  const [phase, setPhase] = useState<"questions" | "review" | "complete">("questions");

  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const fillInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showFeedback) return;
    const id = setTimeout(() => nextButtonRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(id);
  }, [showFeedback]);

  useEffect(() => {
    if (phase === "questions" && questions.length > 0) return;
    const id = setTimeout(() => primaryButtonRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(id);
  }, [phase, questions.length]);

  const roundTotal = activeQuestions.length;
  const current = roundTotal > 0 ? activeQuestions[currentIndex] : null;

  // Focus the fill-in-the-blank input without scrolling. A bare autoFocus
  // yanks the page down to the quiz (bottom of the chapter) on load, which
  // fights the reading scroll and the search-phrase jump.
  useEffect(() => {
    if (current?.type !== "fill_blank" || showFeedback) return;
    const id = setTimeout(() => fillInputRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(id);
  }, [current, showFeedback]);

  // No questions — show simple completion card
  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {chapterUnit(bookName)} {chapterNumber} complete!
            </p>
          </div>
          <button
            ref={primaryButtonRef}
            onClick={() => {
              void markQuizComplete(bookName, chapterNumber);
              onComplete();
            }}
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-700"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  function acceptedAnswers(q: QuizQuestion): string[] {
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

  function isCorrect(answer: string) {
    if (current === null) return false;
    const a = normalize(answer);
    return acceptedAnswers(current).some((x) => normalize(x) === a);
  }

  function handleSelect(answer: string) {
    if (showFeedback) return;
    setSelectedAnswer(answer);
    setShowFeedback(true);
    if (isCorrect(answer)) {
      setRoundCorrect((s) => s + 1);
    } else {
      setMissedInRound((prev) => [...prev, current!]);
    }
  }

  function handleFillSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showFeedback || !fillInput.trim()) return;
    handleSelect(fillInput.trim());
  }

  async function handleNext() {
    if (currentIndex < roundTotal - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setFillInput("");
      setShowFeedback(false);
    } else if (missedInRound.length > 0) {
      setPhase("review");
    } else {
      await markQuizComplete(bookName, chapterNumber);
      setPhase("complete");
    }
  }

  function handleRetry() {
    setActiveQuestions(missedInRound);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setFillInput("");
    setShowFeedback(false);
    setRoundCorrect(0);
    setMissedInRound([]);
    setPhase("questions");
  }

  // ── Complete ───────────────────────────────────────────────

  if (phase === "complete") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {chapterUnit(bookName)} {chapterNumber} complete!
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                All questions answered correctly.
              </p>
            </div>
          </div>
          <button
            ref={primaryButtonRef}
            onClick={onComplete}
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-700"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Review (some wrong) ────────────────────────────────────

  if (phase === "review") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800">
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                {roundCorrect}/{roundTotal}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {missedInRound.length === 1 ? "1 question" : `${missedInRound.length} questions`} to review
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Got {roundCorrect} of {roundTotal} right
              </p>
            </div>
          </div>
          <button
            ref={primaryButtonRef}
            onClick={handleRetry}
            className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-600"
          >
            Retry →
          </button>
        </div>
      </div>
    );
  }

  // ── Question ───────────────────────────────────────────────

  if (!current) return null;

  const wasCorrect = selectedAnswer !== null && isCorrect(selectedAnswer);

  function optionClasses(option: string): string {
    const base = "w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all ";
    if (!showFeedback) {
      return base + "border-neutral-200 bg-white text-neutral-700 hover:border-amber-300 hover:bg-amber-50 active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-amber-600 dark:hover:bg-amber-900/20";
    }
    if (normalize(option) === normalize(current!.answer)) {
      return base + "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400";
    }
    if (option === selectedAnswer) {
      return base + "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-400";
    }
    return base + "border-neutral-100 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-600";
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/40">
      {/* Quiz header */}
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            {chapterUnit(bookName)} {chapterNumber} Quiz
          </span>
          <span className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
            {currentIndex + 1} / {roundTotal}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {activeQuestions.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < currentIndex
                  ? "bg-amber-500"
                  : i === currentIndex
                    ? "bg-amber-400 dark:bg-amber-500"
                    : "bg-neutral-200 dark:bg-neutral-700"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question body */}
      <div className="p-5" key={current.id}>
        <span className="mb-3 inline-block rounded-full bg-neutral-200 px-3 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
          {current.type === "multiple_choice"
            ? "Multiple Choice"
            : current.type === "true_false"
              ? "True or False"
              : "Fill in the Blank"}
        </span>

        <p className="mb-4 text-base font-medium leading-relaxed text-neutral-900 dark:text-white">
          {current.question}
        </p>

        <div className="space-y-2">
          {current.type === "multiple_choice" &&
            current.options?.map((option) => (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                disabled={showFeedback}
                className={optionClasses(option)}
              >
                {option}
              </button>
            ))}

          {current.type === "true_false" &&
            ["True", "False"].map((option) => (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                disabled={showFeedback}
                className={optionClasses(option)}
              >
                {option}
              </button>
            ))}

          {current.type === "fill_blank" && (
            <form onSubmit={handleFillSubmit} className="space-y-2">
              <input
                ref={fillInputRef}
                type="text"
                value={fillInput}
                onChange={(e) => setFillInput(e.target.value)}
                disabled={showFeedback}
                placeholder="Type your answer…"
                className={`w-full rounded-xl border-2 px-4 py-3 text-sm font-medium outline-none transition-all placeholder:text-neutral-400 ${
                  !showFeedback
                    ? "border-neutral-200 bg-white text-neutral-700 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:focus:border-amber-500"
                    : wasCorrect
                      ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400"
                      : "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-400"
                }`}
              />
              {!showFeedback && (
                <button
                  type="submit"
                  disabled={!fillInput.trim()}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Submit
                </button>
              )}
            </form>
          )}
        </div>

        {/* Feedback */}
        {showFeedback && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              wasCorrect
                ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
            }`}
          >
            <p className={`text-sm font-bold ${wasCorrect ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}`}>
              {wasCorrect ? "✓ Correct!" : "✗ Incorrect"}
            </p>
            {!wasCorrect && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {acceptedAnswers(current).length > 1 ? "Accepted answers: " : "The correct answer is "}
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {acceptedAnswers(current).join(", ")}
                </span>
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {current.verse_reference}
            </p>
            <button
              ref={nextButtonRef}
              onClick={handleNext}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700 active:scale-[0.98]"
            >
              {currentIndex < roundTotal - 1 ? "Next Question →" : "See Results"}
            </button>
          </div>
        )}

        {/* Quiet escape hatches — skipping shouldn't compete with answering */}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
          <button
            onClick={onSkip}
            className="underline-offset-2 transition-colors hover:text-neutral-600 hover:underline dark:hover:text-neutral-300"
          >
            Skip quiz
          </button>
          <span aria-hidden>·</span>
          <button
            onClick={onSwitchToRead}
            title="Read mode skips quizzes — a chapter is complete when you finish reading it"
            className="underline-offset-2 transition-colors hover:text-neutral-600 hover:underline dark:hover:text-neutral-300"
          >
            Switch to Read mode
          </button>
        </div>
      </div>
    </div>
  );
}
