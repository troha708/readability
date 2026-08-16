"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { ConfettiBurst } from "@/components/confetti-burst";
import { SiteFooter } from "@/components/site-footer";
import { useEffect, useRef, useState } from "react";
import { markQuizComplete, markChapterComplete, emitMilestone } from "@/lib/progress-service";
import { setReadingMode } from "@/lib/reading-progress";
import { chapterUnit, chapterReference } from "@/lib/bible-book-order";

type Question = {
  id: string;
  type: "multiple_choice" | "true_false" | "fill_blank";
  question: string;
  options?: string[];
  answer: string;
  // Additional acceptable answers (e.g. the same word as it appears in other
  // translations — "deficient" in BSB vs "wanting" in KJV/WEB). The primary
  // `answer` should match the default translation (BSB).
  accept?: string[];
  verse_reference: string;
};

type Props = {
  bookName: string;
  chapterNumber: number;
  questions: Question[];
  chapterNumbers: number[];
};

function normalize(s: string) {
  return s.toLowerCase().trim();
}

export function Quiz({
  bookName,
  chapterNumber,
  questions,
  chapterNumbers,
}: Props) {
  // Read the translation client-side so the page itself stays static-safe
  // (server-side searchParams would force dynamic rendering, which the
  // mobile static export can't do).
  const versionAbbr = useSearchParams().get("version") ?? "BSB";
  const router = useRouter();
  const [activeQuestions, setActiveQuestions] = useState<Question[]>(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [fillInput, setFillInput] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [roundCorrect, setRoundCorrect] = useState(0);
  const [missedInRound, setMissedInRound] = useState<Question[]>([]);
  const [phase, setPhase] = useState<"questions" | "review" | "complete">(
    questions.length === 0 ? "complete" : "questions",
  );

  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showFeedback) return;
    const id = setTimeout(() => nextButtonRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [showFeedback]);

  useEffect(() => {
    if (questions.length === 0) {
      console.warn(`[Quiz] No questions for "${bookName}" ch.${chapterNumber} — skipping to complete`);
      void markQuizComplete(bookName, chapterNumber);
    }
  }, [bookName, chapterNumber, questions.length]);


  const roundTotal = activeQuestions.length;
  const current = roundTotal > 0 ? activeQuestions[currentIndex] : null;

  // The primary answer plus any translation variants, de-duplicated.
  function acceptedAnswers(q: Question): string[] {
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
      // The chapter counts as complete the moment every question has been
      // answered correctly — i.e. this is the last question of the round and
      // nothing was missed along the way. Mark it now so the credit isn't
      // gated behind the "See Results"/"Next" buttons, which are just
      // navigation. markQuizComplete is idempotent, so the call in
      // handleNext stays as a harmless safety net.
      if (currentIndex === roundTotal - 1 && missedInRound.length === 0) {
        void markQuizComplete(bookName, chapterNumber);
      }
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

  function readChapterUrl() {
    return `/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${chapterNumber}&version=${versionAbbr}`;
  }

  function getNextChapterUrl(): string | null {
    const idx = chapterNumbers.indexOf(chapterNumber);
    const next = chapterNumbers[idx + 1];
    if (next !== undefined) {
      return `/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${next}&version=${versionAbbr}`;
    }
    return null;
  }

  const nextUrl = getNextChapterUrl();

  // Skip the quiz: move on without quiz credit, so progress stays honest.
  function handleSkip() {
    router.push(nextUrl ?? "/try/bible/start");
  }

  // Permanently switch to read mode. The reader already finished the
  // chapter text, so under read-mode rules it counts as complete.
  async function handleSwitchToRead() {
    setReadingMode("read");
    await markChapterComplete(bookName, chapterNumber);
    // Usually a no-op write (reading was marked on scroll), so emit the
    // milestone explicitly — the chapter just became complete in read mode.
    emitMilestone();
    router.push(nextUrl ?? "/try/bible/start");
  }

  // ── Review Screen (got some wrong) ─────────────────────────

  if (phase === "review") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-neutral-925">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30">
            <span className="text-4xl font-bold text-amber-600 dark:text-amber-400">
              {roundCorrect}/{roundTotal}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            You got {roundCorrect}/{roundTotal} — review and retry!
          </h1>
          <p className="mt-3 text-neutral-500 dark:text-neutral-400">
            {missedInRound.length === 1
              ? "1 question needs another look."
              : `${missedInRound.length} questions need another look.`}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={handleRetry}
              className="rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700"
            >
              Retry Questions →
            </button>
            <Link
              href={readChapterUrl()}
              className="rounded-lg border-2 border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              Re-read {chapterUnit(bookName)}
            </Link>
            <Link
              href="/try/bible/start"
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
            >
              Back to Library
            </Link>
          </div>

          <SiteFooter className="mt-8 border-t-0" />
        </div>
      </div>
    );
  }

  // ── Completion Screen ──────────────────────────────────────

  if (phase === "complete") {
    const originalTotal = questions.length;
    // No next chapter means this was the final chapter of the book.
    const bookComplete = nextUrl === null;
    let message: string;
    if (bookComplete)
      message = `You've finished ${bookName}!`;
    else if (originalTotal === 0)
      message = "You've completed this chapter's reading.";
    else message = "Perfect — every question answered correctly!";

    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-neutral-925">
        <div className="w-full max-w-md text-center">
          <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30">
            {bookComplete && <ConfettiBurst />}
            {originalTotal > 0 ? (
              <svg
                className="h-14 w-14 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="h-12 w-12 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>

          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {chapterReference(bookName, chapterNumber)} Complete!
          </h1>
          <p className="mt-3 text-neutral-500 dark:text-neutral-400">{message}</p>

          <div className="mt-8 flex flex-col gap-3">
            {nextUrl ? (
              <Link
                href={nextUrl}
                className="inline-block rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700"
              >
                Next {chapterUnit(bookName)} →
              </Link>
            ) : (
              <Link
                href="/try/bible/start"
                className="inline-block rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700"
              >
                Finish
              </Link>
            )}
            <Link
              href={readChapterUrl()}
              className="inline-block rounded-lg border-2 border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              Re-read {chapterUnit(bookName)}
            </Link>
            {nextUrl && (
              <Link
                href="/try/bible/start"
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                Back to Library
              </Link>
            )}
          </div>

          <SiteFooter className="mt-8 border-t-0" />
        </div>
      </div>
    );
  }

  // ── Question Screen ────────────────────────────────────────

  if (!current) return null;

  const wasCorrect = selectedAnswer !== null && isCorrect(selectedAnswer);
  const accepted = acceptedAnswers(current);

  function optionClasses(option: string): string {
    const base =
      "w-full rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all ";
    if (!showFeedback) {
      return (
        base +
        "border-neutral-200 bg-white text-neutral-700 hover:border-amber-300 hover:bg-amber-50 active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-amber-600 dark:hover:bg-amber-900/20"
      );
    }
    if (normalize(option) === normalize(current!.answer)) {
      return (
        base +
        "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400"
      );
    }
    if (option === selectedAnswer) {
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

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-925">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-925/95">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo compact />
              <div className="h-4 w-px shrink-0 bg-neutral-200 dark:bg-neutral-600" />
              <Link
                href="/try/bible/start"
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                ←
              </Link>
            </div>
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {chapterReference(bookName, chapterNumber)}
            </span>
            <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
              {currentIndex + 1}/{roundTotal}
            </span>
          </div>
          {/* Segmented progress */}
          <div className="mt-2.5 flex gap-1.5">
            {activeQuestions.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
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
      </header>

      {/* Question body */}
      <div className="px-4 py-8" key={current.id}>
        <div className="mx-auto max-w-2xl">
          <span className="mb-4 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {current.type === "multiple_choice"
              ? "Multiple Choice"
              : current.type === "true_false"
                ? "True or False"
                : "Fill in the Blank"}
          </span>

          <h2 className="text-xl font-semibold leading-relaxed text-neutral-900 dark:text-white">
            {current.question}
          </h2>

          {/* Answer options */}
          <div className="mt-6 space-y-3">
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
              <form onSubmit={handleFillSubmit} className="space-y-3">
                <input
                  type="text"
                  value={fillInput}
                  onChange={(e) => setFillInput(e.target.value)}
                  disabled={showFeedback}
                  placeholder="Type your answer…"
                  autoFocus
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
                    className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Submit
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Feedback panel */}
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
                  wasCorrect
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-red-700 dark:text-red-400"
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
                {current.verse_reference}
              </p>

              <button
                ref={nextButtonRef}
                onClick={handleNext}
                className="mt-4 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700 active:scale-[0.98]"
              >
                {currentIndex < roundTotal - 1 ? "Next Question →" : "See Results"}
              </button>
            </div>
          )}

          {/* Quiet escape hatches — skipping shouldn't compete with answering */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <button
              onClick={handleSkip}
              className="underline-offset-2 transition-colors hover:text-neutral-600 hover:underline dark:hover:text-neutral-300"
            >
              Skip quiz
            </button>
            <span aria-hidden>·</span>
            <button
              onClick={() => void handleSwitchToRead()}
              title="Read mode skips quizzes — a chapter is complete when you finish reading it"
              className="underline-offset-2 transition-colors hover:text-neutral-600 hover:underline dark:hover:text-neutral-300"
            >
              Switch to Read mode
            </button>
          </div>

          <SiteFooter className="mt-4 border-t-0" />
        </div>
      </div>
    </div>
  );
}
