/**
 * Tyndale Open Bible Dictionary — shared types for the web API route, the
 * offline (mobile) provider, and the dictionary UI, so every surface reads the
 * same data.
 *
 * Data: data/tyndale-dictionary/ built by scripts/build-tyndale-dictionary.mjs.
 * © Tyndale House Publishers, CC BY-SA 4.0 — see
 * data/tyndale-dictionary/_attribution.json.
 */

/** One inline run of an article body. */
export type DictRun = {
  /** Text (scripture references are written out in full, linkified at render). */
  s: string;
  /** Italic emphasis. */
  i?: 1;
  /** Cross-reference: the id of another dictionary entry this links to. */
  x?: string;
};

/** One block of an article body: a paragraph, or a subhead when `h` is set. */
export type DictBlock = { h?: 2 | 3; runs: DictRun[] };

/** A full article: id, title, body blocks. */
export type DictArticle = { id: string; t: string; b: DictBlock[] };

/**
 * Which browse facet an entry belongs to (scripts/categorize-dictionary.mjs).
 * `variant` = an alternate-spelling / "See X" redirect stub: still searchable,
 * but hidden from the facet browse. `theme` = one of the 298 Tyndale theme
 * essays folded in from the removed topics hub — a topical treatment ("The
 * Fall", "God's Covenant with Abraham") rather than a reference entry.
 */
export type DictCat =
  | "people"
  | "place"
  | "theology"
  | "culture"
  | "context"
  | "other"
  | "theme"
  | "variant";

/** A search-index row: [id, title, letter, wordCount, cat?]. */
export type DictIndexTuple = [string, string, string, number, DictCat?];

export type DictIndexEntry = {
  id: string;
  title: string;
  letter: string;
  words: number;
  /** Browse facet; absent on an un-categorized index (older data). */
  cat?: DictCat;
};

export function parseIndexEntry([id, title, letter, words, cat]: DictIndexTuple): DictIndexEntry {
  return { id, title, letter, words, cat };
}

