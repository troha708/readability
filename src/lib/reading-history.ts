/**
 * Which chapters this browser has opened, most recent first.
 *
 * Separate from reading *progress*: progress records what you finished, this
 * records what you looked at. A chapter you opened, read two verses of and
 * left never appears in progress, but it is exactly what someone means when
 * they ask "what was I reading yesterday?".
 *
 * Local to the browser and never sent anywhere — the reader is usable signed
 * out, and a list of what someone has been reading in the Bible is the kind of
 * thing that should stay on their own machine unless they ask otherwise. That
 * also means it does not follow you between devices, which the history view
 * says out loud.
 */
const HISTORY_KEY = "bible-reading-history";

/** Most recent N visits kept; older ones fall off the end. */
const MAX_ENTRIES = 300;

export type HistoryEntry = {
  book: string;
  chapter: number;
  /** Translation the chapter was read in, for the link back. */
  version: string;
  /** Epoch ms of the most recent visit to this chapter. */
  at: number;
};

function read(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Written by an older shape, or hand-edited: drop anything malformed
    // rather than rendering undefined into the list.
    return parsed.filter(
      (e): e is HistoryEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as HistoryEntry).book === "string" &&
        Number.isInteger((e as HistoryEntry).chapter) &&
        typeof (e as HistoryEntry).at === "number",
    );
  } catch {
    return [];
  }
}

export function getReadingHistory(): HistoryEntry[] {
  return read();
}

/**
 * Note a visit. One entry per chapter: revisiting moves it to the front and
 * updates its timestamp rather than appending a duplicate, so the list reads
 * as "chapters you've been in", not a scroll log. The reader calls this as the
 * visible chapter changes, which includes chapters scrolled into on a
 * continuous read.
 */
export function recordChapterView(book: string, chapter: number, version: string): void {
  if (typeof window === "undefined") return;
  if (!book || !Number.isInteger(chapter) || chapter < 1) return;
  try {
    const entries = read().filter((e) => !(e.book === book && e.chapter === chapter));
    entries.unshift({ book, chapter, version, at: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage full or blocked (iOS "Block All Cookies", locked-down WebViews).
    // History is a convenience; losing it must never break the reader.
  }
}

export function clearReadingHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // As above.
  }
}

/**
 * Entries bucketed under "Today" / "Yesterday" / a date, in order. Grouping
 * lives here rather than in the component so the boundaries are computed from
 * local calendar days rather than from elapsed hours — "yesterday" at 00:30
 * means the previous date, not 24 hours ago.
 */
export function groupHistoryByDay(
  entries: HistoryEntry[],
  now = new Date(),
): { label: string; entries: HistoryEntry[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;

  const groups: { label: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const day = startOfDay(new Date(entry.at));
    const label =
      day === today
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : new Date(entry.at).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}
