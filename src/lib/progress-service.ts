import { createClient } from "@/lib/supabase/client";
import { flagLastReadCompleted } from "./reading-progress";
import type { ReadingProgress } from "./reading-progress";

const READ_KEY = "bible-reading-progress";
const QUIZ_KEY = "bible-quiz-progress";
const DATES_KEY = "bible-completion-dates";
const TIMESTAMPS_KEY = "bible-chapter-timestamps";
const MIGRATED_PREFIX = "bible-progress-migrated:";

// ── localStorage helpers ────────────────────────────────────

function getLocalProgress(key: string): ReadingProgress {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function setLocalProgress(key: string, progress: ReadingProgress): void {
  localStorage.setItem(key, JSON.stringify(progress));
}

function getLocalQuizProgress(): ReadingProgress {
  if (typeof window === "undefined") return {};
  if (localStorage.getItem(QUIZ_KEY) === null) {
    const read = getLocalProgress(READ_KEY);
    localStorage.setItem(QUIZ_KEY, JSON.stringify(read));
    return { ...read };
  }
  return getLocalProgress(QUIZ_KEY);
}

function getLocalTimestamps(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(TIMESTAMPS_KEY) || "{}");
  } catch {
    return {};
  }
}

function recordLocalTimestamp(key: string): void {
  const ts = getLocalTimestamps();
  if (!ts[key]) {
    ts[key] = new Date().toISOString();
    localStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(ts));
  }
}

function getLocalDates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DATES_KEY) || "[]");
  } catch {
    return [];
  }
}

function recordLocalDate(): void {
  const dates = getLocalDates();
  const today = todayStr();
  if (!dates.includes(today)) {
    dates.push(today);
    localStorage.setItem(DATES_KEY, JSON.stringify(dates));
  }
}

/**
 * Fired when a chapter is newly completed, so UI (e.g. the signup nudge) can
 * react to reading milestones. No payload — listeners read current state.
 * Exported for the read-mode switch: marking an already-read chapter complete
 * is a no-op write, but becoming "complete under read mode" is a milestone.
 */
export function emitMilestone(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("readability:milestone"));
  } catch {
    // ignore
  }
}

// ── Date helpers ────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

async function fetchSupabaseProgress(
  userId: string,
): Promise<{ read: ReadingProgress; quiz: ReadingProgress; timestamps: Record<string, string> }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_progress")
    .select("book, chapter, reading_complete, quiz_complete, completed_at")
    .eq("user_id", userId);

  if (error) throw error;

  const read: ReadingProgress = {};
  const quiz: ReadingProgress = {};
  const timestamps: Record<string, string> = {};
  for (const row of data ?? []) {
    const key = `${row.book}:${row.chapter}`;
    if (row.reading_complete) read[key] = true;
    if (row.quiz_complete) quiz[key] = true;
    if (row.completed_at) timestamps[key] = row.completed_at;
  }
  return { read, quiz, timestamps };
}

// ── Supabase writes ─────────────────────────────────────────

async function setProgressField(
  userId: string,
  book: string,
  chapter: number,
  field: "reading_complete" | "quiz_complete",
  completedAt: string | null,
): Promise<void> {
  const supabase = createClient();

  // Single upsert instead of read-then-write: PostgREST's ON CONFLICT DO
  // UPDATE only touches the columns in the payload, so the other completion
  // flag (and completed_at, when omitted) keeps its existing value even when
  // two tabs or devices write concurrently.
  const payload: Record<string, unknown> = {
    user_id: userId,
    book,
    chapter,
    [field]: true,
  };
  if (completedAt) payload.completed_at = completedAt;

  const { error } = await supabase
    .from("user_progress")
    .upsert(payload, { onConflict: "user_id,book,chapter" });
  if (error) throw error;
}

// ── Migration: localStorage → Supabase on first login ──────

