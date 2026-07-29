"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getLastReadPosition,
  getReadingMode,
  setReadingMode,
  type ReadingMode,
  type ReadingProgress,
} from "@/lib/reading-progress";
import {
  loadAllProgress,
} from "@/lib/progress-service";
import { AuthButton } from "@/components/auth-button";
import { Logo } from "@/components/logo";
import { useUser } from "@/hooks/useUser";
import { bibleBookSortIndex, bookGenre } from "@/lib/bible-book-order";
import { isOverviewAtStart } from "@/lib/overview-placement";
import { computeContinueTarget } from "@/lib/continue-target";
import { SearchModal } from "@/components/search-modal";
import { SiteFooter } from "@/components/site-footer";
import { Tutorial, LIBRARY_TUTORIAL_STEPS } from "@/components/tutorial";
import { isNativeApp } from "@/lib/notifications";

type ChapterInfo = { chapterNumber: number };

export type BookInfo = {
  name: string;
  testament: string;
  chapters: ChapterInfo[];
};

type Props = {
  books: BookInfo[];
  versionAbbr: string;
  booksWithSummary: Set<string>;
};

type CompletionAge = "recent" | "fading" | "old";

function getCompletionAge(timestamp: string | undefined): CompletionAge {
  if (!timestamp) return "old";
  const days = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return "recent";
  if (days <= 30) return "fading";
  return "old";
}

const AGE_STYLES = {
  recent: {
    button:
      "bg-amber-100 font-semibold text-amber-700 ring-1 ring-inset ring-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:ring-amber-700",
    badge: "bg-amber-500 text-white",
    icon: "text-amber-500 dark:text-amber-400",
  },
  fading: {
    button:
      "bg-amber-50 font-semibold text-amber-600/60 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/25 dark:text-amber-500/50 dark:ring-amber-800/60",
    badge: "bg-amber-400/70 text-white dark:bg-amber-700",
    icon: "text-amber-400/70 dark:text-amber-600",
  },
  old: {
    button:
      "bg-amber-50/60 font-semibold text-amber-500/50 ring-1 ring-inset ring-amber-200/60 dark:bg-amber-950/15 dark:text-amber-600/40 dark:ring-amber-800/40",
    badge: "bg-amber-300/60 text-white dark:bg-amber-800/60",
    icon: "text-amber-300/60 dark:text-amber-700/50",
  },
} as const;

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

