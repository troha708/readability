/**
 * A short-lived suppression flag shared between the reminder deep-link
 * navigation and the reader's scroll-spy.
 *
 * When a reminder tap programmatically navigates to a chapter, the previously
 * displayed chapter's scroll-spy can fire once during the transition and rewrite
 * the chapter back into the URL — snapping the reader off the deep-linked
 * chapter. The deep-link briefly suppresses that rewrite so its navigation wins.
 */
let suppressUntil = 0;

/** Suppress the scroll-spy's URL rewrites for `ms` milliseconds. */
export function suppressChapterUrlSync(ms = 4000): void {
  suppressUntil = Date.now() + ms;
}

/** Whether the scroll-spy should currently skip rewriting the chapter. */
export function isChapterUrlSyncSuppressed(): boolean {
  return Date.now() < suppressUntil;
}
