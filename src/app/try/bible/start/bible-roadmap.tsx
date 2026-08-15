"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  getLastReadPosition,
  getReadingMode,
  type ReadingMode,
  type ReadingProgress,
} from "@/lib/reading-progress";
import {
  loadAllProgress,
} from "@/lib/progress-service";
import { AuthButton } from "@/components/auth-button";
import { Logo } from "@/components/logo";
import { bibleBookSortIndex, bookGenre } from "@/lib/bible-book-order";
import { originalName } from "@/lib/book-names-original";
import { isOverviewAtStart } from "@/lib/overview-placement";
import { computeContinueTarget } from "@/lib/continue-target";
import { SiteFooter } from "@/components/site-footer";
import { LandingSearch } from "@/app/landing-search";
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

export function BibleRoadmap({
  books,
  versionAbbr,
  booksWithSummary,
  purposeByBook = {},
}: Props) {
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
  const activeBookRef = useRef<HTMLTableRowElement | null>(null);
  const didScrollToActive = useRef(false);
  const [continueTarget, setContinueTarget] = useState<{ book: string; chapter: number }>({
    book: "John",
    chapter: 1,
  });
  const [hasStarted, setHasStarted] = useState(false);

  // Reminders are a native-app-only feature, so the settings entry point is
  // hidden on the web. Detected after mount to keep SSR markup stable.
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativeApp());
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
        // Sits in the chapter grid rather than above it, spanning three of the
        // 2.25rem tracks — the word doesn't fit one cell, and letting it span
        // whole tracks keeps the squares after it in column. Styled as the
        // reader's own Overview chip: the same faint amber wash and gold text.
        className="col-span-3 flex h-9 w-full items-center justify-center rounded bg-amber-500/10 text-[12px] font-medium text-gold transition-all hover:bg-amber-500/20 dark:bg-amber-400/10 dark:text-gold-bright dark:hover:bg-amber-400/20"
      >
        Overview
      </Link>
    );
  }

  /**
   * One book: two rows of a plain table. The first is the book — English name,
   * original name, chapter count — with a gold rule under the English name
   * sized to how much of the book is read. The second row only exists when the
   * row is open and holds the chapter grid.
   *
   * Set like a contents page, not a data table: no rules, one size throughout
   * including the chapter figure. Entries are told apart by space and
   * alignment.
   */
  function renderBookRows(book: BookInfo, isActiveBook: boolean, isStudy: boolean) {
    const hasChapters = book.chapters.length > 0;
    const completedCount = book.chapters.filter((ch) => {
      const key = `${book.name}:${ch.chapterNumber}`;
      if (!isStudy) return !!readingDone[key];
      return !!readingDone[key] && !!quizDone[key];
    }).length;
    const isExpanded = expandedBooks.has(book.name);
    const orig = originalName(book.name);
    const purpose = purposeByBook[book.name];
    // Row rhythm. Wider than it was, because the hairline that used to hold
    // the rows apart has gone and the space now has to do that on its own.
    const cell = "py-[0.6rem]";

    return (
      <Fragment key={book.name}>
        <tr ref={isActiveBook ? activeBookRef : undefined} className="scroll-mt-24 align-baseline">
          {/* Three columns: title, original title, figure. The title cell
              shrinks to its content and the original-title cell takes the
              slack, so every Hebrew and Greek name starts on the same left
              edge — a column you can read down — while the figure stays out
              at the right. Give the slack to the title instead and the
              originals scatter along the ragged edge of the English. */}
          <td className={`w-px whitespace-nowrap pr-4 ${cell}`}>
            {/* A real link to chapter 1 so crawlers reach every book — the
                chapter grid below only exists when open — but click toggles.
                draggable={false} and the selection guard keep the row's text
                selectable: an anchor drags by default, which turns a
                drag-select of the Greek into a drag, and the release-click
                would then collapse the row you just selected out of. */}
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
              className={`select-text font-scripture text-[17px] ${
                hasChapters ? "cursor-pointer" : "cursor-default"
              } ${
                isActiveBook
                  ? "text-gold dark:text-gold-bright"
                  : hasChapters
                    ? "text-neutral-800 dark:text-neutral-300"
                    : "text-neutral-400 dark:text-neutral-600"
              }`}
            >
              {/* A text triangle rather than an SVG — it is the bare-HTML
                  disclosure marker, and it costs no markup. */}
              <span
                aria-hidden="true"
                className="mr-1 inline-block w-3.5 select-none text-[13px] text-neutral-400 dark:text-neutral-600"
              >
                {hasChapters ? (isExpanded ? "▾" : "▸") : ""}
              </span>
              {book.name}
            </a>
          </td>
          {/* Set in the English name's own type — same family, size and
              colour. dir is not a style: without it the numbered Hebrew books
              (שְׁמוּאֵל א) reorder against the Latin text around them. */}
          <td className={`w-full pr-3 font-scripture text-[17px] ${cell} ${
            isActiveBook
              ? "text-gold dark:text-gold-bright"
              : hasChapters
                ? "text-neutral-800 dark:text-neutral-300"
                : "text-neutral-400 dark:text-neutral-600"
          }`}>
            {orig && (
              <span dir={orig.script === "hebrew" ? "rtl" : undefined} title={orig.translit}>
                {orig.original}
              </span>
            )}
          </td>
          {/* Same size as the title: on a contents page the figure is part of
              the line. Set smaller it reads as a UI count pinned to the row. */}
          <td className={`w-px whitespace-nowrap text-right font-scripture text-[17px] tabular-nums text-neutral-400 dark:text-neutral-500 ${cell}`}>
            {completedCount > 0
              ? `${completedCount}/${book.chapters.length}`
              : book.chapters.length}
          </td>
        </tr>
        {isExpanded && hasChapters && (
          <tr>
            {/* An open book keeps its grid close and takes its separation
                from the next book below, since there is no rule to do it. */}
            <td colSpan={3} className="pb-7">
              {purpose && (
                <p className="mb-2 max-w-prose font-scripture text-[14px] italic leading-relaxed text-neutral-500 dark:text-neutral-500">
                  {purpose}
                </p>
              )}
              {/* The reader's left-panel chapter list: filled rounded squares,
                  gap-1, solid gold for where you are, an amber tint for done,
                  neutral otherwise. Same colours and shapes as
                  getChapterButtonStyle in chunk-reader, so the library and the
                  panel you open it into read as one control.
                  Two deliberate differences. The squares are 36px rather than
                  the panel's 28px — the panel is a 216px rail beside the text,
                  this is the primary way you navigate on a phone. And the
                  track is a fixed grid rather than flex-wrap, so the figures
                  line up in columns when they wrap; Psalms wraps seven times
                  in a full-width page where the narrow rail barely wraps at
                  all. */}
              <div className="grid grid-cols-[repeat(auto-fill,2.25rem)] gap-1">
                {isOverviewAtStart(book.name) && renderOverviewLink(book)}
                {book.chapters.map((ch) => {
                  const key = `${book.name}:${ch.chapterNumber}`;
                  const readComplete = !!readingDone[key];
                  const quizComplete = !!quizDone[key];
                  const isComplete = isStudy ? readComplete && quizComplete : readComplete;
                  const isNextUnread =
                    isActiveBook && ch.chapterNumber === continueTarget.chapter && !isComplete;
                  // Study mode's third state — read but not yet quizzed — takes
                  // the panel's "fading" tint, which is the step below its
                  // completed one. Nothing here grades by age: that ramp was
                  // deleted from the library and isn't coming back with this.
                  const partial = isStudy && readComplete && !quizComplete;
                  return (
                    <Link
                      key={ch.chapterNumber}
                      href={readUrl(book.name, ch.chapterNumber)}
                      aria-label={`${book.name} ${ch.chapterNumber}`}
                      className={`flex h-9 w-9 items-center justify-center rounded text-[13px] tabular-nums transition-all ${
                        isNextUnread
                          ? "bg-amber-500 font-bold text-neutral-950 dark:bg-amber-400 dark:text-neutral-950"
                          : isComplete
                            ? "bg-amber-500/20 font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/28 dark:bg-amber-400/22 dark:text-amber-200 dark:ring-amber-400/25 dark:hover:bg-amber-400/30"
                            : partial
                              ? "bg-amber-500/11 font-semibold text-amber-700/90 hover:bg-amber-500/18 dark:bg-amber-400/13 dark:text-amber-300/85 dark:hover:bg-amber-400/20"
                              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                      }`}
                    >
                      {ch.chapterNumber}
                    </Link>
                  );
                })}
                {/* Narrative books' recap lives after the story — link last. */}
                {!isOverviewAtStart(book.name) && renderOverviewLink(book)}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  function renderSection(label: string, testament: string, sectionBooks: BookInfo[]) {
    const isSectionExpanded = expandedSections.has(testament);
    // Every book in the section is shown — nothing is collapsed behind a
    // "Show earlier books" toggle. Returning readers are scrolled to their
    // active book instead (see the scroll effect above).
    const visibleBooks = sectionBooks;
    const isStudy = mode === "study";

    // Books grouped into their canon divisions, in canonical order.
    const divisions: { genre: string; books: BookInfo[] }[] = [];
    for (const book of visibleBooks) {
      const genre = bookGenre(book.name) ?? "Other";
      const last = divisions[divisions.length - 1];
      if (last && last.genre === genre) last.books.push(book);
      else divisions.push({ genre, books: [book] });
    }

    return (
      <div className="mb-8">
        <button
          onClick={() => toggleSection(testament)}
          aria-expanded={isSectionExpanded}
          className="mb-2 font-scripture text-[17px] font-semibold text-neutral-800 dark:text-neutral-300"
        >
          <span
            aria-hidden="true"
            className="mr-1 inline-block w-3.5 text-[13px] text-neutral-400 dark:text-neutral-600"
          >
            {isSectionExpanded ? "▾" : "▸"}
          </span>
          {label}
        </button>
        {isSectionExpanded && (
          <table className="w-full border-collapse text-left">
            <tbody>
              {divisions.map(({ genre, books: divisionBooks }) => (
                <Fragment key={genre}>
                  {/* The division, as a plain row. It was an uppercase
                      letter-spaced eyebrow with a right-aligned count; that
                      treatment was most of what made the table read as
                      decorated. With the row rules gone, the space above a
                      division is the only thing marking one part of the canon
                      off from the next, so it carries more of it. */}
                  <tr>
                    <th
                      colSpan={3}
                      className="pb-2 pt-10 text-left font-scripture text-[14px] font-normal italic text-neutral-400 dark:text-neutral-500"
                    >
                      {genre}
                    </th>
                  </tr>
                  {divisionBooks.map((book) =>
                    renderBookRows(book, book.name === continueTarget.book, isStudy),
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }


  // Dark theme opts out of the body's #202121 onto the landing's
  // near-black, so landing → library reads as one surface.
  return (
    <main className="min-h-screen dark:bg-neutral-950">
      {/* The landing bar on this page's own column: logo, quiet links, quiet
          Sign in, closed by a single hairline that runs edge to edge. The
          search is not up here — at this width it crowded the bar, so it sits
          in the sticky bar below with Continue, where a reader looking for a
          passage is already looking. Read/Study is set in the reader itself. */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <header className="mx-auto flex max-w-2xl items-stretch px-4 md:h-[72px]">
          <div className="flex h-14 items-center pr-4 md:h-auto md:pr-6">
            <Logo />
          </div>
          <nav className="hidden items-center text-sm font-medium tracking-[0.25px] max-md:ml-auto sm:flex">
            <Link href="/try/bible/map" className="px-3 py-2 text-neutral-500 transition-colors hover:text-amber-600 dark:text-neutral-400 dark:hover:text-amber-400 sm:px-4">
              Atlas
            </Link>
            <Link href="/try/bible/dictionary" className="px-3 py-2 text-neutral-500 transition-colors hover:text-amber-600 dark:text-neutral-400 dark:hover:text-amber-400 sm:px-4">
              Dictionary
            </Link>
            <Link href="/try/bible/quiz" className="px-3 py-2 text-neutral-500 transition-colors hover:text-amber-600 dark:text-neutral-400 dark:hover:text-amber-400 sm:px-4">
              Quiz
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {isNative && (
              <Link
                href="/try/bible/settings"
                aria-label="Reminders & settings"
                className="flex items-center px-3 text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
              </Link>
            )}
            <AuthButton variant="flat" />
          </div>
        </header>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Continue Reading — sticky so it stays reachable while scrolling the
            tree (and it's where a returning reader is scrolled past on load).
            Fully opaque, on the page's own ground rather than a tint of it:
            a translucent or absent background let book rows slide half-hidden
            behind the two buttons, which read as debris around them. -mx-4
            px-4 bleeds that ground to the container edges so no row shows
            down the sides, and the gap below the bar is padding rather than
            margin — margin isn't painted, so a row scrolling up flashed
            through that band before it reached the opaque box. */}
        <div className="sticky top-0 z-20 -mx-4 bg-white px-4 pb-6 pt-3 dark:bg-neutral-950">
          {/* Search sits with Continue: both are ways of getting to a
              passage, and the bar is what stays on screen while the canon
              scrolls past. */}
          <LandingSearch className="mb-3 w-full" />
          <div className="flex items-center justify-center gap-3">
          {/* The landing page's Start reading button, exactly: same fill,
              hover, near-square 2px corners, height, padding and type. The
              two pages open with the same control, so it should be the same
              object. (It previously took the muted gold.fill at rounded-lg —
              owner-directed then, owner-reversed now.)
              The chapter is the label rather than a subtitle beside it: a
              button that names its destination asks less of the reader than
              one that names an activity. "Begin John 1" states what the
              button has always done — computeContinueTarget falls back to
              John 1 for a reader with no history. */}
          <Link
            href={readUrl(continueTarget.book, continueTarget.chapter)}
            className="inline-flex h-[54px] items-center rounded-[2px] bg-amber-400 px-[20.3px] text-[16.2px] font-bold capitalize tracking-[0.34px] text-neutral-950 transition-colors hover:bg-amber-300"
          >
            {hasStarted ? "Continue" : "Begin"} {continueTarget.book}{" "}
            {continueTarget.chapter}
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
          {/* Only before there's any history: a reader who has been here knows
              the table is there, and the Continue button is the whole point of
              the bar for them. */}
          {!hasStarted && (
            <p className="mt-3 text-center text-sm text-neutral-500 dark:text-neutral-400">
              or select a book below
            </p>
          )}
        </div>

        {/* Canonical order always: Old Testament first (collapsed unless the
            reader is currently in it), New Testament below. */}
        {renderSection("Old Testament", "OT", otBooks)}
        {renderSection("New Testament", "NT", ntBooks)}

        <SiteFooter className="mt-8 border-t-0" />
      </div>
    </main>
  );
}
