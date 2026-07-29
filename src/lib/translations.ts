/**
 * The translations the app offers. Reading is limited to the two most-read
 * public-domain texts (BSB, KJV); the verse-compare sheet adds the older,
 * more literal set so a reader can see a single verse rendered several ways.
 * Client-safe (no fs) — shared by the reader picker, the verse compare sheet,
 * and the server-side verse lookup.
 */
export const READING_VERSIONS: string[] = ["BSB", "KJV"];

export const COMPARE_VERSIONS: string[] = [
  "BSB",
  "KJV",
  "WEB",
  "ASV",
  "GNV",
  "YLT",
  "DBY",
];

export const TRANSLATION_NAMES: Record<string, string> = {
  BSB: "Berean Standard Bible",
  KJV: "King James (Authorised) Version",
  WEB: "World English Bible",
  ASV: "American Standard Version (1901)",
  GNV: "Geneva Bible (1599)",
  YLT: "Young's Literal Translation (1898)",
  DBY: "Darby Translation (1890)",
};
