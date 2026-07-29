import { IS_MOBILE } from "@/lib/build-target";
import { SITE_URL } from "@/lib/site";

// The native app is a static export with no server of its own, so its
// reports go to the production site; the web app posts same-origin.
const ENDPOINT = IS_MOBILE ? `${SITE_URL}/api/client-error` : "/api/client-error";

// Per-pageload guards: a render loop or a chatty extension must not flood
// the table with the same crash over and over.
const MAX_REPORTS = 5;
const seen = new Set<string>();
let sent = 0;

/** Fire-and-forget crash report to /api/client-error. Never throws. */
export function reportError(error: unknown, source: string) {
  try {
    if (process.env.NODE_ENV !== "production") return;
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${source}:${err.message}`;
    if (sent >= MAX_REPORTS || seen.has(key)) return;
    seen.add(key);
    sent += 1;

    const payload = JSON.stringify({
      message: err.message,
      stack: err.stack,
      digest: (err as { digest?: string }).digest,
      url: window.location.href,
      source,
    });
    // sendBeacon survives page unload but returns false when the page's
    // beacon quota is full — fall through to a keepalive fetch either way.
    if (!navigator.sendBeacon || !navigator.sendBeacon(ENDPOINT, payload)) {
      fetch(ENDPOINT, { method: "POST", body: payload, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting must never crash the app it reports on.
  }
}