async function migrateLocalProgress(userId: string): Promise<void> {
  const flag = `${MIGRATED_PREFIX}${userId}`;
  if (typeof window === "undefined" || localStorage.getItem(flag)) return;

  const localRead = getLocalProgress(READ_KEY);
  const localQuiz = getLocalQuizProgress();
  const allKeys = new Set([
    ...Object.keys(localRead),
    ...Object.keys(localQuiz),
  ]);

  if (allKeys.size === 0) {
    localStorage.setItem(flag, "true");
    return;
  }

  const supabase = createClient();
  const now = new Date().toISOString();
  const localTimestamps = getLocalTimestamps();

  const { data: existing } = await supabase
    .from("user_progress")
    .select("book, chapter, reading_complete, quiz_complete, completed_at")
    .eq("user_id", userId);

  const existingMap = new Map<
    string,
    { reading_complete: boolean; quiz_complete: boolean; completed_at: string | null }
  >();
  for (const row of existing ?? []) {
    existingMap.set(`${row.book}:${row.chapter}`, row);
  }

  const rows = [];
  for (const key of allKeys) {
    const [book, chapterStr] = key.split(":");
    const chapter = parseInt(chapterStr, 10);
    const ex = existingMap.get(key);
    rows.push({
      user_id: userId,
      book,
      chapter,
      reading_complete: !!localRead[key] || (ex?.reading_complete ?? false),
      quiz_complete: !!localQuiz[key] || (ex?.quiz_complete ?? false),
      completed_at: ex?.completed_at ?? localTimestamps[key] ?? now,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("user_progress")
      .upsert(rows, { onConflict: "user_id,book,chapter" });
    if (error) throw error;
  }

  localStorage.setItem(flag, "true");
}

// ── Public API ──────────────────────────────────────────────

/**
 * Load all reading and quiz progress. For logged-in users, migrates
 * localStorage data to Supabase on first call, then reads from Supabase.
 */
export async function loadAllProgress(): Promise<{
  read: ReadingProgress;
  quiz: ReadingProgress;
  timestamps: Record<string, string>;
}> {
  const userId = await getUserId();
  if (!userId) {
    return {
      read: getLocalProgress(READ_KEY),
      quiz: getLocalQuizProgress(),
      timestamps: getLocalTimestamps(),
    };
  }

  try {
    await migrateLocalProgress(userId);
    return await fetchSupabaseProgress(userId);
  } catch (err) {
    console.error("[progress] Supabase load failed; falling back to localStorage", err);
    return {
      read: getLocalProgress(READ_KEY),
      quiz: getLocalQuizProgress(),
      timestamps: getLocalTimestamps(),
    };
  }
}

export async function markReadingComplete(
  book: string,
  chapter: number,
): Promise<void> {
  const key = `${book}:${chapter}`;
  // Run the legacy quiz migration before the read write: it seeds QUIZ_KEY
  // from READ_KEY when QUIZ_KEY is missing, and must not mistake this fresh
  // read for pre-split progress (which would count as a completed quiz).
  getLocalQuizProgress();
  const local = getLocalProgress(READ_KEY);
  const alreadyDone = !!local[key];
  local[key] = true;
  setLocalProgress(READ_KEY, local);
  recordLocalTimestamp(key);
  if (!alreadyDone) {
    emitMilestone();
    flagLastReadCompleted(book, chapter);
  }

  const userId = await getUserId();
  if (userId) {
    try {
      await setProgressField(
        userId,
        book,
        chapter,
        "reading_complete",
        alreadyDone ? null : new Date().toISOString(),
      );
    } catch (err) {
      // localStorage already has the data; cloud sync will be stale.
      console.error("[progress] Supabase write failed", err);
    }
  }
}

export async function markQuizComplete(
  book: string,
  chapter: number,
): Promise<void> {
  const key = `${book}:${chapter}`;
  const local = getLocalQuizProgress();
  const alreadyDone = !!local[key];
  local[key] = true;
  setLocalProgress(QUIZ_KEY, local);
  if (!alreadyDone) {
    recordLocalDate();
    recordLocalTimestamp(key);
    emitMilestone();
    flagLastReadCompleted(book, chapter);
  }

  const userId = await getUserId();
  if (userId) {
    try {
      await setProgressField(
        userId,
        book,
        chapter,
        "quiz_complete",
        alreadyDone ? null : new Date().toISOString(),
      );
    } catch (err) {
      // localStorage already has the data; cloud sync will be stale.
      console.error("[progress] Supabase write failed", err);
    }
  }
}

/** Read-mode shorthand: marks reading done and records the completion date. */
export async function markChapterComplete(
  book: string,
  chapter: number,
): Promise<void> {
  const key = `${book}:${chapter}`;
  // Same migration guard as markReadingComplete: seed QUIZ_KEY before the
  // read write so this chapter isn't misread as pre-split quiz progress.
  getLocalQuizProgress();
  const local = getLocalProgress(READ_KEY);
  const alreadyDone = !!local[key];
  local[key] = true;
  setLocalProgress(READ_KEY, local);
  if (!alreadyDone) {
    recordLocalDate();
    recordLocalTimestamp(key);
    emitMilestone();
    flagLastReadCompleted(book, chapter);
  }

  const userId = await getUserId();
  if (userId) {
    try {
      await setProgressField(
        userId,
        book,
        chapter,
        "reading_complete",
        alreadyDone ? null : new Date().toISOString(),
      );
    } catch (err) {
      // localStorage already has the data; cloud sync will be stale.
      console.error("[progress] Supabase write failed", err);
    }
  }
}

