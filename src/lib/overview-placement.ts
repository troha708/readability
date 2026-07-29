// Where a book's overview belongs in the reading flow.
//
// The overview is now the Tyndale House book introduction (2026-07-13): genuine
// front matter — purpose, author, date, setting, and an orienting essay, with no
// plot resolution to spoil. So every book's overview renders at the START, above
// chapter 1, where it can orient a first-time reader before they begin. (This
// replaced the earlier split that kept narrative-book recaps at the end; those
// retrospective summaries have left the reading surface.)
//
// Kept as a function rather than a constant so the read page and the roadmap
// share one source of truth if placement ever needs to vary by book again.

/**
 * True when a book's overview renders at the start of the book. Always true now
 * that the overview is an introduction; `bookName` is accepted for call-site
 * symmetry and possible future per-book placement.
 */
export function isOverviewAtStart(_bookName: string): boolean {
  return true;
}
