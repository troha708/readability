"use client";

/**
 * Client side of the full-screen atlas. Loads public/maps/atlas.json (every
 * located place with whole-Bible verse references), renders the shared
 * PlacesMap full-viewport, and adds: name search with zoom-to-place, an
 * optional single-chapter focus mode (?book=&chapter=), and a floating
 * detail panel whose reference chips navigate into the reader.
 *
 * Layout is responsive: below xl the controls stack in a top header; from xl
 * up they move into a left sidebar and the search floats over the map
 * (Google-Maps style), so the map keeps the full viewport height. The cutoff
 * is xl, not lg, so iPads and phones in desktop-site mode still get the
 * stacked top panel — the sidebar is for real desktops.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { PlacesMap, placeKey, type PlacesMapApi } from "@/components/places-map";
import { MAX_K } from "@/lib/map-view";
import { readShowModernNames, writeShowModernNames } from "@/lib/map-prefs";
import { chapterReference } from "@/lib/bible-book-order";
import {
  openBiblePlaceUrl,
  parseAtlas,
  placeSlug,
  type AtlasData,
  type AtlasPlace,
  type AtlasRef,
  type AtlasUnlocated,
  type PlaceKind,
} from "@/lib/content/places";
import { fetchDictionaryIndex, type DictIndexEntry } from "@/lib/content/client";
import {
  placeNameCandidates,
  GENERIC_PLACE_WORDS,
} from "@/lib/content/dictionary";

/** Index of the first NT book in the canon-ordered atlas book list. */
const NT_START = 39; // Matthew

type Testament = "all" | "ot" | "nt";

let atlasPromise: Promise<AtlasData | null> | null = null;

function loadAtlas(): Promise<AtlasData | null> {
  if (!atlasPromise) {
    atlasPromise = fetch("/maps/atlas.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => (raw ? parseAtlas(raw) : null))
      .catch(() => null)
      .then((atlas) => {
        if (!atlas) atlasPromise = null; // don't cache a failed load
        return atlas;
      });
  }
  return atlasPromise;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, ""); // "King’s Highway" must match a typed "kings"
}

const KIND_LABELS = ["", "water", "region", "natural feature"];
const KIND_FILTERS: { kind: PlaceKind; label: string }[] = [
  { kind: 0, label: "Settlements" },
  { kind: 1, label: "Water" },
  { kind: 2, label: "Regions" },
  { kind: 3, label: "Natural" },
];
// "All" is 0, not 1: gentilic-only places (Gerasa — named solely through
// "the Gerasenes") carry a mentions count of 0 and must still render.
const MENTION_FILTERS = [
  { label: "All", min: 0 },
  { label: "3+", min: 3 },
  { label: "10+", min: 10 },
  { label: "50+", min: 50 },
];
const INITIAL_REF_CHIPS = 24;
const SEARCH_LIMIT = 10;

/** One map object per name+site. Usually a single dataset record; where
 *  records share both a name and an identified site (the two Ais at Et
 *  Tell, the Tel Halif Ains — 50 sites, 106 records), the group renders as
 *  ONE pin and ONE card whose reference lists stay separated per record,
 *  each with its own Sources link. Grouping is display-only: the records
 *  underneath remain exactly as the dataset keeps them. `members` is sorted
 *  most-mentioned first; the leader's own fields come from members[0]. */
type GroupedPlace = AtlasPlace & { members: AtlasPlace[] };

type WeightedPlace = GroupedPlace & { weight: number; mentions: number };

/** Mentions across a whole group (regular + soft, gentilic excluded —
 *  the same semantics as mentionsOf). */
function groupMentionsOf(g: GroupedPlace): number {
  return g.members.reduce((n, m) => n + mentionsOf(m), 0);
}

/** A synthetic place whose ref lists span the whole group — for book spans
 *  and chapter counts over a grouped card. */
function mergedRefs(g: GroupedPlace): AtlasPlace {
  return {
    ...g,
    refs: g.members.flatMap((m) => m.refs),
    softRefs: g.members.flatMap((m) => m.softRefs),
    gentilicRefs: g.members.flatMap((m) => m.gentilicRefs),
  };
}

/** Total verse mentions across the whole Bible: every verse where at least
 *  one translation prints the name — regular refs plus the "some
 *  translations read..." tier. Gentilic refs are deliberately excluded
 *  ("Jebusites" names the people, not the place), so the number stays
 *  defensible against the text. Drives the Mentions filter, prominence
 *  weighting, search-row counts, and the panel figure — all from this one
 *  function so they can never disagree. */
function mentionsOf(p: AtlasPlace | AtlasUnlocated): number {
  const count = (refs: AtlasRef[]) => refs.reduce((n, [, , verses]) => n + verses.length, 0);
  return count(p.refs) + ("softRefs" in p ? count(p.softRefs) : 0);
}

/** Where a place's references live, across all three tiers, as a span.
 *  Distinguishes same-named records (the three Babylons, the Ain pair at
 *  Tel Halif) using only the data — shown in See-also links and
 *  duplicate-name search rows. Single-book records get chapter precision
 *  ("Joshua 21", "Revelation 14–18"): the two Tel Halif Ains are BOTH in
 *  Joshua, so a book-level span couldn't tell them apart. */
function bookSpanOf(p: AtlasPlace, books: string[]): string {
  const allRefs = [...p.refs, ...p.softRefs, ...p.gentilicRefs];
  const idx = [...new Set(allRefs.map(([b]) => b))].sort((a, b) => a - b);
  if (idx.length === 0) return "";
  if (idx.length > 1) return `${books[idx[0]]}–${books[idx[idx.length - 1]]}`;
  const chapters = [...new Set(allRefs.map(([, ch]) => ch))].sort((a, b) => a - b);
  const book = books[idx[0]];
  return chapters.length === 1
    ? `${book} ${chapters[0]}`
    : `${book} ${chapters[0]}–${chapters[chapters.length - 1]}`;
}

/** Distinct chapters behind mentionsOf — union of regular and soft refs
 *  (a chapter can hold both, e.g. Jebus in Joshua 18). */
function chapterCountOf(p: AtlasPlace | AtlasUnlocated): number {
  if (!("softRefs" in p) || p.softRefs.length === 0) return p.refs.length;
  const keys = new Set(p.refs.map(([b, ch]) => `${b}:${ch}`));
  for (const [b, ch] of p.softRefs) keys.add(`${b}:${ch}`);
  return keys.size;
}
type Panel =
  | { type: "places"; members: AtlasPlace[] }
  | { type: "unlocated"; place: AtlasUnlocated };

