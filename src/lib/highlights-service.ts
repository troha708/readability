import { createClient } from "@/lib/supabase/client";

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

/**
 * One reader's mark on one verse. The two halves are independent: a highlight
 * with no note is a colour, a note with no highlight is `color: null`. Wanting
 * to say something about a verse without painting it is an ordinary thing to
 * want, so the colour is optional rather than assumed.
 */
export type VerseHighlight = {
  color: HighlightColor | null;
  note: string;
  createdAt: string;
};

// key format: "Book:chapter:verse"
export type HighlightsMap = Record<string, VerseHighlight>;

const STORAGE_KEY = "bible-highlights";
const MIGRATED_PREFIX = "bible-highlights-migrated:";
const COLOR_LABELS_KEY = "bible-highlight-color-labels";

export const HIGHLIGHT_COLORS: { name: HighlightColor; bg: string; ring: string; dot: string }[] = [
  { name: "yellow", bg: "bg-yellow-100/60 dark:bg-yellow-400/15", ring: "ring-yellow-300 dark:ring-yellow-600", dot: "bg-yellow-400" },
  { name: "green", bg: "bg-emerald-100/60 dark:bg-emerald-400/15", ring: "ring-emerald-300 dark:ring-emerald-600", dot: "bg-emerald-400" },
  { name: "blue", bg: "bg-blue-100/60 dark:bg-blue-400/15", ring: "ring-blue-300 dark:ring-blue-600", dot: "bg-blue-400" },
  { name: "pink", bg: "bg-pink-100/60 dark:bg-pink-400/15", ring: "ring-pink-300 dark:ring-pink-600", dot: "bg-pink-400" },
];

export function highlightColorInfo(color: HighlightColor) {
  return HIGHLIGHT_COLORS.find((c) => c.name === color) ?? HIGHLIGHT_COLORS[0];
}

// How a note with no highlight shows up in the lists: no tint on the verse —
// nothing was painted — and a hollow marker where a colour dot would sit.
export const NOTE_ONLY_STYLE = {
  bg: "",
  ring: "ring-neutral-300 dark:ring-neutral-600",
  dot: "border border-neutral-400 dark:border-neutral-500",
};

// ── localStorage helpers ────────────────────────────────────

function getLocal(): HighlightsMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setLocal(map: HighlightsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

// ── Auth ────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// ── Supabase reads ──────────────────────────────────────────

async function fetchSupabaseHighlights(userId: string): Promise<HighlightsMap> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_highlights")
    .select("book, chapter, verse, color, note, created_at")
    .eq("user_id", userId);

  if (error) throw error;

  const map: HighlightsMap = {};
  for (const row of data ?? []) {
    map[`${row.book}:${row.chapter}:${row.verse}`] = {
      color: (row.color as HighlightColor | null) ?? null,
      note: row.note ?? "",
      createdAt: row.created_at,
    };
  }
  return map;
}

// ── Supabase writes ─────────────────────────────────────────

async function upsertSupabaseHighlight(
  userId: string,
  book: string,
  chapter: number,
  verse: number,
  highlight: VerseHighlight,
): Promise<void> {
  const supabase = createClient();
  await supabase.from("user_highlights").upsert(
    {
      user_id: userId,
      book,
      chapter,
      verse,
      color: highlight.color,
      note: highlight.note || null,
      created_at: highlight.createdAt,
    },
    { onConflict: "user_id,book,chapter,verse" },
  );
}

async function deleteSupabaseHighlight(
  userId: string,
  book: string,
  chapter: number,
  verse: number,
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("user_highlights")
    .delete()
    .eq("user_id", userId)
    .eq("book", book)
    .eq("chapter", chapter)
    .eq("verse", verse);
}

// ── Migration ───────────────────────────────────────────────

async function migrateLocalHighlights(userId: string): Promise<void> {
  const flag = `${MIGRATED_PREFIX}${userId}`;
  if (typeof window === "undefined" || localStorage.getItem(flag)) return;

  const local = getLocal();
  const keys = Object.keys(local);
  if (keys.length === 0) {
    localStorage.setItem(flag, "true");
    return;
  }

  const supabase = createClient();
  const rows = keys.map((key) => {
    const [book, chapterStr, verseStr] = key.split(":");
    return {
      user_id: userId,
      book,
      chapter: parseInt(chapterStr, 10),
      verse: parseInt(verseStr, 10),
      color: local[key].color,
      note: local[key].note || null,
      created_at: local[key].createdAt,
    };
  });

  const { error } = await supabase
    .from("user_highlights")
    .upsert(rows, { onConflict: "user_id,book,chapter,verse" });
  if (error) throw error;

  localStorage.setItem(flag, "true");
}

// ── Public API ──────────────────────────────────────────────

export async function loadHighlights(): Promise<HighlightsMap> {
  const userId = await getUserId();
  if (!userId) return getLocal();

  try {
    await migrateLocalHighlights(userId);
    return await fetchSupabaseHighlights(userId);
  } catch {
    return getLocal();
  }
}

/**
 * Write a verse's mark. A null colour with note text is a note on its own; a
 * null colour with no note is nothing at all, so the record is removed rather
 * than stored empty and the return is null — that is the caller's cue to drop
 * the verse from its state.
 */
export async function saveHighlight(
  book: string,
  chapter: number,
  verse: number,
  color: HighlightColor | null,
  note: string,
): Promise<VerseHighlight | null> {
  if (!color && !note.trim()) {
    await removeHighlight(book, chapter, verse);
    return null;
  }

  const key = `${book}:${chapter}:${verse}`;
  const highlight: VerseHighlight = {
    color,
    note,
    createdAt: new Date().toISOString(),
  };

  // Always persist to localStorage
  const local = getLocal();
  local[key] = highlight;
  setLocal(local);

  // Sync to Supabase if logged in
  const userId = await getUserId();
  if (userId) {
    try {
      await upsertSupabaseHighlight(userId, book, chapter, verse, highlight);
    } catch {
      /* localStorage has the data */
    }
  }

  return highlight;
}

export async function removeHighlight(
  book: string,
  chapter: number,
  verse: number,
): Promise<void> {
  const key = `${book}:${chapter}:${verse}`;

  const local = getLocal();
  delete local[key];
  setLocal(local);

  const userId = await getUserId();
  if (userId) {
    try {
      await deleteSupabaseHighlight(userId, book, chapter, verse);
    } catch {
      /* localStorage is source of truth */
    }
  }
}

export function getHighlightsForChapter(
  allHighlights: HighlightsMap,
  book: string,
  chapter: number,
): Record<number, VerseHighlight> {
  const result: Record<number, VerseHighlight> = {};
  const prefix = `${book}:${chapter}:`;
  for (const key of Object.keys(allHighlights)) {
    if (key.startsWith(prefix)) {
      const verse = parseInt(key.slice(prefix.length), 10);
      result[verse] = allHighlights[key];
    }
  }
  return result;
}

// ── Color labels ─────────────────────────────────────────────

export type ColorLabels = Partial<Record<HighlightColor, string>>;

export function getColorLabels(): ColorLabels {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(COLOR_LABELS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveColorLabels(labels: ColorLabels): void {
  localStorage.setItem(COLOR_LABELS_KEY, JSON.stringify(labels));
}
