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
import { originalName, divisionOriginalName } from "@/lib/book-names-original";
import { isOverviewAtStart } from "@/lib/overview-placement";
import { computeContinueTarget } from "@/lib/continue-target";
import { SearchModal } from "@/components/search-modal";
import { SiteFooter } from "@/components/site-footer";
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
  /**
   * Book name -> the one-line "Purpose" from its Tyndale intro. Optional
   * because the native app renders from a bundled roadmap blob that doesn't
   * carry the intros; there the rows simply show no purpose line until that
   * bundle is rebuilt to include them.
   */
  purposeByBook?: Record<string, string>;
};

/**
 * The original-language name set beside the English one. Greek and Hebrew get
 * different families (no single free face covers both with the pointing), and
 * the Hebrew is marked rtl so the numbered books — שְׁמוּאֵל א — order correctly
 * next to surrounding Latin text.
 */
function OriginalTitle({
  name,
  className = "",
}: {
  name: { original: string; translit: string; script: "hebrew" | "greek" };
  className?: string;
}) {
  return (
    <span
      className={`${name.script === "hebrew" ? "font-hebrew" : "font-greek"} ${className}`}
      dir={name.script === "hebrew" ? "rtl" : undefined}
      title={name.translit}
    >
      {name.original}
    </span>
  );
}