export function Atlas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [atlas, setAtlas] = useState<AtlasData | null>(null);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  // The place the user explicitly picked (search, deep link, see-also):
  // exempt from the kind/mentions filters so quieting the map can't evict
  // it. Anchored to its own key — not derived from the panel, whose members
  // are whole clusters and reshuffle as filters change.
  const [exemptKey, setExemptKey] = useState<string | null>(null);
  useEffect(() => {
    // Closing the card (✕, background tap) ends the exemption too.
    if (!panel) setExemptKey(null);
  }, [panel]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showAllRefs, setShowAllRefs] = useState(false);
  const [kinds, setKinds] = useState<Set<PlaceKind>>(new Set([0, 1, 2, 3]));
  // Modern identifications under the ancient names. Read after mount (the
  // page is prerendered, so the stored value can't seed the first render)
  // and shared with the reader's chapter-map sheet.
  const [showModern, setShowModern] = useState(false);
  useEffect(() => setShowModern(readShowModernNames()), []);
  function toggleModern() {
    const next = !showModern;
    setShowModern(next);
    writeShowModernNames(next);
  }
  // ?min= carries the Mentions filter (3/10/50) in shared and embedded URLs.
  const [minMentions, setMinMentions] = useState(() => {
    const m = Number(searchParams.get("min"));
    return m === 3 || m === 10 || m === 50 ? m : 0;
  });
  // One scope control: the whole Bible, a testament, a single book (a number
  // indexes atlas.books), or a journey overlay ("j0".."j3"). A ?journey=N
  // param (the reader's "view full route" link) preselects the journey.
  const journeyParam = searchParams.get("journey");
  const [scope, setScope] = useState<Testament | number | string>(() =>
    journeyParam && /^\d+$/.test(journeyParam) ? `j${journeyParam}` : "all",
  );
  // ?embed=1: map only, every pixel a link to the full page (iframes).
  const embed = searchParams.get("embed") === "1";
  // ?x=&y=&k= — a shared view: world-space center + zoom, written by the
  // mirror effect below once the user frames the map by hand.
  const urlView = useMemo(() => {
    const x = Number(searchParams.get("x"));
    const y = Number(searchParams.get("y"));
    const k = Number(searchParams.get("k"));
    return Number.isFinite(x) && Number.isFinite(y) && k > 0 && k <= MAX_K
      ? { x, y, k }
      : null;
  }, [searchParams]);
  const journeyIdx =
    typeof scope === "string" && /^j\d+$/.test(scope) ? Number(scope.slice(1)) : null;
  const mapApi = useRef<PlacesMapApi | null>(null);
  // A search names ONE place; at regional zoom it may share a cluster with
  // neighbors (Jerusalem sits with Zion, Akeldama...). The selection callback
  // that follows a search must not replace the searched place's panel with
  // the whole cluster's.
  const pendingSearch = useRef<string | null>(null);
  // Searching while a chapter focus is active: the zoom must wait until the
  // router has switched the place set to the whole Bible, or focusKey looks
  // the place up in the wrong set and the refit clears the selection.
  const pendingZoom = useRef<string | null>(null);
  // The ?place= slug this session last applied or wrote to the URL. Keeps the
  // deep-link effect from re-selecting a place the user just picked (or
  // closed) when the mirror effect rewrites the URL.
  const appliedPlace = useRef<string | null>(null);
  // A shared view (?x=&y=&k=) whose landing must wait for a scope
  // relaxation's refit, plus (optionally) the selection to restore after
  // that refit clears it. Same race as pendingZoom.
  const pendingView = useRef<{ x: number; y: number; k: number; key?: string } | null>(null);
  // The "x|y|k" signature last applied, so back/forward between view URLs
  // replays but the mirror effect's own rewrites don't.
  const appliedView = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAtlas().then((a) => {
      if (cancelled) return;
      if (a) setAtlas(a);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dictionary index (titles only) → lets a place panel link to its article.
  // The embed renders no panel, so it skips the fetch.
  const [dictIndex, setDictIndex] = useState<DictIndexEntry[] | null>(null);
  useEffect(() => {
    if (embed) return;
    let cancelled = false;
    fetchDictionaryIndex().then((rows) => {
      if (!cancelled) setDictIndex(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [embed]);

  // Map a place name to its candidate dictionary entries. `strong` marks a
  // key derived from the article's own title (or its tag-stripped form) as
  // opposed to a looser derived form ("Aram of Damascus" also answers to
  // "Aram", but the plain "Aram" article owns that name).
  const dictLookup = useMemo(() => {
    const m = new Map<string, { id: string; title: string; strong: boolean }[]>();
    if (!dictIndex) return m;
    const add = (key: string, id: string, title: string, strong: boolean) => {
      if (!key) return;
      const list = m.get(key);
      const cur = list?.find((x) => x.id === id);
      if (cur) cur.strong ||= strong;
      else if (list) list.push({ id, title, strong });
      else m.set(key, [{ id, title, strong }]);
    };
    for (const e of dictIndex) {
      // This page's normalize keeps whitespace (search wants it), so collapse
      // it here or the tag-stripped form ("Aram  ") never matches its key.
      const strongKeys = new Set(
        [e.title, e.title.replace(/\s*\([^)]*\)/g, " ")].map((t) =>
          normalize(t.replace(/\s+/g, " ").trim()),
        ),
      );
      for (const c of placeNameCandidates(e.title)) {
        const k = normalize(c);
        const strong = strongKeys.has(k);
        add(k, e.id, e.title, strong);
        const collapsed = k.replace(/[-\s]/g, "");
        if (collapsed !== k) add(collapsed, e.id, e.title, strong);
      }
    }
    return m;
  }, [dictIndex]);

  // The dictionary article for a place. A unique or exact-title match wins
  // outright. Same-named articles are then told apart by their title
  // qualifiers: "Antioch of Syria" vs "of Pisidia" rank by distance to the
  // atlas place the qualifier names; an UNqualified title ("Rome, City of" —
  // nothing left after generic words) is the plain claimant and wins when no
  // rankable rival exists. A qualified title whose qualifier can't be found
  // ("Clement of Rome") never takes the link, and if a rankable rival would
  // otherwise lose to it blind, the link is dropped instead of guessed.
  const dictIdFor = (p: { name: string; x?: number; y?: number }): string | null => {
    const k = normalize(p.name);
    const list = dictLookup.get(k) ?? dictLookup.get(k.replace(/[-\s]/g, "")) ?? [];
    if (list.length === 0) return null;
    if (list.length === 1) return list[0].id;
    const strongs = list.filter((c) => c.strong);
    if (strongs.length === 1) return strongs[0].id;
    if (strongs.length > 1) return null;
    const nameToks = new Set(k.split(/[\s-]+/));
    const unqualified: string[] = [];
    const ranked: { id: string; d: number }[] = [];
    let unrankable = 0;
    for (const cand of list) {
      const toks = normalize(cand.title.replace(/\([^)]*\)/g, " "))
        .split(/[\s,-]+/)
        .filter(
          (t) =>
            t &&
            t !== "of" &&
            t !== "the" &&
            t !== "and" &&
            !nameToks.has(t) &&
            !GENERIC_PLACE_WORDS.has(t),
        );
      if (toks.length === 0) {
        unqualified.push(cand.id);
        continue;
      }
      let d = Infinity;
      if (p.x != null && p.y != null)
        for (const t of toks) {
          const q = posByName.get(t);
          if (q) d = Math.min(d, (q.x - p.x) ** 2 + (q.y - p.y) ** 2);
        }
      if (Number.isFinite(d)) ranked.push({ id: cand.id, d });
      else unrankable++;
    }
    if (ranked.length > 0)
      return unrankable > 0
        ? null // a rival we can't place — don't guess
        : ranked.sort((a, b) => a.d - b.d)[0].id;
    return unqualified.length === 1 ? unqualified[0] : null;
  };

  // One display object per name+site (see GroupedPlace). Most groups have a
  // single member; the 50 multi-member groups are same-named records the
  // dataset identifies with the same site.
  const groupedPlaces = useMemo(() => {
    const bySite = new Map<string, AtlasPlace[]>();
    for (const p of atlas?.places ?? []) {
      const k = `${p.name}|${p.x}|${p.y}`;
      let g = bySite.get(k);
      if (!g) bySite.set(k, (g = []));
      g.push(p);
    }
    return [...bySite.values()].map((members): GroupedPlace => {
      const sorted = [...members].sort((a, b) => mentionsOf(b) - mentionsOf(a));
      return { ...sorted[0], members: sorted };
    });
  }, [atlas]);

  // Any member's slug resolves its group — sitemap URLs and shared links to
  // a non-leader record (?place=ai-3) must keep working.
  const leaderBySlug = useMemo(() => {
    const m = new Map<string, GroupedPlace>();
    for (const g of groupedPlaces)
      for (const mem of g.members) m.set(placeSlug(mem.link), g);
    return m;
  }, [groupedPlaces]);

  // Focus mode: ?book=Genesis&chapter=12 shows only that chapter's places.
  const focusBook = searchParams.get("book");
  const focusChapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const focus = useMemo(() => {
    if (!atlas || !focusBook || !Number.isFinite(focusChapter)) return null;
    const bIdx = atlas.books.indexOf(focusBook);
    if (bIdx === -1) return null;
    const places: WeightedPlace[] = [];
    for (const g of groupedPlaces) {
      // Chapter focus is about completeness (like the reader's sheet), so a
      // place whose presence in the chapter is soft or gentilic still shows.
      const inChapter = (rs: AtlasRef[]) =>
        rs.find(([b, ch]) => b === bIdx && ch === focusChapter);
      let weight = 0;
      for (const m of g.members) {
        const ref = inChapter(m.refs) ?? inChapter(m.softRefs) ?? inChapter(m.gentilicRefs);
        if (ref) weight += ref[2].length;
      }
      if (weight > 0) places.push({ ...g, weight, mentions: groupMentionsOf(g) });
    }
    return places.length > 0 ? { book: focusBook, chapter: focusChapter, places } : null;
  }, [atlas, groupedPlaces, focusBook, focusChapter]);

  const allPlaces = useMemo(
    () =>
      groupedPlaces.map((g): WeightedPlace => {
        const mentions = groupMentionsOf(g);
        return { ...g, weight: mentions, mentions };
      }),
    [groupedPlaces],
  );

  // Most-mentioned position per atlas name, for resolving a title qualifier
  // ("Antioch of Syria" → the atlas place "Syria") to a point.
  const posByName = useMemo(() => {
    const best = new Map<string, WeightedPlace>();
    for (const p of allPlaces) {
      const k = normalize(p.name);
      const cur = best.get(k);
      if (!cur || p.mentions > cur.mentions) best.set(k, p);
    }
    return best;
  }, [allPlaces]);

  function refInScope(r: AtlasRef): boolean {
    if (typeof scope === "number") return r[0] === scope;
    if (scope === "ot") return r[0] < NT_START;
    if (scope === "nt") return r[0] >= NT_START;
    return true;
  }

  // Book/testament scope re-weights places by their mentions WITHIN the
  // scope, so labels, prominence, and the mentions thresholds all answer
  // "in Acts" rather than "in the whole Bible" when Acts is selected.
  const scopedPlaces = useMemo(() => {
    if (scope === "all") return allPlaces;
    const out: WeightedPlace[] = [];
    for (const p of allPlaces) {
      let mentions = 0;
      for (const m of p.members) {
        for (const r of m.refs) if (refInScope(r)) mentions += r[2].length;
        for (const r of m.softRefs) if (refInScope(r)) mentions += r[2].length;
      }
      if (mentions > 0) out.push({ ...p, weight: mentions, mentions });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlaces, scope]);

  // Journey overlay: the route's unique stops become the place set (with
  // stop numbers), each backed by its full atlas record so the detail panel
  // works unchanged. Kind/mentions filters don't apply — the stops are the
  // content.
  const journeyView = useMemo(() => {
    if (!atlas || journeyIdx === null) return null;
    const j = atlas.journeys[journeyIdx];
    if (!j) return null;
    const byKey = new Map(groupedPlaces.map((p) => [`${p.name}|${p.x}|${p.y}`, p]));
    const seen = new Set<string>();
    const stops: (WeightedPlace & { seq: number })[] = [];
    j.stops.forEach((s, i) => {
      const key = `${s.name}|${s.x}|${s.y}`;
      if (seen.has(key)) return; // return legs revisit cities — number once
      seen.add(key);
      const ap = byKey.get(key);
      const base: GroupedPlace = ap ?? {
        name: s.name, x: s.x, y: s.y, kind: 0, uncertain: false, modern: "", link: "", refs: [],
        type: "", softRefs: [], gentilicRefs: [], aka: "", members: [],
      };
      stops.push({
        ...base,
        weight: 1000 - i,
        mentions: ap ? groupMentionsOf(ap) : 0,
        seq: i + 1,
      });
    });
    return { journey: j, stops, route: j.stops.flatMap((s) => [s.x, s.y]) };
  }, [atlas, groupedPlaces, journeyIdx]);

  const basePlaces = focus ? focus.places : scopedPlaces;
  const places = useMemo(() => {
    if (journeyView) return journeyView.stops;
    const out = basePlaces.filter((p) => kinds.has(p.kind) && p.mentions >= minMentions);
    // The picked place is exempt from the kind and mentions filters:
    // quieting the map (50+) must not evict the place the user searched
    // for or is reading about — and, in the other direction, searching no
    // longer needs to reset the user's chosen filter.
    if (exemptKey && !out.some((p) => placeKey(p) === exemptKey)) {
      const sel = basePlaces.find((p) => placeKey(p) === exemptKey);
      if (sel) out.push(sel);
    }
    return out;
  }, [journeyView, basePlaces, kinds, minMentions, exemptKey]);

  function toggleKind(kind: PlaceKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  // Name search across located + unlocated places.
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!atlas || q.length < 2) return [];
    const located = groupedPlaces
      .filter((p) => normalize(p.name).includes(q))
      .map((p) => ({ place: p, unlocated: false as const, mentions: groupMentionsOf(p) }));
    const unlocated = atlas.unlocated
      .filter((p) => normalize(p.name).includes(q))
      .map((p) => ({ place: p, unlocated: true as const, mentions: mentionsOf(p) }));
    return [...located, ...unlocated]
      .sort((a, b) => {
        // prefix matches first, then by how often the Bible mentions the
        // place (the same number the Mentions filter and panel use)
        const ap = normalize(a.place.name).startsWith(q) ? 0 : 1;
        const bp = normalize(b.place.name).startsWith(q) ? 0 : 1;
        return ap - bp || b.mentions - a.mentions;
      })
      .slice(0, SEARCH_LIMIT);
  }, [atlas, groupedPlaces, query]);

  // Places sharing a base name (the two Zaphons, the four Apheks) cross-link
  // in the detail panel, so one entry can never silently hide another — an
  // academic reader clicked the town Zaphon and reasonably concluded the
  // mountain's references were missing (2026-08-01). Built over groups, so
  // same-site records never cross-link to themselves.
  const sameName = useMemo(() => {
    const groups = new Map<string, GroupedPlace[]>();
    for (const p of groupedPlaces) {
      const base = normalize(p.name.replace(/^Mount /, ""));
      let g = groups.get(base);
      if (!g) groups.set(base, (g = []));
      g.push(p);
    }
    return groups;
  }, [groupedPlaces]);

  /** Select a search result / deep-linked place. `zoomTo: false` selects
   *  without moving the camera (a shared ?x=&y=&k= view is about to land).
   *  Returns whether the scope was relaxed — i.e. a refit is coming. */
  function pickResult(
    r: { place: AtlasPlace | AtlasUnlocated; unlocated: boolean },
    zoomTo = true,
  ): boolean {
    setQuery("");
    setSearchOpen(false);
    setShowAllRefs(false);
    if (r.unlocated) {
      if (zoomTo) mapApi.current?.focusKey(null);
      setExemptKey(null);
      setPanel({ type: "unlocated", place: r.place as AtlasUnlocated });
      return false;
    }
    const p = r.place as GroupedPlace;
    const members = p.members?.length ? p.members : [p];
    const pMentions = members.reduce((n, m) => n + mentionsOf(m), 0);
    // The user's kind/mentions filters stay as set — the selection itself
    // is exempt (see the places memo), so the target appears without
    // un-quieting the rest of the map. filterRelaxed only notes that the
    // marker isn't on screen yet, so the zoom must wait a commit.
    const filterRelaxed = !kinds.has(p.kind) || pMentions < minMentions;
    const scopeRelaxed = journeyView
      ? !journeyView.stops.some((s) => placeKey(s) === placeKey(p))
      : !members.some((m) => [...m.refs, ...m.softRefs].some((ref) => refInScope(ref)));
    // The deferred zoom below fires from a state-change effect. Re-picking
    // the place that already holds the exemption changes nothing — the
    // effect would never run and the zoom went dead (searching your way
    // back to Antioch, 2026-08-03). Its marker is already on the map in
    // that case, so the direct zoom is both safe and required.
    const exemptChanged = exemptKey !== placeKey(p);
    if (scopeRelaxed) setScope("all");
    setExemptKey(placeKey(p));
    setPanel({ type: "places", members: [p] });
    if (!zoomTo) {
      // The shared view keeps focus mode too: with book&chapter in the URL
      // the framed chapter set stays, the place just highlights within it.
      pendingSearch.current = placeKey(p);
      mapApi.current?.selectKey(placeKey(p));
    } else if (focus) {
      // Searching implies the whole-Bible view: a focused chapter may not
      // contain the searched place at all. Carry the place slug so the
      // exit from focus mode lands on the place's own URL.
      pendingZoom.current = placeKey(p);
      appliedPlace.current = placeSlug(p.link);
      router.replace(`/try/bible/map?place=${encodeURIComponent(placeSlug(p.link))}`);
    } else if (scopeRelaxed || (filterRelaxed && exemptChanged)) {
      // Same race as focus-exit: until the relaxed scope/filters land, the
      // map's place set doesn't contain this place, so an immediate zoom
      // would find nothing (and a scope reset also refits) — zoom after.
      // Arm pendingSearch NOW, not in the deferred effect: swapping the
      // exemption evicts the previously selected place from the set, and
      // the map reports that dying selection as null BEFORE the deferred
      // zoom runs (child effects fire first). The selection handler treats
      // a null during a pending pick as machinery, not a user deselection.
      pendingSearch.current = placeKey(p);
      pendingZoom.current = placeKey(p);
    } else {
      pendingSearch.current = placeKey(p);
      mapApi.current?.focusKey(placeKey(p));
    }
    return scopeRelaxed;
  }

  // Fires the deferred search zoom once a focus-mode exit, scope reset, or
  // filter relaxation has landed (this effect runs after PlacesMap's own
  // refit effect, so the selection and zoom win). A deferred shared view
  // (?x=&y=&k= behind a scope relaxation) lands here the same way, restoring
  // the selection the refit cleared.
  useEffect(() => {
    if (!focus && pendingZoom.current) {
      pendingSearch.current = pendingZoom.current;
      mapApi.current?.focusKey(pendingZoom.current);
      pendingZoom.current = null;
    }
    if (pendingView.current) {
      const { x, y, k, key } = pendingView.current;
      pendingView.current = null;
      if (key) {
        pendingSearch.current = key;
        mapApi.current?.selectKey(key);
      }
      mapApi.current?.setView(x, y, k);
    }
    // `exemptKey` is a dep so a filter-exempt selection (which enters the
    // place set without any filter change) still fires its deferred zoom.
  }, [focus, scope, kinds, minMentions, exemptKey]);

  // ?place= deep link (shared URLs, the sitemap's place pages): select that
  // place as if it had been picked from search, once the map has done its
  // first fit (an earlier focusKey would be wiped by that fit). Also honors
  // back/forward moves between place URLs; the applied-slug ref keeps this
  // from replaying a selection this session made itself. When the URL also
  // carries a shared view (?x=&y=&k=), that framing wins over the place's
  // default landing zoom.
  const placeParam = searchParams.get("place");
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (!atlas || !mapReady) return;
    const viewSig = urlView ? `${urlView.x}|${urlView.y}|${urlView.k}` : null;
    const newPlace = placeParam !== null && placeParam !== appliedPlace.current;
    const newView = viewSig !== null && viewSig !== appliedView.current;
    if (!newPlace && !newView) return;
    if (placeParam) appliedPlace.current = placeParam;
    appliedView.current = viewSig;
    const located = placeParam ? leaderBySlug.get(placeParam) : undefined;
    const unlocated =
      located || !placeParam
        ? undefined
        : atlas.unlocated.find((p) => placeSlug(p.link) === placeParam);
    if (!urlView) {
      if (located) pickResult({ place: located, unlocated: false });
      else if (unlocated) pickResult({ place: unlocated, unlocated: true });
      return;
    }
    let relaxed = false;
    if (located) relaxed = pickResult({ place: located, unlocated: false }, false);
    else if (unlocated) pickResult({ place: unlocated, unlocated: true }, false);
    if (relaxed) {
      // The scope reset refits (and clears the selection) first; land after.
      pendingView.current = { ...urlView, key: located ? placeKey(located) : undefined };
    } else {
      mapApi.current?.setView(urlView.x, urlView.y, urlView.k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, mapReady, placeParam, urlView]);

  // Mirror the open place back into the URL so any viewed place is shareable
  // and matches its indexed URL. replaceState keeps this out of history and
  // off the router (no server round-trip). Cluster panels (several places at
  // one zoomed-out point) name no single place, so they clear the param.
  // Only real panel transitions mirror: with no transition, a null panel just
  // means the ?place= deep link hasn't been applied yet — clearing the param
  // then would erase the deep link before it runs.
  const prevPanel = useRef<Panel | null>(null);
  useEffect(() => {
    const prev = prevPanel.current;
    prevPanel.current = panel;
    if (!atlas || (!panel && !prev)) return;
    const single =
      panel?.type === "places" && panel.members.length === 1
        ? panel.members[0]
        : panel?.type === "unlocated"
          ? panel.place
          : null;
    const slug = single?.link ? placeSlug(single.link) : null;
    const url = new URL(window.location.href);
    if (slug === url.searchParams.get("place")) return;
    if (slug) url.searchParams.set("place", slug);
    else url.searchParams.delete("place");
    appliedPlace.current = slug;
    window.history.replaceState(null, "", url);
  }, [atlas, panel]);

  // Mirror the Mentions filter into the URL (?min=) so shared links and
  // embeds reproduce it; All (the default) keeps the URL clean. A search
  // that relaxes the filter (pickResult) clears the param the same way.
  useEffect(() => {
    const url = new URL(window.location.href);
    const cur = url.searchParams.get("min");
    const want = minMentions > 1 ? String(minMentions) : null;
    if (cur === want) return;
    if (want) url.searchParams.set("min", want);
    else url.searchParams.delete("min");
    window.history.replaceState(null, "", url);
  }, [minMentions]);

  // Mirror a hand-framed view into the URL (?x=&y=&k=) so the address bar
  // is always a share link for exactly what's on screen. Auto framings —
  // scope fits, a place's landing zoom — clear the params instead: those
  // URLs reproduce their view from ?place=/?journey=/?book= alone.
  // Debounced a beat so a pan writes once, not per frame; replaceState
  // keeps it out of history and off the router.
  const viewWriteTimer = useRef<number | null>(null);
  function writeViewParams(c: { x: number; y: number; k: number } | null) {
    const url = new URL(window.location.href);
    if (!c) {
      if (!url.searchParams.has("x") && !url.searchParams.has("k")) return;
      url.searchParams.delete("x");
      url.searchParams.delete("y");
      url.searchParams.delete("k");
    } else {
      const sig = `${c.x}|${c.y}|${Number(c.k.toPrecision(3))}`;
      appliedView.current = sig; // don't replay our own URL write
      url.searchParams.set("x", String(c.x));
      url.searchParams.set("y", String(c.y));
      url.searchParams.set("k", String(Number(c.k.toPrecision(3))));
    }
    window.history.replaceState(null, "", url);
  }
  function handleViewChange(
    c: { x: number; y: number; k: number },
    kind: "user" | "auto",
  ) {
    if (embed) return; // an embed's URL belongs to its embedder
    if (viewWriteTimer.current !== null) window.clearTimeout(viewWriteTimer.current);
    if (kind === "auto") {
      viewWriteTimer.current = null;
      writeViewParams(null);
    } else {
      viewWriteTimer.current = window.setTimeout(() => writeViewParams(c), 400);
    }
  }

  // ── Embed mode (?embed=1) ────────────────────────────────────────────
  // Map only — no header, search, filters, or panel. The whole surface is
  // one link to the full page (new tab: don't navigate the host site away).
  // Deep-link selection and the shared view still apply, so the iframe
  // shows exactly what its URL names; the overlay also blocks pan/zoom.
  if (embed) {
    const full = new URLSearchParams(searchParams.toString());
    full.delete("embed");
    const q = full.toString();
    const fullHref = `/try/bible/map${q ? `?${q}` : ""}`;
    return (
      <div className="relative h-screen overflow-hidden bg-[#101314] supports-[height:100dvh]:h-dvh">
        {failed ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            The atlas needs a connection to load.
          </div>
        ) : !atlas ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-amber-500" />
          </div>
        ) : (
          <PlacesMap
            places={places}
            declutter={!focus && !journeyView && places.length > 60}
            route={journeyView?.route}
            fitKey={focus ? `${focus.book}|${focus.chapter}` : `scope|${scope}`}
            onReady={() => setMapReady(true)}
            apiRef={mapApi}
            controls={false}
            className="h-full w-full"
          />
        )}
        <a
          href={fullHref}
          target="_blank"
          rel="noopener"
          aria-label="Open the Bible Atlas on readability.bible"
          className="absolute inset-0 z-30"
        >
          <span className="absolute bottom-2 right-2 rounded-md bg-neutral-900/80 px-2 py-1 text-[11px] font-medium tracking-[0.25px] text-neutral-200">
            Bible Atlas · readability.bible ↗
          </span>
          <span className="absolute left-2 top-2 rounded bg-neutral-900/60 px-1.5 py-0.5 text-[9px] text-neutral-400">
            Places: OpenBible.info CC BY
          </span>
        </a>
      </div>
    );
  }

  const backHref = focus
    ? `/try/bible/read?book=${encodeURIComponent(focus.book)}&chapter=${focus.chapter}`
    : "/try/bible/start";

  function refChip(
    place: AtlasPlace | AtlasUnlocated,
    [bIdx, ch, verses]: [number, number, number[]],
    muted = false,
  ) {
    const book = atlas!.books[bIdx];
    return (
      <Link
        key={`${bIdx}:${ch}`}
        href={`/try/bible/read?book=${encodeURIComponent(book)}&chapter=${ch}&verse=${verses[0]}`}
        title={`${chapterReference(book, ch)}:${verses.join(", ")}`}
        className={
          muted
            ? "rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs font-medium tracking-[0.25px] text-neutral-500 transition-colors hover:text-amber-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:text-amber-400"
            : "rounded-full bg-paper px-2 py-0.5 text-xs font-medium tracking-[0.25px] text-amber-700 shadow-sm transition-colors hover:bg-amber-50 dark:bg-neutral-700 dark:text-amber-400 dark:hover:bg-neutral-600"
        }
      >
        {chapterReference(book, ch)}
        {verses.length > 1 && (
          <span className="ml-0.5 text-[10px] text-neutral-400">×{verses.length}</span>
        )}
      </Link>
    );
  }

  function placeDetails(p: AtlasPlace | AtlasUnlocated, located: boolean) {
    const lp = located ? (p as GroupedPlace) : null;
    const members = lp ? (lp.members?.length ? lp.members : [lp]) : [];
    const grouped = members.length > 1;
    // Header numbers span the whole group; a single-member group renders
    // exactly as a plain place.
    const view = lp ? (grouped ? mergedRefs(lp) : lp) : null;
    // An alias record's dictionary article is its referent's: the Babylon
    // at Rome links the Rome article, not Mesopotamian Babylon (whose
    // article never mentions the figurative usage).
    const dictId = dictIdFor(lp ? { name: lp.aka || lp.name } : { name: p.name });

    const sourcesLink = (link: string) => (
      <a
        href={openBiblePlaceUrl(link)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        Sources ↗
      </a>
    );

    // One record's reference lists: regular chips, then the soft and
    // gentilic tiers. Used once for plain places, per member for groups.
    const refLists = (m: AtlasPlace) => {
      const shown = showAllRefs ? m.refs : m.refs.slice(0, INITIAL_REF_CHIPS);
      return (
        <>
          {m.refs.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {shown.map((r) => refChip(m, r))}
              {m.refs.length > INITIAL_REF_CHIPS && !showAllRefs && (
                <button
                  onClick={() => setShowAllRefs(true)}
                  className="rounded-full px-2 py-0.5 text-xs font-medium tracking-[0.25px] text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  all {m.refs.length}
                </button>
              )}
            </div>
          )}
          {m.softRefs.length > 0 && (
            <div className="mt-1.5">
              <p className="text-xs italic text-neutral-500 dark:text-neutral-400">
                Some translations read {m.name} here:
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {m.softRefs.map((r) => refChip(m, r, true))}
              </div>
            </div>
          )}
          {m.gentilicRefs.length > 0 && (
            <div className="mt-1.5">
              <p className="text-xs italic text-neutral-500 dark:text-neutral-400">
                Named through its people here:
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {m.gentilicRefs.map((r) => refChip(m, r, true))}
              </div>
            </div>
          )}
        </>
      );
    };

    return (
      <div key={p.link} className="py-1.5 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-neutral-800 dark:text-neutral-100">{p.name}</span>
          {lp && (lp.type || lp.kind > 0) && (
            <span className="text-xs text-neutral-400">{lp.type || KIND_LABELS[lp.kind]}</span>
          )}
          <span className="text-xs text-neutral-400">
            {view && view.refs.length === 0 && view.softRefs.length + view.gentilicRefs.length > 0
              ? view.softRefs.length === 0
                ? "named only through its people"
                : view.gentilicRefs.length === 0
                  ? "named only in some translations"
                  : "named only indirectly"
              : `${mentionsOf(view ?? p)} mention${mentionsOf(view ?? p) === 1 ? "" : "s"} in ${chapterCountOf(view ?? p)} chapter${chapterCountOf(view ?? p) === 1 ? "" : "s"}`}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {!located
            ? "Location unknown. "
            : lp!.aka
              ? lp!.uncertain
                ? `Identification uncertain — possibly another name for ${lp!.aka}. `
                : `Another name for ${lp!.aka}. `
              : lp!.uncertain
                ? `Location uncertain${lp!.modern ? ` — possibly near modern ${lp!.modern}` : " — best-supported site shown"}. `
                : lp!.modern
                  ? `Near modern ${lp!.modern}. `
                  : ""}
          {grouped && (
            // The dataset keeps these as distinct textual records that
            // resolve to the same site; the card groups them, each list
            // keeping its own source page below.
            <span>{members.length} entries in the source data. </span>
          )}
          {!grouped && p.link && sourcesLink(p.link)}
          {dictId && (
            <>
              {(!grouped && p.link) || grouped ? " · " : ""}
              <Link
                href={`/try/bible/dictionary?entry=${encodeURIComponent(dictId)}`}
                className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Dictionary
              </Link>
            </>
          )}
        </p>
        {!lp && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(showAllRefs ? p.refs : p.refs.slice(0, INITIAL_REF_CHIPS)).map((r) => refChip(p, r))}
            {p.refs.length > INITIAL_REF_CHIPS && !showAllRefs && (
              <button
                onClick={() => setShowAllRefs(true)}
                className="rounded-full px-2 py-0.5 text-xs font-medium tracking-[0.25px] text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                all {p.refs.length}
              </button>
            )}
          </div>
        )}
        {lp && !grouped && refLists(lp)}
        {lp &&
          grouped &&
          members.map((m) => (
            <div key={m.link} className="mt-2">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {bookSpanOf(m, atlas!.books)}
                {m.uncertain && (
                  <span className="italic"> · identification uncertain</span>
                )}
                {" · "}
                {sourcesLink(m.link)}
              </p>
              {refLists(m)}
            </div>
          ))}
        {lp &&
          (() => {
            const siblings = (
              sameName.get(normalize(lp.name.replace(/^Mount /, ""))) ?? []
            ).filter((o) => o.link !== lp.link);
            if (siblings.length === 0) return null;
            return (
              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                See also:{" "}
                {siblings.map((o, i) => {
                  // Type alone can't tell the three Babylons apart — the
                  // book span (from the record's own refs) can.
                  const hint = [o.type, bookSpanOf(mergedRefs(o), atlas!.books)]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <span key={o.link}>
                      {i > 0 && " · "}
                      <button
                        onClick={() => pickResult({ place: o, unlocated: false })}
                        className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
                      >
                        {o.name}
                        {hint ? ` (${hint})` : ""}
                      </button>
                    </span>
                  );
                })}
              </p>
            );
          })()}
      </div>
    );
  }

  const backLink = (alwaysLabel: boolean) => (
    <Link
      href={backHref}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium tracking-[0.25px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-400"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span className={alwaysLabel ? undefined : "hidden sm:inline"}>
        {focus ? chapterReference(focus.book, focus.chapter) : "Library"}
      </span>
    </Link>
  );

  // Rendered twice (header below xl, floating over the map on xl+);
  // only one instance is ever displayed, and both share the same state.
  const searchBox = (floating: boolean) => (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSearchOpen(true);
        }}
        onFocus={() => setSearchOpen(true)}
        onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results.length > 0) pickResult(results[0]);
          if (e.key === "Escape") setSearchOpen(false);
        }}
        placeholder="Search places…"
        aria-label="Search places"
        className={
          floating
            ? "w-full rounded-lg border border-neutral-200 bg-paper/95 px-3.5 py-2 text-sm tracking-[0.25px] text-neutral-800 shadow-lg outline-none backdrop-blur placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-800/95 dark:text-neutral-100"
            : "w-full rounded-lg border border-neutral-300 bg-paper px-3 py-1.5 text-sm tracking-[0.25px] text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        }
      />
      {searchOpen && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-paper shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {results.map((r) => (
            <li key={r.place.link}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault(); // fire before the input's blur
                  pickResult(r);
                }}
                className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700"
              >
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  {r.place.name}
                </span>
                <span className="truncate text-xs text-neutral-400">
                  {r.unlocated
                    ? "location unknown"
                    : (() => {
                        const lp = r.place as GroupedPlace;
                        // Same-named places (the Ains, the Babylons) also get
                        // their book span, so the rows tell themselves apart.
                        const dup =
                          (sameName.get(normalize(lp.name.replace(/^Mount /, "")))?.length ?? 0) > 1;
                        return [
                          lp.type || KIND_LABELS[lp.kind],
                          lp.modern,
                          dup ? bookSpanOf(mergedRefs(lp), atlas!.books) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ");
                      })()}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-neutral-400">
                  {r.mentions > 0 ? r.mentions : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const kindChips = (
    <div className="flex flex-wrap items-center gap-1">
      {KIND_FILTERS.map(({ kind, label }) => (
        <button
          key={kind}
          onClick={() => toggleKind(kind)}
          aria-pressed={kinds.has(kind)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium tracking-[0.25px] transition-colors ${
            kinds.has(kind)
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
              : "bg-neutral-100 text-neutral-400 line-through dark:bg-neutral-800 dark:text-neutral-500"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Same chip shape as the kind filters, but this one changes what the
  // labels say rather than which places are on the map.
  const modernChip = (
    <button
      onClick={toggleModern}
      aria-pressed={showModern}
      title="Print each place's modern identification under its ancient name"
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium tracking-[0.25px] transition-colors ${
        showModern
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      Modern names
    </button>
  );

  const mentionControl = (
    <div className="inline-flex rounded-full bg-neutral-100 p-0.5 dark:bg-neutral-800">
      {MENTION_FILTERS.map(({ label, min }) => (
        <button
          key={min}
          onClick={() => setMinMentions(min)}
          aria-pressed={minMentions === min}
          className={`rounded-full px-2 py-0.5 text-xs font-medium tracking-[0.25px] transition-colors ${
            minMentions === min
              ? "bg-paper text-amber-700 shadow-sm dark:bg-neutral-700 dark:text-amber-400"
              : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const scopeSelect = (className: string) =>
    !focus && atlas ? (
      <select
        value={String(scope)}
        onChange={(e) => {
          const v = e.target.value;
          setScope(
            v === "all" || v === "ot" || v === "nt" || v.startsWith("j")
              ? v
              : Number(v),
          );
        }}
        aria-label="Map scope"
        className={className}
      >
        <option value="all">Whole Bible</option>
        <option value="ot">Old Testament</option>
        <option value="nt">New Testament</option>
        {atlas.journeys.length > 0 && (
          <optgroup label="Journeys">
            {atlas.journeys.map((j, i) => (
              <option key={j.name} value={`j${i}`}>
                {j.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Old Testament">
          {atlas.books.slice(0, NT_START).map((b, i) => (
            <option key={b} value={i}>
              {b}
            </option>
          ))}
        </optgroup>
        <optgroup label="New Testament">
          {atlas.books.slice(NT_START).map((b, i) => (
            <option key={b} value={i + NT_START}>
              {b}
            </option>
          ))}
        </optgroup>
      </select>
    ) : null;

  const journeyNote = journeyView && (
    <span className="text-xs text-neutral-500 dark:text-neutral-400">
      {journeyView.stops.length} stops · stops as named in Acts —{" "}
      <span className="font-medium">route approximate</span>
    </span>
  );

  const focusNote = focus && (
    <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <span>
        {places.length} place{places.length === 1 ? "" : "s"} in{" "}
        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
          {chapterReference(focus.book, focus.chapter)}
        </span>
      </span>
      <button
        onClick={() => router.replace("/try/bible/map")}
        className="font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        Show whole Bible
      </button>
    </span>
  );

  const sideHeading =
    "text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500";

  // Collapsed map key: the marker glyphs mirror places-map.tsx, and the two
  // sentences at the bottom state what the terrain shading means and that
  // the Dead Sea is deliberately NOT the modern lake.
  const keyRow = (glyph: React.ReactNode, label: string) => (
    <span className="flex items-center gap-2" key={label}>
      <svg viewBox="-10 -10 20 20" className="h-4 w-4 shrink-0" aria-hidden>
        {glyph}
      </svg>
      <span>{label}</span>
    </span>
  );
  const mapKey = (
    <details className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
      <summary className={`cursor-pointer select-none ${sideHeading}`}>Key</summary>
      <div className="mt-1.5 space-y-1.5">
        {keyRow(
          <circle r="4.4" strokeWidth="1.4" className="fill-amber-600 stroke-paper dark:fill-amber-400 dark:stroke-neutral-900" />,
          "Settlement",
        )}
        {keyRow(
          <circle r="4.4" strokeWidth="1.4" className="fill-[#4e655e] stroke-paper dark:fill-[#7f8978] dark:stroke-neutral-900" />,
          "Water — sea, river, spring",
        )}
        {keyRow(
          <path d="M0 -5.2 L5 3.8 L-5 3.8 Z" strokeWidth="1.2" className="fill-amber-700 stroke-paper dark:fill-amber-500 dark:stroke-neutral-900" />,
          "Natural feature — mountain, pass",
        )}
        {keyRow(
          <circle r="5" fill="none" strokeWidth="1.8" className="stroke-amber-600 dark:stroke-amber-400" />,
          "Region — usually an italic name across the land",
        )}
        {keyRow(
          <circle r="7.5" fill="none" strokeWidth="1" strokeDasharray="2 2.5" className="stroke-amber-700/70 dark:stroke-amber-400/70" />,
          "Location uncertain — open a place for its sources",
        )}
        {keyRow(
          <>
            <circle r="8.5" strokeWidth="1.5" className="fill-amber-600 stroke-paper dark:fill-amber-500 dark:stroke-neutral-900" />
            <text textAnchor="middle" dy="3" className="fill-paper text-[9px] font-bold dark:fill-neutral-950">3</text>
          </>,
          "Several places together — zoom in to separate",
        )}
        {keyRow(
          <>
            <rect x="-8" y="-8" width="16" height="16" rx="4" strokeWidth="1.5" className="fill-amber-600 stroke-paper dark:fill-amber-500 dark:stroke-neutral-900" />
            <text textAnchor="middle" dy="3" className="fill-paper text-[9px] font-bold dark:fill-neutral-950">1</text>
          </>,
          "Journey stop, numbered in order",
        )}
        <div className="pt-1">
          <div className={sideHeading}>Terrain</div>
          {/* The map always renders its dark palette, so the swatches show
              the dark band colors in both sidebar themes. */}
          <div className="mt-1.5 space-y-1">
            {(
              [
                ["#45311b", "above 2,500 m — high peaks"],
                ["#392918", "1,500–2,500 m — mountains"],
                ["#302317", "700–1,500 m — central ridges"],
                ["#291f16", "300–700 m — hill country"],
                ["#231c15", "0–300 m — plains"],
                ["#1e160e", "0 to −200 m — below sea level"],
                ["#1a120b", "below −200 m — the deep rift"],
              ] as const
            ).map(([color, label]) => (
              <span key={color} className="flex items-center gap-2">
                <span
                  className="h-3 w-5 shrink-0 rounded-sm ring-1 ring-inset ring-neutral-400/50 dark:ring-neutral-600"
                  style={{ backgroundColor: color }}
                />
                <span>{label}</span>
              </span>
            ))}
          </div>
        </div>
        {showModern && (
          <p>
            The small second line is the site the place is identified with
            today; a question mark marks an identification the sources are
            divided on. Regions carry none — their point is representative,
            not a site.
          </p>
        )}
        <p>
          The Dead Sea is drawn at its biblical-era extent, one lake including
          the southern basin; the modern lake has shrunk and split.
        </p>
      </div>
    </details>
  );

  return (
    // h-screen fallback: 100dvh is dropped by iOS Safari < 16.4, which would
    // leave the flex column with height:auto and a 0-height map.
    <div className="flex h-screen flex-col bg-paper supports-[height:100dvh]:h-dvh xl:flex-row dark:bg-neutral-925">
      {/* Header (below xl) */}
      <header className="border-b border-neutral-200 bg-paper/95 px-4 py-3 xl:hidden dark:border-neutral-700 dark:bg-neutral-925/95">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Logo compact />
          <div className="h-5 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
          {backLink(false)}
          <span className="hidden text-sm font-semibold tracking-[0.25px] text-amber-700 dark:text-amber-400 sm:inline">
            Atlas
          </span>
          <div className="ml-auto w-full max-w-xs">{searchBox(false)}</div>
        </div>

        {/* Kind filters + focus-mode banner */}
        <div className="mx-auto mt-2 flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {journeyIdx === null && (
            <>
              {kindChips}
              <div className="flex items-center gap-1">
                <span className="text-neutral-400 dark:text-neutral-500">Mentions</span>
                {mentionControl}
              </div>
            </>
          )}
          {scopeSelect(
            "rounded-full border border-neutral-200 bg-paper px-2 py-0.5 text-xs font-medium tracking-[0.25px] text-neutral-600 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
          )}
          {modernChip}
          {journeyNote}
          {focusNote}
          <div className="w-full">{mapKey}</div>
        </div>
      </header>

      {/* Sidebar (xl+) — the map keeps the full viewport height */}
      {/* pb-16: the floating notes FAB sits over the sidebar's bottom-left
          corner — the key's last lines need room to scroll clear of it. */}
      <aside className="hidden w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-neutral-200 bg-paper/95 px-3.5 pb-16 pt-4 xl:flex dark:border-neutral-700 dark:bg-neutral-925/95">
        <div>
          <div className="flex items-center gap-2">
            <Logo compact />
            <div className="h-5 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-sm font-semibold tracking-[0.25px] text-amber-700 dark:text-amber-400">
              Atlas
            </span>
          </div>
          <div className="-ml-1.5 mt-2">{backLink(true)}</div>
        </div>
        {/* Scope first: it decides the place set the sections below refine,
            and picking a journey collapses those sections — sitting above
            them keeps the select from jumping under the cursor. */}
        {!focus && atlas && (
          <div>
            <div className={sideHeading}>Scope</div>
            {scopeSelect(
              "mt-1.5 w-full rounded-lg border border-neutral-200 bg-paper px-2.5 py-1.5 text-sm font-medium tracking-[0.25px] text-neutral-600 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
            )}
          </div>
        )}
        {journeyIdx === null && (
          <>
            <div>
              <div className={sideHeading}>Show</div>
              <div className="mt-1.5">{kindChips}</div>
            </div>
            <div>
              <div className={sideHeading}>Mentions</div>
              <div className="mt-1.5">{mentionControl}</div>
            </div>
          </>
        )}
        <div>
          <div className={sideHeading}>Labels</div>
          <div className="mt-1.5">{modernChip}</div>
        </div>
        {journeyNote}
        {focusNote}
        {mapKey}
      </aside>

      {/* Map */}
      <main className="relative min-h-0 flex-1">
        {failed ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            The atlas needs a connection the first time it loads.
          </div>
        ) : !atlas ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
          </div>
        ) : (
          <>
            <PlacesMap
              places={places}
              // A focused chapter shows everything (completeness, like the
              // reader's sheet), and so does a deliberately filtered-down
              // set — progressive disclosure is for the unfiltered flood.
              declutter={!focus && !journeyView && places.length > 60}
              route={journeyView?.route}
              showModern={showModern}
              fitKey={focus ? `${focus.book}|${focus.chapter}` : `scope|${scope}`}
              onReady={() => setMapReady(true)}
              onViewChange={handleViewChange}
              onSelectionChange={(members) => {
                if (pendingSearch.current) {
                  // While a picked place's zoom is still landing, a null
                  // report is the OLD selection dying mid-handoff (its
                  // exemption was just replaced) — swallow it; the picked
                  // place's own report follows and consumes the pending key.
                  if (!members) return;
                  if (members.some((m) => placeKey(m) === pendingSearch.current)) {
                    // keep the searched place's single-place panel
                    pendingSearch.current = null;
                    return;
                  }
                }
                pendingSearch.current = null;
                setShowAllRefs(false);
                // A deselection, or selecting something else, ends the
                // picked place's filter exemption.
                if (!members) setExemptKey(null);
                else if (exemptKey && !members.some((m) => placeKey(m) === exemptKey))
                  setExemptKey(null);
                setPanel(members ? { type: "places", members } : null);
              }}
              apiRef={mapApi}
              className="h-full w-full"
              // xl+: the floating search occupies the top-left corner
              hintClassName="left-2 top-2 xl:left-4 xl:top-16"
            />

            {/* Floating search over the map (xl+) */}
            <div className="absolute left-4 top-4 z-20 hidden w-80 xl:block">
              {searchBox(true)}
            </div>

            {/* Attribution overlay */}
            <p className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-neutral-400">
              Places:{" "}
              <a
                href="https://www.openbible.info/geo/"
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
              >
                OpenBible.info
              </a>{" "}
              CC BY 4.0 · basemap: Natural Earth · terrain: GMRT
            </p>

            {/* Detail panel */}
            {panel && (
              <div className="absolute bottom-3 left-3 right-3 max-h-[45%] overflow-y-auto rounded-xl border border-neutral-200 bg-paper/95 p-4 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 sm:right-auto sm:w-96">
                <button
                  onClick={() => {
                    setPanel(null);
                    mapApi.current?.focusKey(null);
                  }}
                  aria-label="Close place details"
                  className="absolute right-2 top-1.5 rounded-md p-1 text-lg leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                >
                  ×
                </button>
                {panel.type === "places"
                  ? panel.members.map((p) => placeDetails(p, true))
                  : placeDetails(panel.place, false)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
