"use client";

import { useEffect, useState } from "react";
import {
  clearReadingHistory,
  getReadingHistory,
  groupHistoryByDay,
  type HistoryEntry,
} from "@/lib/reading-history";
import { deleteAllProgress } from "@/lib/progress-service";

/**
 * The chapters this browser has opened, newest first, grouped by day. Read
 * from storage on open rather than held in the reader's state — it changes as
 * you scroll through chapters, and the sheet should show what's true when you
 * ask for it.
 */
export function ReadingHistorySheet({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    setEntries(getReadingHistory());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = groupHistoryByDay(entries);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reading history"
        className="sheet-backdrop relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-neutral-200 bg-paper shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <span className="font-display text-base font-bold text-neutral-900 dark:text-white">
            Reading history
            <span className="ml-2 font-scripture text-xs font-normal text-neutral-400">
              {entries.length}
            </span>
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close history"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6">
          {entries.length === 0 ? (
            <p className="py-6 font-scripture text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Nothing here yet. Chapters you open will be listed, newest first.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <h3 className="mb-1 border-b border-neutral-200 pb-1 font-scripture text-[13px] italic text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
                  {group.label}
                </h3>
                <ul>
                  {group.entries.map((e) => (
                    <li key={`${e.book}:${e.chapter}`}>
                      <a
                        href={`/try/bible/read?book=${encodeURIComponent(e.book)}&chapter=${e.chapter}&version=${e.version}`}
                        className="flex items-baseline gap-3 py-1.5 font-scripture text-[15px] text-neutral-800 hover:text-gold dark:text-neutral-300 dark:hover:text-gold-bright"
                      >
                        <span>
                          {e.book} {e.chapter}
                        </span>
                        <span className="ml-auto shrink-0 text-[13px] tabular-nums text-neutral-400 dark:text-neutral-500">
                          {new Date(e.at).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Foot: what this is, and the ways to get rid of it. Both deletes
            are two-step — they have no undo, and they sit a few pixels from
            links you click to navigate. Each sits with its own sentence,
            because the two claims are different: history never leaves the
            device, progress does. */}
        <div className="flex items-center justify-between gap-4 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <p className="font-scripture text-[12px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            Kept on this device only — never uploaded, and not shared between
            your devices.
          </p>
          {entries.length > 0 &&
            (confirmingClear ? (
              <span className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => {
                    clearReadingHistory();
                    setEntries([]);
                    setConfirmingClear(false);
                  }}
                  className="rounded-md bg-red-600 px-3 py-1.5 font-scripture text-[13px] font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmingClear(false)}
                  className="font-scripture text-[13px] text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingClear(true)}
                className="shrink-0 whitespace-nowrap rounded-md border border-neutral-300 px-3 py-1.5 font-scripture text-[13px] font-medium text-neutral-600 transition-colors hover:border-red-400 hover:text-red-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-red-500/60 dark:hover:text-red-400"
              >
                Delete history
              </button>
            ))}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <p className="font-scripture text-[12px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            Reading progress — the chapters you have finished and your streak
            — is stored separately, and synced if you are signed in. Your
            highlights and notes are kept.
          </p>
          {confirmingWipe ? (
            <span className="flex shrink-0 items-center gap-2">
              <button
                disabled={wiping}
                onClick={async () => {
                  setWiping(true);
                  try {
                    await deleteAllProgress();
                    // Every surface behind this sheet is holding progress in
                    // state; a reload is the honest way to show it is gone.
                    window.location.reload();
                  } catch {
                    setWiping(false);
                    setConfirmingWipe(false);
                  }
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 font-scripture text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {wiping ? "Deleting…" : "Delete everything"}
              </button>
              <button
                onClick={() => setConfirmingWipe(false)}
                className="font-scripture text-[13px] text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingWipe(true)}
              className="shrink-0 whitespace-nowrap rounded-md border border-neutral-300 px-3 py-1.5 font-scripture text-[13px] font-medium text-neutral-600 transition-colors hover:border-red-400 hover:text-red-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-red-500/60 dark:hover:text-red-400"
            >
              Delete all progress
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
