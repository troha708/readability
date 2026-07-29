/**
 * Daily reading reminder via Capacitor local notifications.
 *
 * Native-app only. On the web every call is a safe no-op — the daily reminder
 * is a feature of the mobile app, scheduled as a single repeating local
 * notification with no backend (works fully offline).
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { suppressChapterUrlSync } from "@/lib/reading-nav-guard";
import { computeContinueTarget } from "@/lib/continue-target";
import { getRoadmapData } from "@/lib/content/offline";
import { loadAllProgress } from "@/lib/progress-service";
import { getLastReadPosition, getReadingMode } from "@/lib/reading-progress";
import { chapterReference } from "@/lib/bible-book-order";

const PREF_KEY = "reading-reminder";
// Mirror of the tapped notification's deep-link, so a cold-start tap can still
// navigate even if the platform drops `extra` from the action payload.
const URL_KEY = "reading-reminder-url";
// A tapped deep-link awaiting application. Persisted (with a timestamp) so it
// survives the cold-start churn — Capacitor's webview may load the landing page
// or restore the last chapter *after* the tap fires, and the reader's scroll-spy
// rewrites the chapter into the URL — any of which can clobber a single
// navigation. We re-assert until we've actually landed on the target.
const PENDING_KEY = "reading-reminder-pending";
const PENDING_TTL_MS = 15000;
const NOTIF_ID = 1001;

export type ReminderPrefs = { enabled: boolean; hour: number; minute: number };

const DEFAULT_PREFS: ReminderPrefs = { enabled: false, hour: 20, minute: 0 };

/**
 * Builds the reminder text + tap target from the reader's progress, using the
 * exact same logic as the roadmap's Continue Reading button — e.g.
 * "Continue with John 2". Re-evaluated every time the reminder is scheduled
 * (which happens on each app launch), so it stays current.
 */
async function buildReminderContent(): Promise<{ body: string; url: string }> {
  try {
    const { books } = await getRoadmapData();
    const progress = await loadAllProgress();
    const mode = getReadingMode();
    const target = computeContinueTarget(books, progress, mode, getLastReadPosition());
    const ref = chapterReference(target.book, target.chapter);
    const url = `/try/bible/read/?book=${encodeURIComponent(target.book)}&chapter=${target.chapter}&version=BSB`;
    return { body: `Continue with ${ref}`, url };
  } catch {
    return {
      body: "Pick up where you left off.",
      url: "/try/bible/start/",
    };
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getReminderPrefs(): ReminderPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: ReminderPrefs): void {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

async function scheduleReminder(hour: number, minute: number): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
  const { body, url } = await buildReminderContent();
  try {
    window.localStorage.setItem(URL_KEY, url);
  } catch {
    // ignore storage errors
  }
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIF_ID,
        title: "Time to read 📖",
        body,
        // `on` makes it repeat daily at this hour/minute.
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        // Tapping opens the chapter the body refers to.
        extra: { url },
      },
    ],
  });
}

/**
 * Applies a pending reminder deep-link, if one is fresh. Compares the target
 * book+chapter against the current URL; if we're already there it clears the
 * pending link, otherwise it navigates there via the client-side router.
 *
 * Why client-side `navigate` and not a hard `window.location` load: a hard load
 * of a route path hits Capacitor's static server, which SPA-falls-back to the
 * landing page. Client-side routing renders the read page directly. The
 * competing scroll-spy is handled separately via {@link suppressChapterUrlSync}.
 *
 * It's persisted + re-asserted because a cold-start tap races the webview's own
 * initial load; calling this on each launch re-applies the link if we landed
 * elsewhere first. Safe to call anytime — a no-op without a fresh pending link.
 */
export function applyPendingDeepLink(navigate: (url: string) => void): void {
  if (typeof window === "undefined") return;
  let pending: { url: string; ts: number } | null = null;
  try {
    pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    pending = null;
  }
  if (!pending || Date.now() - pending.ts > PENDING_TTL_MS) return;

  const target = new URL(pending.url, window.location.origin);
  const cur = new URL(window.location.href);
  const samePath =
    cur.pathname.replace(/\/+$/, "") === target.pathname.replace(/\/+$/, "");
  const arrived =
    samePath &&
    cur.searchParams.get("book") === target.searchParams.get("book") &&
    cur.searchParams.get("chapter") === target.searchParams.get("chapter");

  if (arrived) {
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore
    }
    return;
  }
  suppressChapterUrlSync();
  navigate(pending.url);
}

/**
 * Registers the tap handler that opens the referenced chapter when the user
 * taps the reminder. Call once on app launch; no-op on web. Navigation is
 * delegated to {@link applyPendingDeepLink} using the supplied client-side
 * `navigate` (e.g. Next's router.push).
 */
let tapHandlerRegistered = false;
export async function initReminderTapHandler(
  navigate: (url: string) => void,
): Promise<void> {
  if (!isNativeApp() || tapHandlerRegistered) return;
  tapHandlerRegistered = true;
  await LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (action) => {
      let url = action?.notification?.extra?.url;
      if (typeof url !== "string" || !url) {
        // `extra` can be dropped from a repeating notification's tap payload;
        // fall back to the deep-link we stored at schedule time.
        try {
          url = window.localStorage.getItem(URL_KEY) ?? undefined;
        } catch {
          url = undefined;
        }
      }
      if (typeof url !== "string" || !url) return;
      try {
        window.localStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ url, ts: Date.now() }),
        );
      } catch {
        // ignore storage errors
      }
      applyPendingDeepLink(navigate);
    },
  );
}

export type EnableResult = {
  ok: boolean;
  reason?: "denied" | "unsupported";
};

/** Turn the daily reminder on at the given time (and persist the choice). */
export async function enableReminder(
  hour: number,
  minute: number,
): Promise<EnableResult> {
  // Reminders are a native-app feature only.
  if (!isNativeApp()) {
    savePrefs({ enabled: false, hour, minute });
    return { ok: false, reason: "unsupported" };
  }

  savePrefs({ enabled: true, hour, minute });
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") {
    savePrefs({ enabled: false, hour, minute });
    return { ok: false, reason: "denied" };
  }
  await scheduleReminder(hour, minute);
  return { ok: true };
}

/** Turn the daily reminder off (and cancel any scheduled notification). */
export async function disableReminder(): Promise<void> {
  const prefs = getReminderPrefs();
  savePrefs({ ...prefs, enabled: false });

  if (isNativeApp()) {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
  }
}

/**
 * Re-arm the reminder on app launch so it survives reboots and refreshes the
 * message/target. Safe to call anywhere; no-op on web or when reminders are off.
 */
export async function syncReminderOnLaunch(): Promise<void> {
  if (!isNativeApp()) return;
  const prefs = getReminderPrefs();
  if (!prefs.enabled) return;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") return;
  await scheduleReminder(prefs.hour, prefs.minute);
}

/** "8:00 PM" style label from 24h hour/minute. */
export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}