export function BibleRoadmap({ books, versionAbbr, booksWithSummary }: Props) {
  const { user, loading: userLoading } = useUser();
  const [readingDone, setReadingDone] = useState<ReadingProgress>({});
  const [quizDone, setQuizDone] = useState<ReadingProgress>({});
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ReadingMode>("read");
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["OT", "NT"]));
  // The active (continue-reading) book's row, scrolled to on load for
  // returning readers so they land on where they left off.
  const activeBookRef = useRef<HTMLDivElement | null>(null);
  const didScrollToActive = useRef(false);
  const [continueTarget, setContinueTarget] = useState<{ book: string; chapter: number }>({
    book: "Genesis",
    chapter: 1,
  });
  const [hasStarted, setHasStarted] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  // Reminders are a native-app-only feature, so the settings entry point is
  // hidden on the web. Detected after mount to keep SSR markup stable.
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    async function init() {
      const { read: readProg, quiz: quizProg, timestamps: ts } = await loadAllProgress();
      setReadingDone(readProg);
      setQuizDone(quizProg);
      setTimestamps(ts);
      // A saved reading position counts as started even before any chapter
      // is completed — exiting mid-chapter on a first visit still means
      // "continue", not "begin".
      const lastRead = getLastReadPosition();
      const hasProgress =
        Object.values(readProg).some(Boolean) ||
        Object.values(quizProg).some(Boolean) ||
        lastRead !== null;
      setHasStarted(hasProgress);
      const currentMode = getReadingMode();
      setMode(currentMode);


      const target = computeContinueTarget(
        books,
        { read: readProg, quiz: quizProg, timestamps: ts },
        currentMode,
        lastRead,
      );
      setContinueTarget(target);

      const activeBook = books.find((b) => b.name === target.book);
      // Fresh readers start with just Genesis open — the first page of the
      // book; everything else stays collapsed. Once there's progress, the
      // continue-target book is the one expanded.
      setExpandedBooks(new Set([hasProgress ? target.book : "Genesis"]));
      setExpandedSections(new Set([activeBook?.testament ?? "OT"]));
    }
    init();
  }, [books]);

  // Once a returning reader's active book is rendered, scroll it near the top
  // of the viewport so they land where they left off — the whole canonical
  // tree stays visible above (a scroll up), rather than hiding earlier books.
  // Fresh readers stay at the top (Genesis is the first book).
  useEffect(() => {
    if (didScrollToActive.current || !hasStarted) return;
    const el = activeBookRef.current;
    if (!el) return;
    didScrollToActive.current = true;
    // Defer a frame so the expanded chapter grid has laid out first.
    requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [hasStarted, continueTarget, expandedBooks]);

  const sorted = [...books].sort(
    (a, b) => bibleBookSortIndex(a.name) - bibleBookSortIndex(b.name),
  );
  const otBooks = sorted.filter((b) => b.testament === "OT");
  const ntBooks = sorted.filter((b) => b.testament === "NT");
  // Canonical book name -> chapter count, so the search box can reject
  // out-of-range references like "John 99".
  const bookChapterCounts = Object.fromEntries(
    books.map((b) => [b.name, b.chapters.length]),
  );

  function toggleBook(bookName: string) {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookName)) next.delete(bookName);
      else next.add(bookName);
      return next;
    });
  }

  function toggleSection(testament: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(testament)) next.delete(testament);
      else next.add(testament);
      return next;
    });
  }

  function readUrl(book: string, chapter: number) {
    return `/try/bible/read?book=${encodeURIComponent(book)}&chapter=${chapter}&version=${versionAbbr}`;
  }

  // The Overview button jumps to wherever the book's overview lives: the first
  // chapter for orientation books (overview above chapter 1), the last chapter
  // for narrative books (recap after the story). It's placed in the chapter grid
  // to match — first for orientation books, last for narrative recaps.
  function renderOverviewLink(book: BookInfo, isStudy: boolean) {
    if (!booksWithSummary.has(book.name)) return null;
    const targetChapter = isOverviewAtStart(book.name)
      ? book.chapters[0].chapterNumber
      : book.chapters[book.chapters.length - 1].chapterNumber;
    return (
      <Link
        href={readUrl(book.name, targetChapter) + "&overview=1"}
        className={`flex ${
          isStudy ? "h-11 flex-col gap-0.5" : "h-7"
        } items-center justify-center rounded px-2.5 text-xs font-semibold transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-800/60`}
      >
        <span className={isStudy ? "leading-none" : ""}>Overview</span>
        {isStudy && (
          <span className="text-[0.6rem] font-normal text-amber-700/80 dark:text-amber-400/70">
            summary
          </span>
        )}
      </Link>
    );
  }

  function renderSection(label: string, testament: string, sectionBooks: BookInfo[]) {
    const isSectionExpanded = expandedSections.has(testament);
    // Every book in the section is shown — nothing is collapsed behind a
    // "Show earlier books" toggle. Returning readers are scrolled to their
    // active book instead (see the scroll effect above).
    const visibleBooks = sectionBooks;

    return (
      <div className="mb-4">
        <button
          onClick={() => toggleSection(testament)}
          className="mb-4 flex w-full items-center gap-3"
        >
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {label}
            {!isSectionExpanded && (
              <span className="normal-case tracking-normal">
                · {sectionBooks.length} books
              </span>
            )}
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${isSectionExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        </button>
        {!isSectionExpanded ? null : (
        <>
        <div className="relative ml-3">
          {/* Vertical line starts at the first dot, not above it */}
          <div className="absolute left-0 top-[22px] bottom-0 w-0.5 bg-neutral-200 dark:bg-neutral-700" />
          {visibleBooks.map((book, idx) => {
            const isActiveBook = book.name === continueTarget.book;
            const genre = bookGenre(book.name);
            const showGenreLabel =
              genre !== (idx > 0 ? bookGenre(visibleBooks[idx - 1].name) : null);
            const hasChapters = book.chapters.length > 0;
            const isStudy = mode === "study";
            const completedCount = book.chapters.filter((ch) => {
              const key = `${book.name}:${ch.chapterNumber}`;
              if (!isStudy) return !!readingDone[key];
              return !!readingDone[key] && !!quizDone[key];
            }).length;
            const allComplete = hasChapters && completedCount === book.chapters.length;
            const isExpanded = expandedBooks.has(book.name);

            return (
              <div
                key={book.name}
                ref={isActiveBook ? activeBookRef : undefined}
                className={`relative scroll-mt-24 py-2.5 pl-8${
                  showGenreLabel && idx !== 0 ? " mt-2" : ""
                }`}
              >
                {/* Genre label — floated to the right edge, vertically aligned
                    with the book name so it adds no height to the timeline */}
                {showGenreLabel && genre && (
                  <span className="pointer-events-none absolute right-1 top-3.5 hidden h-4 items-center text-[0.6rem] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 sm:flex">
                    {genre}
                  </span>
                )}
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 ${
                    allComplete
                      ? "border-amber-500 bg-amber-500"
                      : isActiveBook
                        ? "border-amber-500 bg-amber-500"
                        : hasChapters
                          ? "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                          : "border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
                  }`}
                />

                {/* Book name — expands/collapses on click, but rendered as a
                    real link to the book's first chapter so crawlers get a
                    server-rendered path into every book (the chapter grid
                    below only renders when expanded). */}
                <a
                  href={
                    hasChapters
                      ? `/try/bible/read?book=${encodeURIComponent(book.name)}&chapter=1&version=${versionAbbr}`
                      : undefined
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    if (hasChapters) toggleBook(book.name);
                  }}
                  className={`flex items-center gap-2 ${hasChapters ? "cursor-pointer" : "cursor-default"}`}
                >
                  {hasChapters && (
                    <svg
                      className={`h-3.5 w-3.5 flex-shrink-0 text-neutral-400 transition-transform duration-200 dark:text-neutral-500 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  <h3
                    className={`text-sm font-semibold ${
                      hasChapters
                        ? "text-neutral-800 dark:text-neutral-200"
                        : "text-neutral-400 dark:text-neutral-600"
                    }`}
                  >
                    {book.name}
                  </h3>
                  {isActiveBook && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      Up next
                    </span>
                  )}
                  {!isExpanded && hasChapters && (
                    <span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">
                      {book.chapters.length} ch.
                      {completedCount > 0 && ` · ${completedCount} done`}
                    </span>
                  )}
                </a>

                {/* Collapsible chapter grid */}
                {isExpanded && hasChapters && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {isOverviewAtStart(book.name) && renderOverviewLink(book, isStudy)}
                    {book.chapters.map((ch) => {
                      const key = `${book.name}:${ch.chapterNumber}`;
                      const readComplete = !!readingDone[key];
                      const quizComplete = !!quizDone[key];
                      const isComplete = isStudy
                        ? readComplete && quizComplete
                        : readComplete;
                      const isNextUnread =
                        isActiveBook && ch.chapterNumber === continueTarget.chapter && !isComplete;
                      const age = isComplete ? getCompletionAge(timestamps[key]) : null;
                      const ageStyle = age ? AGE_STYLES[age] : null;
                      return (
                        <Link
                          key={ch.chapterNumber}
                          href={readUrl(book.name, ch.chapterNumber)}
                          className={`relative flex ${
                            isStudy ? "h-11 min-w-[2.25rem] flex-col gap-0.5" : "h-7 min-w-[1.75rem]"
                          } items-center justify-center rounded px-1 text-xs tabular-nums transition-colors ${
                            isNextUnread
                              ? "bg-amber-500 font-bold text-white ring-2 ring-amber-400 shadow-md shadow-amber-500/25 dark:bg-amber-400 dark:text-amber-950 dark:ring-amber-300 dark:shadow-amber-400/20"
                              : ageStyle
                                ? ageStyle.button
                                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                          }`}
                        >
                          <span className={isStudy ? "leading-none" : ""}>
                            {ch.chapterNumber}
                          </span>
                          {isStudy && (
                            <span className="flex items-center gap-1">
                              <BookIcon
                                className={`h-3 w-3 ${
                                  isNextUnread
                                    ? readComplete ? "text-white" : "text-amber-200 dark:text-amber-700"
                                    : readComplete
                                      ? (ageStyle?.icon ?? "text-amber-500 dark:text-amber-400")
                                      : "text-neutral-300 dark:text-neutral-600"
                                }`}
                              />
                              <PencilIcon
                                className={`h-3 w-3 ${
                                  isNextUnread
                                    ? quizComplete ? "text-white" : "text-amber-200 dark:text-amber-700"
                                    : quizComplete
                                      ? (ageStyle?.icon ?? "text-amber-500 dark:text-amber-400")
                                      : "text-neutral-300 dark:text-neutral-600"
                                }`}
                              />
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {/* Narrative books' recap lives after the story — button last. */}
                    {!isOverviewAtStart(book.name) && renderOverviewLink(book, isStudy)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>
    );
  }

  // Dark theme opts out of the body's #202121 onto the landing's
  // near-black, so landing → library reads as one surface.
  return (
    <main className="min-h-screen px-4 py-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl">
        {/* Navbar — wraps to a second row on narrow screens (the control
            cluster is dense: mode toggle, search, three nav links, sign in). */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-y-2">
          <Logo />
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div data-tutorial="mode" className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
              <button
                onClick={() => {
                  setMode("read");
                  setReadingMode("read");
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  mode === "read"
                    ? "bg-white text-amber-700 shadow-sm dark:bg-neutral-700 dark:text-amber-400"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                }`}
              >
                Read
              </button>
              <button
                onClick={() => {
                  setMode("study");
                  setReadingMode("study");
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  mode === "study"
                    ? "bg-white text-amber-700 shadow-sm dark:bg-neutral-700 dark:text-amber-400"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                }`}
              >
                Study
              </button>
            </div>

            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>
            <Link
              href="/try/bible/map"
              aria-label="Bible atlas"
              title="Bible atlas"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="hidden md:inline">Atlas</span>
            </Link>
            <Link
              href="/try/bible/dictionary"
              aria-label="Bible dictionary"
              title="Bible dictionary"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
              </svg>
              <span className="hidden md:inline">Dictionary</span>
            </Link>
            {isNative && (
              <Link
                href="/try/bible/settings"
                aria-label="Reminders & settings"
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
              </Link>
            )}
            <AuthButton />
          </div>
        </div>

        {/* Sign-in banner for guests */}
        {!userLoading && !user && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-blue-950/40">
            <svg className="h-4 w-4 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <Link href="/login?next=/try/bible/start" className="font-medium underline hover:no-underline">
                Sign in
              </Link>{" "}
              to save your progress across devices
            </p>
          </div>
        )}

        {/* Continue Reading — sticky so it stays reachable while scrolling the
            tree (and it's where a returning reader is scrolled past on load).
            -mx-4 px-4 bleeds the frosted background to the container edges. */}
        <div className="sticky top-0 z-20 -mx-4 mb-6 flex items-center justify-center gap-3 bg-white/90 px-4 py-3 backdrop-blur dark:bg-neutral-950/90">
          <Link
            href={readUrl(continueTarget.book, continueTarget.chapter)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-800 dark:bg-amber-700 dark:hover:bg-amber-800"
          >
            {hasStarted ? "Continue Reading" : "Begin Reading"}
            <span className="text-xs font-normal text-amber-900">
              {continueTarget.book} {continueTarget.chapter}
            </span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/try/bible/highlights"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-600 shadow-sm transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-amber-700 dark:hover:text-amber-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            Notes
          </Link>
        </div>

        {/* Canonical order always: Old Testament first (collapsed unless the
            reader is currently in it), New Testament below. */}
        {renderSection("Old Testament", "OT", otBooks)}
        {renderSection("New Testament", "NT", ntBooks)}

        <SiteFooter className="mt-8 border-t-0" />
      </div>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        version={versionAbbr}
        bookChapterCounts={bookChapterCounts}
      />

      <Tutorial steps={LIBRARY_TUTORIAL_STEPS} storageKey="bible-library-tutorial-complete" />
    </main>
  );
}