/** Which per-letter file an article id lives in ("A"–"Z", else "#"). */
export function dictLetterOf(id: string): string {
  const c = (id[0] ?? "").toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

/** Words that name a kind of feature, never a place on their own — a
 *  qualifier strip must not turn "Sea of Galilee" into a match for "Sea". */
export const GENERIC_PLACE_WORDS = new Set([
  "sea", "seas", "river", "rivers", "mount", "mountain", "mountains", "hill",
  "hills", "valley", "brook", "wilderness", "desert", "land", "plain", "city",
  "cities", "town", "village", "water", "waters", "gulf", "spring", "springs",
  "well", "field", "fields", "forest", "rock", "stone", "garden", "gate",
  "tower", "pool", "pools", "oak", "oaks", "wall", "wadi", "way", "ascent",
  "region", "coast",
]);

/** A ", <tail>" naming a natural feature that carries its locale's name
 *  ("Zin, Wilderness of" → the wilderness IS at Zin). Built structures are
 *  excluded: "Ephraim, Gate of" is a Jerusalem gate, not the town Ephraim. */
const LOCALE_FEATURE_TAIL =
  /^(?:the\s+)?(wilderness|valley|mount|mountain|hill|spring|springs|waters|brook|plain|rock|oak|oaks|ascent)\b/i;

/**
 * Hand-verified dictionary-article → atlas-name aliases the mechanical
 * candidates can't derive: Greek/Latin/alternate names for places the atlas
 * keys under their usual biblical name. Same-named atlas places (three
 * Debirs, two Bethanys) are then told apart by the article's own citations.
 * An empty string SUPPRESSES the map: the atlas's "Eden" is Beth-eden in
 * Syria, so the Garden of Eden article must not pin there.
 */
export const DICT_ATLAS_ALIASES: Record<string, string> = {
  GardenofEden: "", // the atlas "Eden" is Beth-eden (2 Kgs 19:12), not the garden
  RiverofEgypt: "Brook of Egypt", // same wadi; "Egypt" alone would pin the country
  SeaofChinnerethSeaofChinneroth: "Sea of Galilee", // the lake's OT name
  SeaofKinnereth: "Sea of Galilee", // spelling variant of the same
  Azotus: "Ashdod", // Greek name (Acts 8:40)
  Calvary: "Golgotha", // Latin name of the same site
  Lydda: "Lod", // Greek name (Acts 9:32)
  Scythopolis: "Beth-shan", // Greek name
  MediterraneanSea: "Great Sea", // the Bible's own name for it
  Adria: "Adriatic Sea", // Acts 27:27
  Phenice: "Phoenix", // KJV spelling (Acts 27:12)
  Tharshish: "Tarshish", // KJV spelling
  Sirion: "Mount Hermon", // Deut 3:9 — the Sidonian name for Hermon
  "KiriathSepher": "Debir", // Josh 15:15 — Debir's earlier name
  "KiriathArba": "Hebron", // Gen 23:2 — Hebron's earlier name
  "EnMishpat": "Kadesh", // Gen 14:7 — "En-mishpat (that is, Kadesh)"
  Bethabara: "Bethany", // KJV at John 1:28 — Bethany beyond the Jordan
};

/**
 * The place-name forms a dictionary title might match an atlas place by, so a
 * place article can be tied to its point on the map. Handles the dictionary's
 * naming conventions:
 *   "Capernaum"          → ["Capernaum"]
 *   "Cush (Place)"       → ["Cush (Place)", "Cush"]           (strip the tag)
 *   "Galilee, Sea of"    → [..., "Sea of Galilee", "Galilee"]  (comma-inverted)
 *   "Benjamin, Gate of"  → [..., "Benjamin Gate"]              (un-inverted)
 *   "Moab, Moabites"     → [..., "Moab"]                       (region + people)
 *   "Accho, Acco"        → [..., "Acco"]              (alternate names listed)
 *   "Zin, Wilderness of" → [..., "Zin"]           (feature named for locale)
 *   "Antioch of Syria"   → [..., "Antioch"]           (qualifier, tried last)
 *   "Euphrates River"    → [..., "Euphrates"]
 *   "Aaron (Person)"     → []                                  (never a place)
 * Order matters: the caller takes the first candidate that matches, so fuller
 * forms always win over stripped-down ones.
 */
export function placeNameCandidates(title: string): string[] {
  if (/\(person\)/i.test(title)) return [];
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const stripTag = (s: string) => clean(s.replace(/\s*\([^)]*\)/g, " "));
  const noThe = (s: string) => clean(s.replace(/^the\s+/i, ""));
  const out: string[] = [];
  const push = (s: string | undefined) => {
    if (!s) return;
    const c = clean(s);
    if (c && !GENERIC_PLACE_WORDS.has(c.toLowerCase()) && !out.includes(c)) out.push(c);
  };

  push(title);
  push(stripTag(title));

  const segs = title.split(",").map((s) => noThe(stripTag(s))).filter(Boolean);
  const head = segs[0] ?? "";
  for (const tail of segs.slice(1)) {
    // "Galilee, Sea of" → "Sea of Galilee": the comma-inverted full name.
    push(`${tail} ${head}`);
    // "Benjamin, Gate of" → "Benjamin Gate": the atlas's un-inverted form.
    if (/\sof$/i.test(tail)) push(`${head} ${tail.replace(/\s+of$/i, "")}`);
    // "Moab, Moabites" / "Arabia, Arabs" → "Moab": the head is the place only
    // when the tail is its people/adjective (shares a prefix), not a
    // descriptor ("Adam, the Second" must NOT map to the place Adam).
    let common = 0;
    const h = head.toLowerCase();
    const t = tail.toLowerCase();
    while (common < h.length && common < t.length && h[common] === t[common]) common++;
    if (head && common >= 3) push(head);
    // "Zin, Wilderness of" → "Zin": a natural feature named after its locale.
    if (head && LOCALE_FEATURE_TAIL.test(tail)) push(head);
    // "Accho, Acco" / "Baharum, Baharumite, Bahurim": names listed after the
    // head are alternate spellings, each a name in its own right.
    push(tail);
  }

  // Last-resort strips over everything gathered so far — only reached when
  // every fuller form failed to match.
  for (const c of [...out]) {
    const ofAt = c.toLowerCase().indexOf(" of ");
    if (ofAt > 0) {
      // "Antioch of Syria" → "Antioch" (generic heads like "Sea" are blocked).
      push(c.slice(0, ofAt));
      // "City of Rome" → "Rome".
      push(noThe(c.slice(ofAt + 4)));
    }
    // "Euphrates River" → "Euphrates".
    push(c.replace(/\s+river$/i, ""));
    // "Sodom and Gomorrah" → "Sodom": pin the pair on its first city.
    const andAt = c.toLowerCase().indexOf(" and ");
    if (andAt > 0) push(c.slice(0, andAt));
  }
  return out;
}
