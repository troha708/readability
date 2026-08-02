/**
 * Single source of truth for "where the reader is up to" — used by both the
 * roadmap's Continue Reading button and the daily reminder notification, so
 * they can never drift.
 *
 * Logic: the chapter the reader actually had open last (saved by the reader
 * once reading intent is shown) anchors the target — resumed while unfinished
 * or when it was already complete before the visit (a re-read), advanced past
 * when it completed during the visit (an explicit completedHere flag written
 * at completion time — no clock comparisons). Without a usable position, fall
 * back to completion data:
 * among canon-ordered books, pick the one with the most recent activity
 * that's started but not finished, then its first incomplete chapter. If every
 * started book is complete, advance to the next incomplete book in canon order
 * after the most recently finished one (so completing John points at Acts).
 * Mode decides what "finished" means (read-only vs read + quiz). Falls back to
 * John 1 for a brand-new reader — the recommended first book.
 */
import { bibleBookSortIndex } from "./bible-book-order";
import type { LastReadPosition, ReadingMode } from "./reading-progress";

export type ContinueBook = {
  name: string;
  chapters: { chapterNumber: number }[];
};

export type ProgressMaps = {
  read: Record<string, boolean>;
  quiz: Record<string, boolean>;
  timestamps: Record<string, string>;
};

export type ContinueTarget = { book: string; chapter: number };

export function computeContinueTarget(
  books: ContinueBook[],
  progress: ProgressMaps,
  mode: ReadingMode,
  lastRead?: LastReadPosition | null,
): ContinueTarget {
  const { read, quiz, timestamps } = progress;

  const isFullyDone = (bookName: string, chNum: number): boolean => {
    const key = `${bookName}:${chNum}`;
    if (mode === "read") return !!read[key];
    return !!read[key] && !!quiz[key];
  };

  // The last-visited chapter anchors the target:
  //  - still unfinished → resume it (the reader exited mid-chapter);
  //  - finished DURING that visit (completedHere, set by the progress
  //    writers only on a NEWLY recorded completion) → the reader stopped at
  //    the chapter boundary; advance to the book's next incomplete chapter,
  //    falling through to the canon-advance logic when there is none;
  //  - finished on an earlier visit → a re-read of an already-completed
  //    chapter (common once whole books are done); resume it.
  if (lastRead) {
    const lastReadBook = books.find((b) => b.name === lastRead.book);
    const chapterIdx = lastReadBook
      ? lastReadBook.chapters.findIndex((ch) => ch.chapterNumber === lastRead.chapter)
      : -1;
    if (lastReadBook && chapterIdx !== -1) {
      if (!isFullyDone(lastRead.book, lastRead.chapter)) {
        return { book: lastRead.book, chapter: lastRead.chapter };
      }
      if (!lastRead.completedHere) {
        return { book: lastRead.book, chapter: lastRead.chapter };
      }
      // Skip chapters completed on earlier visits (out-of-order readers):
      // the roadmap's own "next unread" highlight refuses completed
      // chapters, and the button must agree with it.
      for (let i = chapterIdx + 1; i < lastReadBook.chapters.length; i++) {
        const ch = lastReadBook.chapters[i];
        if (!isFullyDone(lastRead.book, ch.chapterNumber)) {
          return { book: lastRead.book, chapter: ch.chapterNumber };
        }
      }
    }
  }

  const sorted = [...books].sort(
    (a, b) => bibleBookSortIndex(a.name) - bibleBookSortIndex(b.name),
  );

  // Find the started-but-unfinished book with the most recent activity.
  let lastActiveBook: ContinueBook | null = null;
  let latestTime = 0;
  for (const book of sorted) {
    if (book.chapters.length === 0) continue;
    const hasAny = book.chapters.some((ch) => isFullyDone(book.name, ch.chapterNumber));
    const allDone = book.chapters.every((ch) => isFullyDone(book.name, ch.chapterNumber));
    if (hasAny && !allDone) {
      let bookLatest = 0;
      for (const ch of book.chapters) {
        const stamp = timestamps[`${book.name}:${ch.chapterNumber}`];
        if (stamp) {
          const t = new Date(stamp).getTime();
          if (t > bookLatest) bookLatest = t;
        }
      }
      if (bookLatest > latestTime) {
        latestTime = bookLatest;
        lastActiveBook = book;
      }
    }
  }

  if (lastActiveBook) {
    const active = lastActiveBook;
    const firstIncomplete = active.chapters.find(
      (ch) => !isFullyDone(active.name, ch.chapterNumber),
    );
    return { book: active.name, chapter: firstIncomplete ? firstIncomplete.chapterNumber : 1 };
  }

  // Every started book is finished: advance to the next incomplete book in
  // canon order after the most recently completed one (wrapping past
  // Revelation), so finishing John points at Acts, not back at John 1.
  let lastDoneBook: string | null = null;
  let lastDoneTime = 0;
  for (const book of sorted) {
    for (const ch of book.chapters) {
      if (!isFullyDone(book.name, ch.chapterNumber)) continue;
      const stamp = timestamps[`${book.name}:${ch.chapterNumber}`];
      if (stamp) {
        const t = new Date(stamp).getTime();
        if (t > lastDoneTime) {
          lastDoneTime = t;
          lastDoneBook = book.name;
        }
      }
    }
  }
  if (lastDoneBook) {
    const startIdx = sorted.findIndex((b) => b.name === lastDoneBook);
    for (let step = 1; step <= sorted.length; step++) {
      const book = sorted[(startIdx + step) % sorted.length];
      if (book.chapters.length === 0) continue;
      const firstIncomplete = book.chapters.find(
        (ch) => !isFullyDone(book.name, ch.chapterNumber),
      );
      if (firstIncomplete) {
        return { book: book.name, chapter: firstIncomplete.chapterNumber };
      }
    }
  }

  return { book: "John", chapter: 1 };
}
