"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isNativeApp } from "@/lib/notifications";
import { getReadingMode } from "@/lib/reading-progress";

/**
 * A single, one-time reminder that an account exists — shown to signed-out
 * guests only, once they've finished their first chapter. One plain sentence,
 * dismissible, never repeated. The idea is to let users earn the signup rather
 * than gate reading behind it.
 */

const SHOWN_KEY = "readability:nudges-shown";
const READ_KEY = "bible-reading-progress";
const QUIZ_KEY = "bible-quiz-progress";
/** Kept from the old milestone series so guests who already dismissed it
 *  aren't shown the reminder again. */
const NUDGE_ID = "first-chapter";

function completedCount(): number {
  // In study mode a chapter only counts once its quiz is done — reading the
  // text is just the first half, and a skipped quiz shouldn't earn a nudge.
  // In read mode, reaching the end of a chapter is itself the completion.
  const keys =
    getReadingMode() === "read" ? [READ_KEY, QUIZ_KEY] : [QUIZ_KEY];
  const set = new Set<string>();
  for (const key of keys) {
    try {
      const obj = JSON.parse(localStorage.getItem(key) || "{}");
      for (const k in obj) if (obj[k]) set.add(k);
    } catch {
      // ignore
    }
  }
  return set.size;
}

function getShown(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]");
  } catch {
    return [];
  }
}

function markShown(id: string): void {
  const shown = getShown();
  if (!shown.includes(id)) {
    shown.push(id);
    try {
      localStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
    } catch {
      // ignore
    }
  }
}

export function SignupNudge() {
  const [visible, setVisible] = useState(false);

  const evaluate = useCallback(async () => {
    if (typeof window === "undefined" || isNativeApp()) return;
    // Inside an iframe (the atlas embed on other sites) never nudge.
    if (window.top !== window.self) return;
    const path = window.location.pathname;
    if (path.startsWith("/login") || path.startsWith("/signup")) return;

    // Signed-in users never get nudged.
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) return;
    } catch {
      // if we can't tell, fall through and let the milestone logic decide
    }

    if (completedCount() >= 1 && !getShown().includes(NUDGE_ID)) {
      markShown(NUDGE_ID);
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    const onMilestone = () => void evaluate();
    window.addEventListener("readability:milestone", onMilestone);
    // Also check shortly after load, for guests who already have progress.
    const t = setTimeout(() => void evaluate(), 1500);
    return () => {
      window.removeEventListener("readability:milestone", onMilestone);
      clearTimeout(t);
    };
  }, [evaluate]);

  if (!visible) return null;

  const next = encodeURIComponent(
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/try/bible/start",
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pointer-events-none">
      <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-neutral-200 bg-paper p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          You can{" "}
          <Link
            href={`/signup?next=${next}`}
            onClick={() => setVisible(false)}
            className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
          >
            sign up
          </Link>{" "}
          to sync your reading progress across devices.
        </p>
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
