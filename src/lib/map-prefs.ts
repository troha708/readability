/**
 * Map display preferences, shared by the atlas page and the reader's
 * chapter-map sheet so a toggle set in one holds in the other. Kept out of
 * the URL deliberately: this is how the reader likes to see labels, not part
 * of a shared view (unlike ?min=, which changes which places are on the map).
 */
const MODERN_NAMES_KEY = "mapModernNames";

/** Show each place's modern identification under its name on the map. */
export function readShowModernNames(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MODERN_NAMES_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowModernNames(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODERN_NAMES_KEY, on ? "1" : "0");
  } catch {
    // Private-mode storage failures shouldn't break the map.
  }
}