export function BibleRoadmap({
  books,
  versionAbbr,
  booksWithSummary,
  purposeByBook = {},
}: Props) {
  const { user, loading: userLoading } = useUser();
  const [readingDone, setReadingDone] = useState<ReadingProgress>({});
  const [quizDone, setQuizDone] = useState<ReadingProgress>({});
  // Completion timestamps are still loaded — computeContinueTarget uses them
  // to pick where you resume — but nothing renders from them any more. The
  // recent/fading/old fade on completed chapters is gone.
  const [mode, setMode] = useState<ReadingMode>("read");
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["OT", "NT"]));
  // The active (continue-reading) book's row, scrolled to on load for
  // returning readers so they land on where they left off.
  const activeBookRef = useRef<HTMLDivElement | null>(null);
  const didScrollToActive = useRef(false);
  const [continueTarget, setContinueTarget] = useState<{ book: string; chapter: number }>({
    book: "John",
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
      // Only the continue-target book is expanded; for a fresh reader that's
      // the John 1 fallback, so John is the one book open on first visit.
      setExpandedBooks(new Set([target.book]));
      setExpandedSections(new Set([activeBook?.testament ?? "OT"]));
    }
    init();
  }, [books]);

  // Once a returning reader's active book is rendered, scroll it near the top
  // of the viewport so they land where they left off — the whole canonical
  // tree stays visible above (a scroll up), rather than hiding earlier books.
  // Fresh readers stay at the top: the OT section is collapsed for them, so
  // John's grid already sits in view without a jump.
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
  // for narrative books (recap after the story). It sits in the chapter run to
  // match — first for orientation books, last for narrative recaps.
  function renderOverviewLink(book: BookInfo) {
    if (!booksWithSummary.has(book.name)) return null;
    const targetChapter = isOverviewAtStart(book.name)
      ? book.chapters[0].chapterNumber
      : book.chapters[book.chapters.length - 1].chapterNumber;
    return (
      <Link
        href={readUrl(book.name, targetChapter) + "&overview=1"}
        // Sits in the chapter grid rather than above it, spanning two of the
        // 2.75rem tracks — the word doesn't fit one cell, and letting it span
        // whole tracks keeps the squares after it in column.
        className="col-span-2 inline-flex h-11 w-full items-center justify-center p-0.5"
      >
        <span className="flex h-full w-full items-center justify-center rounded border border-amber-500/30 bg-amber-500/10 font-ui text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/20">
          Overview
        </span>
      </Link>
    );
  }

  /**
   * One book: a row in the canon table. The English name carries a gold rule
   * sized to how much of the book is read — progress as a property of the row,
   * not the reason the row exists.
   */
  function renderBookRow(book: BookInfo, isActiveBook: boolean, isStudy: boolean) {
    const hasChapters = book.chapters.length > 0;
    const completedCount = book.chapters.filter((ch) => {
      const key = `${book.name}:${ch.chapterNumber}`;
      if (!isStudy) return !!readingDone[key];
      return !!readingDone[key] && !!quizDone[key];
    }).length;
    const isExpanded = expandedBooks.has(book.name);
    const orig = originalName(book.name);
    const purpose = purposeByBook[book.name];
    const pct = hasChapters ? Math.round((completedCount / book.chapters.length) * 100) : 0;

    return (
      <div
        key={book.name}
        ref={isActiveBook ? activeBookRef : undefined}
        className="scroll-mt-24 border-b border-neutral-200 last:border-b-0 dark:border-neutral-800"
      >
        {/* Rendered as a real link to chapter 1 so crawlers get a
            server-rendered path into every book — the chapter run below only
            exists when expanded — but click toggles the row open.
            draggable={false} matters: an anchor is draggable by default, so
            dragging across the row starts a drag instead of selecting the
            text, and the Greek and Hebrew are exactly what you'd want to
            copy. The selection guard then stops the release-click from
            collapsing the row you just selected out of. */}
        <a
          href={
            hasChapters
              ? `/try/bible/read?book=${encodeURIComponent(book.name)}&chapter=1&version=${versionAbbr}`
              : undefined
          }
          draggable={false}
          onClick={(e) => {
            e.preventDefault();
            if (!hasChapters) return;
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            if (sel && sel.type === "Range" && sel.toString().trim()) return;
            toggleBook(book.name);
          }}
          aria-expanded={hasChapters ? isExpanded : undefined}
          className={`flex select-text items-baseline gap-2 py-3 ${
            hasChapters ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {/* The disclosure arrow. The row was expandable before but said so
              nowhere — the only cue was the cursor. */}
          <span className="flex h-5 w-4 shrink-0 select-none items-center justify-center self-center">
            {hasChapters && (
              <svg
                className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 dark:text-neutral-500 ${
                  isExpanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
          <span className="relative shrink-0">
            <span
              className={`font-scripture text-[17px] font-semibold ${
                isActiveBook
                  ? "text-gold dark:text-gold-bright"
                  : hasChapters
                    ? "text-neutral-800 dark:text-neutral-200"
                    : "text-neutral-400 dark:text-neutral-600"
              }`}
            >
              {book.name}
            </span>
            {/* Progress as a rule under the book name. It needs the faint
                track behind it: without one, a book two chapters into
                twenty-one draws a 9%-wide dash under the first syllable and
                reads as a stray mark rather than a measure. */}
            {pct > 0 && (
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-0 block h-0.5 w-full bg-neutral-200 dark:bg-neutral-800"
              >
                <span
                  className="block h-full bg-gold dark:bg-gold-bright"
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
          </span>
          {orig && (
            <OriginalTitle
              name={orig}
              className="min-w-0 shrink truncate text-[15px] text-gold dark:text-gold-bright"
            />
          )}
          {/* The transliteration was a title attribute, which is a hover
              tooltip — invisible on touch, and the whole point of the column
              is that most readers can't sound out שְׁמוֹת. It hides below sm
              only because the row runs out of width there. */}
          {orig && (
            <span className="hidden shrink-0 whitespace-nowrap font-scripture text-[13px] italic text-neutral-400 dark:text-neutral-500 sm:inline">
              {orig.translit}
            </span>
          )}
          <span className="ml-auto shrink-0 whitespace-nowrap pl-2 font-ui text-[11px] font-medium tracking-[0.25px] tabular-nums text-neutral-400 dark:text-neutral-500">
            {book.chapters.length}
            {completedCount > 0 &&
              (completedCount === book.chapters.length
                ? " · all read"
                : ` · ${completedCount} read`)}
          </span>
        </a>

        {isExpanded && hasChapters && (
          <div className="pb-2">
            {purpose && (
              <p className="mb-1 max-w-prose font-scripture text-[15px] italic leading-relaxed text-neutral-500 dark:text-neutral-400">
                {purpose}
              </p>
            )}
            {/* Chapters as a grid of squares. Fixed 2.75rem tracks rather
                than flex-wrap so the squares stay square and line up in
                columns when they wrap — Psalms wraps seven times, and ragged
                rows read as a mistake. The box is 40px inside a 44px cell, so
                the tap target clears the platform minimum where the old 28px
                chip didn't. */}
            <div className="grid grid-cols-[repeat(auto-fill,2.75rem)]">
              {isOverviewAtStart(book.name) && renderOverviewLink(book)}
              {book.chapters.map((ch) => {
                const key = `${book.name}:${ch.chapterNumber}`;
                const readComplete = !!readingDone[key];
                const quizComplete = !!quizDone[key];
                const isComplete = isStudy ? readComplete && quizComplete : readComplete;
                const isNextUnread =
                  isActiveBook && ch.chapterNumber === continueTarget.chapter && !isComplete;
                // In Study mode a chapter that's read but not yet quizzed is a
                // real third state, so the rule under the figure goes dotted
                // rather than the row growing a second line for it.
                const partial = isStudy && readComplete && !quizComplete;
                return (
                  <Link
                    key={ch.chapterNumber}
                    href={readUrl(book.name, ch.chapterNumber)}
                    aria-label={`${book.name} ${ch.chapterNumber}`}
                    className="inline-flex h-11 w-11 items-center justify-center p-0.5 font-ui text-[13px] tabular-nums"
                  >
                    <span
                      className={`flex h-full w-full items-center justify-center rounded border transition-colors ${
                        isNextUnread
                          ? "border-amber-500 bg-amber-500 font-bold text-neutral-950 dark:border-amber-400 dark:bg-amber-400"
                          : isComplete
                            ? "border-amber-500/30 bg-amber-500/10 font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400"
                            : partial
                              ? // Study mode's third state: read but not yet
                                // quizzed. Outlined, not filled, so it reads as
                                // started rather than done.
                                "border-dashed border-amber-500/50 text-amber-700/80 dark:border-amber-400/40 dark:text-amber-400/70"
                              : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {ch.chapterNumber}
                    </span>
                  </Link>
                );
              })}
              {/* Narrative books' recap lives after the story — link last. */}
              {!isOverviewAtStart(book.name) && renderOverviewLink(book)}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSection(label: string, testament: string, sectionBooks: BookInfo[]) {
    const isSectionExpanded = expandedSections.has(testament);
    // Every book in the section is shown — nothing is collapsed behind a
    // "Show earlier books" toggle. Returning readers are scrolled to their
    // active book instead (see the scroll effect above).
    const visibleBooks = sectionBooks;
    const isStudy = mode === "study";

    // Books grouped into their canon divisions, in canonical order. The
    // division was already in the data (BOOK_GENRES) — it just rendered as a
    // 0.6rem label floated into the right margin.
    const divisions: { genre: string; books: BookInfo[] }[] = [];
    for (const book of visibleBooks) {
      const genre = bookGenre(book.name) ?? "Other";
      const last = divisions[divisions.length - 1];
      if (last && last.genre === genre) last.books.push(book);
      else divisions.push({ genre, books: [book] });
    }

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
          <div className="flex flex-col gap-7">
            {divisions.map(({ genre, books: divisionBooks }) => {
              const divOrig = divisionOriginalName(genre);
              const chapterTotal = divisionBooks.reduce((n, b) => n + b.chapters.length, 0);
              return (
                <div key={genre}>
                  {/* The division head. This is the one Bible-specific thing
                      the old page had, and it rendered as a floated 0.6rem
                      grey label — it carries the structure now. */}
                  <div className="flex items-baseline gap-3 border-b border-neutral-300 pb-1 dark:border-neutral-700">
                    <span className="font-ui text-[11px] font-medium uppercase tracking-[1.2px] text-neutral-500 dark:text-neutral-400">
                      {genre}
                    </span>
                    {divOrig && (
                      <OriginalTitle
                        name={divOrig}
                        className="text-[15px] text-gold dark:text-gold-bright"
                      />
                    )}
                    <span className="ml-auto whitespace-nowrap font-ui text-[11px] font-medium tracking-[0.25px] tabular-nums text-neutral-400 dark:text-neutral-500">
                      {divisionBooks.length} {divisionBooks.length === 1 ? "book" : "books"} ·{" "}
                      {chapterTotal} chapters
                    </span>
                  </div>
                  <div>
                    {divisionBooks.map((book) =>
                      renderBookRow(book, book.name === continueTarget.book, isStudy),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
            <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
              <button
                onClick={() => {
                  setMode("read");
                  setReadingMode("read");
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium tracking-[0.25px] transition-all ${
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
                className={`rounded-md px-2.5 py-1 text-xs font-medium tracking-[0.25px] transition-all ${
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
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium tracking-[0.25px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              {/* An unfurled paper map with a chart printed on it: folded
                  panels, a coastline sweeping across them, a compass rose in
                  the top right. The detail is what says "map" rather than
                  "sheet of paper", so the stroke thins to 1.5 to carry it —
                  at 2 the coastline and the rose close up. */}
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
                <path d="M9 4v14" />
                <path d="M15 6v14" />
                <path d="M4 14.8c1.6-1.4 2.4.5 4 .1 1.7-.4 2.2-2.1 3.9-2.1 1.7 0 2.3 1.7 4 1.5 1.6-.2 2.2-1.5 3.4-2.1" />
                <path d="M17.9 6.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
              </svg>
              <span className="hidden md:inline">Atlas</span>
            </Link>
            <Link
              href="/try/bible/dictionary"
              aria-label="Bible dictionary"
              title="Bible dictionary"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium tracking-[0.25px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
              </svg>
              <span className="hidden md:inline">Dictionary</span>
            </Link>
            <Link
              href="/try/bible/quiz"
              aria-label="Bible quiz"
              title="Bible quiz"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium tracking-[0.25px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.88 9.4a2.25 2.25 0 1 1 3.04 2.09c-.6.24-.92.79-.92 1.4v.36" />
                <path d="M12 16.5h.01" />
              </svg>
              <span className="hidden md:inline">Quiz</span>
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
          {/* Same size, colours and type as the landing page's Start Reading —
              amber-400 fill, near-black bold capitalized sans, no arrow —
              but rounder than the landing's near-square 2px corners
              (owner-directed). The book and chapter stay: they say where this
              resumes. */}
          <Link
            href={readUrl(continueTarget.book, continueTarget.chapter)}
            className="inline-flex h-[54px] items-center gap-2 rounded-lg bg-amber-400 px-[20.3px] text-[16.2px] font-bold capitalize tracking-[0.34px] text-neutral-950 transition-colors hover:bg-amber-300"
          >
            {hasStarted ? "Continue Reading" : "Begin Reading"}
            <span className="text-xs font-normal normal-case text-neutral-950/70">
              {continueTarget.book} {continueTarget.chapter}
            </span>
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
    </main>
  );
}
