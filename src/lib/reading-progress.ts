const MODE_KEY = "bible-reading-mode";
const LAST_READ_KEY = "bible-last-read-url";
const LAST_READ_DONE_KEY = "bible-last-read-done-here";

export type ReadingProgress = Record<string, boolean>;
export type ReadingMode = "study" | "read";

// ── Reading mode ─────────────────────────────────────────────

export function getReadingMode(): ReadingMode {
  // Read is the default; Study (read + quiz) is opt-in. Only an explicit
  // "study" choice overrides it.
  if (typeof window === "undefined") return "read";
  return localStorage.getItem(MODE_KEY) === "study" ? "study" : "read";
}

export function setReadingMode(mode: ReadingMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

// ── Last read position ──────────────────────────────────────

/**
 * Record the reader's position. `completedHere` notes whether the chapter
 * reached completion during the visit being saved — the continue target uses
 * it to tell "stopped at the chapter boundary" (advance) from a re-read of a
 * chapter finished on an earlier visit (resume). An explicit flag, not a
 * timestamp comparison: completion stamps are first-write-wins and clocks
 * differ across devices, so time math misclassifies real flows.
 */
export function saveLastReadUrl(url: string, completedHere = false): void {
  localStorage.setItem(LAST_READ_KEY, url);
  if (completedHere) localStorage.setItem(LAST_READ_DONE_KEY, "1");
  else localStorage.removeItem(LAST_READ_DONE_KEY);
}

/**
 * Mark the saved position as completed-during-its-visit, if the chapter that
 * just completed is the saved one. Called by the progress service on every
 * NEWLY recorded completion — the reader's end-of-chapter sentinel, the
 * inline quiz, and the standalone quiz page (which completes a chapter the
 * reader anchored earlier) all funnel through it. Re-completions of an
 * already-done chapter never call this, so a deliberate re-read still
 * resumes rather than advances.
 */
export function flagLastReadCompleted(book: string, chapter: number): void {
  const pos = getLastReadPosition();
  if (pos && pos.book === book && pos.chapter === chapter) {
    localStorage.setItem(LAST_READ_DONE_KEY, "1");
  }
}

export function getLastReadUrl(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_READ_KEY);
}

export type LastReadPosition = {
  book: string;
  chapter: number;
  /** The chapter completed during the visit this position was saved on. */
  completedHere: boolean;
};

/** The last-read URL parsed into a book + chapter, or null if absent/malformed. */
export function getLastReadPosition(): LastReadPosition | null {
  const url = getLastReadUrl();
  if (!url) return null;
  try {
    const params = new URL(url, "http://localhost").searchParams;
    const book = params.get("book");
    const chapter = Number(params.get("chapter"));
    if (!book || !Number.isInteger(chapter) || chapter < 1) return null;
    return {
      book,
      chapter,
      completedHere: localStorage.getItem(LAST_READ_DONE_KEY) === "1",
    };
  } catch {
    return null;
  }
}
