/**
 * Chapter-map place index: types and the tuple parser shared by the web
 * fetch path (client.ts → /api/places) and the mobile offline path
 * (offline.ts → bundled /offline/places). Data is built by
 * scripts/build-places.mjs from the OpenBible.info Bible Geocoding dataset
 * (CC BY 4.0); coordinates are integer units in the basemap grid.
 */

/** 0 settlement · 1 water · 2 region/people · 3 natural feature */
export type PlaceKind = 0 | 1 | 2 | 3;

export type ChapterPlace = {
  name: string;
  x: number;
  y: number;
  kind: PlaceKind;
  /** The scholarly identification is split across candidate sites. */
  uncertain: boolean;
  verses: number[];
  /** "Harran", "the Barada River" — empty when unknown or same as name. */
  modern: string;
  /** openbible.info path piece "<id>/<slug>" — the page listing the sources
   *  attesting this identification. */
  link: string;
};

/** Full URL of a place's OpenBible.info page (sources + confidence). */
export function openBiblePlaceUrl(link: string): string {
  return `https://www.openbible.info/geo/ancient/${link}`;
}

/** URL slug for a place's atlas deep link (?place=), the OpenBible slug
 *  half of the link field: "aea17b7/abana" → "abana". Unique across the
 *  dataset (located + unlocated). */
export function placeSlug(link: string): string {
  return link.split("/")[1] ?? link;
}

export type UnlocatedPlace = { name: string; verses: number[] };

export type ChapterPlaces = {
  places: ChapterPlace[];
  unlocated: UnlocatedPlace[];
  /** The journey segment this chapter narrates (Acts only): consecutive
   *  stops named in the chapter, as flat grid coords. */
  journey?: { index: number; name: string; route: number[] };
};

/** Keyed by chapter number as a string; chapters with no places are absent. */
export type BookPlaces = Record<string, ChapterPlaces>;

type PlaceTuple = [string, number, number, number, number, number[], string, string];
type UnlocatedTuple = [string, number[]];
type JourneyTuple = [number, string, number[]];
export type RawBookPlaces = {
  book: string;
  chapters: Record<string, { p: PlaceTuple[]; u?: UnlocatedTuple[]; j?: JourneyTuple }>;
};

export function parseBookPlaces(raw: RawBookPlaces): BookPlaces {
  const out: BookPlaces = {};
  for (const [chapter, ch] of Object.entries(raw.chapters)) {
    out[chapter] = {
      places: ch.p.map(([name, x, y, kind, uncertain, verses, modern, link]) => ({
        name,
        x,
        y,
        kind: kind as PlaceKind,
        uncertain: uncertain === 1,
        verses,
        modern,
        link,
      })),
      unlocated: (ch.u ?? []).map(([name, verses]) => ({ name, verses })),
      journey: ch.j
        ? { index: ch.j[0], name: ch.j[1], route: ch.j[2] }
        : undefined,
    };
  }
  return out;
}

// ── Whole-Bible atlas (public/maps/atlas.json, /try/bible/map) ────────

/** [bookIndex, chapter, verses] — bookIndex into AtlasData.books. */
export type AtlasRef = [number, number, number[]];

export type AtlasPlace = {
  name: string;
  x: number;
  y: number;
  kind: PlaceKind;
  uncertain: boolean;
  modern: string;
  link: string;
  refs: AtlasRef[];
};

export type AtlasUnlocated = { name: string; link: string; refs: AtlasRef[] };

/** One stop on a journey route: place name/coords + the Acts ref ("16:11"). */
export type JourneyStop = { name: string; x: number; y: number; ref: string };

export type AtlasJourney = { name: string; stops: JourneyStop[] };

export type AtlasData = {
  books: string[];
  places: AtlasPlace[];
  unlocated: AtlasUnlocated[];
  journeys: AtlasJourney[];
};

export type RawAtlas = {
  v: number;
  books: string[];
  places: [string, number, number, number, number, string, string, AtlasRef[]][];
  unlocated: [string, string, AtlasRef[]][];
  journeys?: { n: string; s: [string, number, number, string][] }[];
};

export function parseAtlas(raw: RawAtlas): AtlasData {
  return {
    books: raw.books,
    places: raw.places.map(([name, x, y, kind, uncertain, modern, link, refs]) => ({
      name,
      x,
      y,
      kind: kind as PlaceKind,
      uncertain: uncertain === 1,
      modern,
      link,
      refs,
    })),
    unlocated: raw.unlocated.map(([name, link, refs]) => ({ name, link, refs })),
    journeys: (raw.journeys ?? []).map(({ n, s }) => ({
      name: n,
      stops: s.map(([name, x, y, ref]) => ({ name, x, y, ref })),
    })),
  };
}
