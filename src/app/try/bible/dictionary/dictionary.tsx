"use client";

/**
 * Client side of the Bible dictionary. Loads the slim search index once (all
 * 6,010 titles), filters it instantly as you type or browse by letter, and
 * loads a full article on demand when you open one. Cross-references jump to
 * other entries; scripture references open the verse peek in place.
 *
 * The selected entry lives in the URL (?entry=), so the back button steps
 * through the entries you opened and any entry is a shareable link.
 */
import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  fetchDictionaryIndex,
  fetchDictionaryArticle,
  fetchDictionaryAliases,
  fetchPeopleByDict,
  fetchPerson,
  type DictArticle,
  type DictIndexEntry,
  type PersonRecord,
} from "@/lib/content/client";
import {
  placeNameCandidates,
  DICT_ATLAS_ALIASES,
  type DictBlock,
  type DictCat,
} from "@/lib/content/dictionary";
import type { PersonRel, PersonRelations } from "@/lib/content/people";
import { FamilyTree } from "./family-tree";
import { isProtestantCanonBook } from "@/lib/bible-book-order";
import {
  parseScriptureRefs,
  scriptureRefLabel,
  type ScripturePassage,
} from "@/lib/scripture-refs";
import { VersePeek } from "@/components/verse-peek";
import { Logo } from "@/components/logo";
import { parseAtlas, type AtlasData, type AtlasPlace } from "@/lib/content/places";
import type { MapPlaceBase } from "@/components/places-map";
import { DictPlaceMap } from "./place-map";
import { SiteFooter } from "@/components/site-footer";

const PATH = "/try/bible/dictionary";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MAX_RESULTS = 80;
// Cap a browse list so a 2,000-entry facet doesn't render as one giant list;
// past this, the count shows a "showing first N" hint and a letter narrows it.
const BROWSE_CAP = 600;

// The six browse facets, in a reading order that leads with the concrete.
// `variant` (alt-spelling / "See X" stubs) is intentionally not a facet: those
// stay searchable but out of the browse. Codes come from _index.json's 5th slot.
const FACETS: { code: DictCat; label: string }[] = [
  { code: "people", label: "People" },
  { code: "place", label: "Places" },
  { code: "theology", label: "God, Faith & Theology" },
  { code: "culture", label: "Worship, Objects & Daily Life" },
  { code: "context", label: "Scripture, History & Peoples" },
  { code: "other", label: "Other" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Whole-Bible atlas (public/maps/atlas.json), loaded lazily the first time an
// article is opened so pure browsing never pays for it.
let atlasPromise: Promise<AtlasData | null> | null = null;
function loadAtlas(): Promise<AtlasData | null> {
  if (!atlasPromise) {
    atlasPromise = fetch("/maps/atlas.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => (raw ? parseAtlas(raw) : null))
      .catch(() => null)
      .then((a) => {
        if (!a) atlasPromise = null; // don't cache a failed load
        return a;
      });
  }
  return atlasPromise;
}

// ── Scripture linkifier (mirrors the reader's NoteText) ──────────────
// Bare "12:3" refs would resolve against an empty book, so keep only refs that
// name a real canonical book — every dictionary reference is spelled out.
function linkifyScripture(
  text: string,
  onPeek: (ref: ScripturePassage) => void,
  keyPrefix: string,
): ReactNode[] {
  const refs = parseScriptureRefs(text, "").filter((r) =>
    isProtestantCanonBook(r.book),
  );
  if (refs.length === 0) return [text];
  const nodes: ReactNode[] = [];
  let last = 0;
  refs.forEach((r, i) => {
    if (r.index > last) nodes.push(text.slice(last, r.index));
    nodes.push(
      <button
        key={`${keyPrefix}-${i}`}
        onClick={() => onPeek(r)}
        className="cursor-pointer underline decoration-dotted decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-amber-700 hover:decoration-amber-500 dark:decoration-neutral-500/70 dark:hover:text-amber-400"
        aria-label={`Preview ${scriptureRefLabel(r)}`}
      >
        {text.slice(r.index, r.index + r.length)}
      </button>,
    );
    last = r.index + r.length;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ── Auto-linking (Wikipedia-style) ───────────────────────────────────
// Turn the first mention of another entry's headword into a link to it. Scoped
// to named entities (people/places/peoples/books/terms) so common concept words
// ("love", "hand", "day") don't over-link; matched case-sensitively so only the
// capitalized proper-noun use links.
type EntryLinker = { re: RegExp; map: Map<string, string> };

const LINKABLE_CATS = new Set<DictCat>(["people", "place", "context"]);

// Generic geographic/common heads that a "X, Valley of" title reduces to — too
// vague to link on their own ("Salt", "East"), so never auto-link these forms.
const LINK_STOP = new Set([
  "east", "west", "north", "south", "salt", "valley", "mount", "mountain",
  "city", "sea", "way", "house", "gate", "tower", "pool", "land", "desert",
  "wilderness", "river", "well", "spring", "brook", "plain", "hill", "rock",
  "cave", "field", "garden", "gulf", "great", "holy", "upper", "lower", "court",
]);

// The surface forms an entry's title might appear as in prose.
function headwordForms(title: string): string[] {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const noTag = clean(title.replace(/\s*\([^)]*\)\s*$/, ""));
  const out = [noTag];
  const ci = noTag.indexOf(",");
  if (ci > 0) {
    const head = clean(noTag.slice(0, ci));
    const tail = clean(noTag.slice(ci + 1));
    out.push(clean(`${tail} ${head}`)); // "Galilee, Sea of" → "Sea of Galilee"
    out.push(head); //                     "Herod, Herodian Family" → "Herod"
  }
  return out;
}

function buildEntryLinker(index: DictIndexEntry[] | null): EntryLinker | null {
  if (!index) return null;
  const map = new Map<string, string>();
  for (const e of index) {
    if (!e.cat || !LINKABLE_CATS.has(e.cat)) continue;
    for (const form of headwordForms(e.title)) {
      // Capitalized, ≥4 chars, no interior comma; longest title loses to the
      // first (shortest) one already registered for a surface form.
      if (form.length < 4 || !/^[A-Z]/.test(form) || form.includes(",")) continue;
      if (LINK_STOP.has(form.toLowerCase())) continue;
      if (!map.has(form)) map.set(form, e.id);
    }
  }
  if (map.size === 0) return null;
  const forms = [...map.keys()].sort((a, b) => b.length - a.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { map, re: new RegExp(`\\b(?:${forms.map(esc).join("|")})\\b`, "g") };
}

const linkClass =
  "cursor-pointer font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 transition-colors hover:decoration-amber-500 dark:text-amber-400 dark:decoration-amber-700/60";

// Split a plain string into text + entry-link nodes (first mention per target).
function linkifyEntries(
  text: string,
  linker: EntryLinker,
  onXref: (id: string) => void,
  used: Set<string>,
  keyPrefix: string,
): ReactNode[] {
  linker.re.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linker.re.exec(text)) !== null) {
    const id = linker.map.get(m[0]);
    if (!id || used.has(id)) continue;
    used.add(id);
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <button
        key={`${keyPrefix}-e${i++}`}
        onClick={() => onXref(id)}
        className={linkClass}
      >
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

// Scripture refs first, then entry links inside the remaining plain segments.
function renderInline(
  text: string,
  onPeek: (ref: ScripturePassage) => void,
  onXref: (id: string) => void,
  linker: EntryLinker | null,
  used: Set<string>,
  keyPrefix: string,
): ReactNode[] {
  const scriptureNodes = linkifyScripture(text, onPeek, keyPrefix);
  if (!linker) return scriptureNodes;
  const out: ReactNode[] = [];
  scriptureNodes.forEach((node, i) => {
    if (typeof node === "string") {
      out.push(...linkifyEntries(node, linker, onXref, used, `${keyPrefix}-${i}`));
    } else {
      out.push(node);
    }
  });
  return out;
}

// ── Article body ─────────────────────────────────────────────────────
function ArticleBody({
  blocks,
  onXref,
  onPeek,
  linker,
  selfId,
}: {
  blocks: DictBlock[];
  onXref: (id: string) => void;
  onPeek: (ref: ScripturePassage) => void;
  linker: EntryLinker | null;
  selfId: string;
}) {
  // First mention wins, across the whole article; never link to self, and treat
  // Tyndale's own cross-references as already "used" so we don't double-link.
  const used = new Set<string>([selfId]);
  for (const b of blocks) for (const r of b.runs) if (r.x) used.add(r.x);
  return (
    <>
      {blocks.map((block, bi) => {
        const inner = block.runs.map((run, ri) => {
          if (run.x) {
            return (
              <button
                key={ri}
                onClick={() => onXref(run.x!)}
                className={linkClass}
              >
                {run.s}
              </button>
            );
          }
          // Auto-link entry mentions in paragraphs only, not in headings.
          const linked = block.h
            ? linkifyScripture(run.s, onPeek, `${bi}-${ri}`)
            : renderInline(run.s, onPeek, onXref, linker, used, `${bi}-${ri}`);
          return run.i ? (
            <em key={ri}>{linked}</em>
          ) : (
            <Fragment key={ri}>{linked}</Fragment>
          );
        });
        if (block.h === 2) {
          return (
            <h2
              key={bi}
              className="mt-7 text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {inner}
            </h2>
          );
        }
        if (block.h === 3) {
          return (
            <h3
              key={bi}
              className="mt-5 text-base font-semibold text-neutral-800 dark:text-neutral-200"
            >
              {inner}
            </h3>
          );
        }
        return (
          <p
            key={bi}
            className="mt-3 leading-relaxed text-neutral-800 dark:text-neutral-200"
          >
            {inner}
          </p>
        );
      })}
    </>
  );
}

// ── Person family + verse index (merged in from the former People hub) ──
// Match a relative's name to a person dictionary article, the way build-people
// resolves a person to their entry (strip "(Person)" tag, diacritics, punct).
function personKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

function hasTree(rel?: PersonRelations): boolean {
  return Boolean(
    rel &&
      (rel.f || rel.m || rel.sib?.length || rel.par?.length || rel.off?.length),
  );
}

/**
 * The "who" panel for a person article: one card per individual that shares the
 * headword (most-referenced first, capped), each with a family tree and a
 * collapsible verse index. Relatives link to their own dictionary article.
 */
function PeopleSection({
  people,
  resolveRel,
  onOpen,
  onPeek,
}: {
  people: PersonRecord[];
  resolveRel: (r: PersonRel) => PersonRel;
  onOpen: (id: string) => void;
  onPeek: (ref: ScripturePassage) => void;
}) {
  const MAX = 6;
  const many = people.length > 1;
  const shown = people.slice(0, MAX);
  const remap = (rel: PersonRelations): PersonRelations => ({
    f: rel.f && resolveRel(rel.f),
    m: rel.m && resolveRel(rel.m),
    sib: rel.sib?.map(resolveRel),
    par: rel.par?.map(resolveRel),
    off: rel.off?.map(resolveRel),
  });

  return (
    <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {many ? `${people.length} people named ${people[0].n}` : "Family"}
      </h2>
      {shown.map((p) => (
        <div key={p.id} className="mt-4 first:mt-3">
          {many && (
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {p.n}
              {p.d ? (
                <span className="font-normal text-neutral-500"> — {p.d}</span>
              ) : null}
            </p>
          )}
          {hasTree(p.rel) ? (
            <FamilyTree name={p.n} rel={remap(p.rel!)} onOpen={onOpen} />
          ) : !many ? (
            <p className="mt-2 text-sm text-neutral-500">
              No family relationships are recorded for {p.n}.
            </p>
          ) : null}
          {p.refs && p.refs.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200">
                Appears in {p.refs.length} passage{p.refs.length === 1 ? "" : "s"}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {p.refs.map((r, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="text-neutral-300 dark:text-neutral-600"> · </span>}
                    {linkifyScripture(r, onPeek, `ref-${p.id}-${i}`)}
                  </Fragment>
                ))}
              </p>
            </details>
          )}
        </div>
      ))}
      {people.length > MAX && (
        <p className="mt-3 text-sm text-neutral-500">
          + {people.length - MAX} more individuals share this name; see the
          article above.
        </p>
      )}
    </section>
  );
}

/** One source line: the article's, plus the family data's on person articles. */
function Attribution({ withFamily = false }: { withFamily?: boolean }) {
  return (
    <p className="mt-8 text-xs text-neutral-400">
      Article adapted from the{" "}
      <a
        href="https://tyndaleopenresources.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
      >
        Tyndale Open Bible Dictionary
      </a>
      , © Tyndale House Publishers (CC BY-SA 4.0)
      {withFamily && (
        <>
          {" · "}family data from{" "}
          <a
            href="https://github.com/STEPBible/STEPBible-Data"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
          >
            TIPNR
          </a>
          , STEPBible (CC BY 4.0)
        </>
      )}
      .
    </p>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────
export function Dictionary() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entry");

  const [index, setIndex] = useState<DictIndexEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [category, setCategory] = useState<DictCat | null>(null);
  const [article, setArticle] = useState<DictArticle | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [peek, setPeek] = useState<ScripturePassage | null>(null);
  const [atlas, setAtlas] = useState<AtlasData | null>(null);
  const [aliases, setAliases] = useState<Record<string, string[]> | null>(null);
  const [byDict, setByDict] = useState<Record<string, string[]> | null>(null);
  const [persons, setPersons] = useState<PersonRecord[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the search index once.
  useEffect(() => {
    let cancelled = false;
    fetchDictionaryIndex().then((rows) => {
      if (!cancelled) setIndex(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the (small) dict-id → person-ids map once, so a person article can
  // show that individual's family tree(s) and verse index.
  useEffect(() => {
    fetchPeopleByDict()
      .then(setByDict)
      .catch(() => setByDict({}));
  }, []);

  // Whenever the open article maps to one or more people, load their records
  // (bounded), most-referenced first.
  useEffect(() => {
    if (!entryId || !byDict) {
      setPersons(null);
      return;
    }
    const ids = byDict[entryId];
    if (!ids || ids.length === 0) {
      setPersons(null);
      return;
    }
    let cancelled = false;
    setPersons(null);
    Promise.all(ids.slice(0, 15).map(fetchPerson)).then((recs) => {
      if (cancelled) return;
      const valid = recs.filter((r): r is PersonRecord => Boolean(r));
      valid.sort((a, b) => (b.refs?.length ?? 0) - (a.refs?.length ?? 0));
      setPersons(valid.length ? valid : null);
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, byDict]);

  // Load the selected article whenever ?entry= changes.
  useEffect(() => {
    if (!entryId) {
      setArticle(null);
      return;
    }
    let cancelled = false;
    setArticleLoading(true);
    setArticle(null);
    fetchDictionaryArticle(entryId).then((a) => {
      if (cancelled) return;
      setArticle(a);
      setArticleLoading(false);
    });
    scrollRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  // Load the atlas the first time any article opens (place articles get a
  // "Show on map"); one fetch, reused thereafter, skipped during pure browse.
  const atlasRequested = useRef(false);
  useEffect(() => {
    if (!entryId || atlasRequested.current) return;
    atlasRequested.current = true;
    loadAtlas().then(setAtlas);
    fetchDictionaryAliases()
      .then(setAliases)
      .catch(() => setAliases({}));
  }, [entryId]);

  // Normalized place name → every atlas place bearing it (biblical names
  // recur: two Antiochs, six Ramahs). A hyphen-and-space-blind secondary key
  // covers spelling drift ("En-Gedi" ↔ "Engedi", "Be-Eshterah" ↔ "Beeshterah").
  const atlasByName = useMemo(() => {
    const m = new Map<string, AtlasPlace[]>();
    if (!atlas) return m;
    const add = (k: string, p: AtlasPlace) => {
      const list = m.get(k);
      if (list) list.push(p);
      else m.set(k, [p]);
    };
    for (const p of atlas.places) {
      const k = normalize(p.name);
      add(k, p);
      const collapsed = k.replace(/[-\s]/g, "");
      if (collapsed !== k) add(collapsed, p);
    }
    return m;
  }, [atlas]);

  // Every verse (and chapter) the open article cites — the tiebreaker between
  // same-named atlas places. Verse-level is the primary signal: both Antiochs
  // appear in Acts 13 (13:1 Syrian, 13:14 Pisidian), so chapters alone can't
  // tell them apart.
  const articleRefs = useMemo(() => {
    const verses = new Set<string>();
    const chapters = new Set<string>();
    if (!article) return { verses, chapters };
    for (const block of article.b)
      for (const run of block.runs)
        for (const r of parseScriptureRefs(run.s, "")) {
          for (let ch = r.chapter; ch <= (r.endChapter ?? r.chapter); ch++)
            chapters.add(`${r.book}|${ch}`);
          if (r.verse != null && r.endChapter == null)
            for (let v = r.verse; v <= (r.endVerse ?? r.verse); v++)
              verses.add(`${r.book}|${r.chapter}|${v}`);
        }
    return { verses, chapters };
  }, [article]);

  // Does the open article name a mappable place? Try each candidate form of
  // the title ("Cush (Place)" → "Cush", "Antioch of Syria" → "Antioch", …);
  // among same-named places, prefer the one the article's citations point at.
  const matchedPlace = useMemo(() => {
    if (!article || !atlas) return null;
    const mentionsOf = (p: AtlasPlace) =>
      p.refs.reduce((n, [, , v]) => n + v.length, 0);
    const verseOverlap = (p: AtlasPlace) =>
      p.refs.reduce(
        (n, [b, c, v]) =>
          n + v.filter((vv) => articleRefs.verses.has(`${atlas.books[b]}|${c}|${vv}`)).length,
        0,
      );
    const chapterOverlap = (p: AtlasPlace) =>
      p.refs.reduce(
        (n, [b, c]) => n + (articleRefs.chapters.has(`${atlas.books[b]}|${c}`) ? 1 : 0),
        0,
      );
    const pick = (list: AtlasPlace[]) =>
      list.length === 1
        ? list[0]
        : [...list].sort(
            (a, b) =>
              verseOverlap(b) - verseOverlap(a) ||
              chapterOverlap(b) - chapterOverlap(a) ||
              mentionsOf(b) - mentionsOf(a),
          )[0];
    const tryTitle = (t: string) => {
      for (const c of placeNameCandidates(t)) {
        const k = normalize(c);
        const list = atlasByName.get(k) ?? atlasByName.get(k.replace(/[-\s]/g, ""));
        if (list?.length) return pick(list);
      }
      return null;
    };
    // Hand-verified alias first (Azotus → Ashdod; "" suppresses — the atlas
    // "Eden" is not the Garden of Eden), then the article's own name, then
    // any older-spelling alias that redirects here ("Dead Sea" ← "Salt Sea"),
    // since the atlas keys on biblical names.
    const curated = DICT_ATLAS_ALIASES[article.id];
    if (curated === "") return null;
    let matched = curated ? tryTitle(curated) : null;
    if (!matched) matched = tryTitle(article.t);
    if (!matched && aliases) {
      for (const alt of aliases[article.id] ?? []) {
        matched = tryTitle(alt);
        if (matched) break;
      }
    }
    return matched;
  }, [article, atlas, atlasByName, aliases, articleRefs]);

  // The matched place plus every place the Bible mentions 10+ times, so the
  // map shows the looked-up place among the major places across the whole
  // map — not just whatever happens to sit nearby.
  const MIN_MENTIONS = 10;
  const mapPlaces = useMemo<MapPlaceBase[]>(() => {
    if (!matchedPlace || !atlas) return [];
    const targetKey = `${matchedPlace.name}|${matchedPlace.x}|${matchedPlace.y}`;
    const out: MapPlaceBase[] = [];
    for (const p of atlas.places) {
      const mentions = p.refs.reduce((n, [, , v]) => n + v.length, 0);
      const isTarget = `${p.name}|${p.x}|${p.y}` === targetKey;
      if (mentions >= MIN_MENTIONS || isTarget) {
        out.push({
          name: p.name,
          x: p.x,
          y: p.y,
          kind: p.kind,
          uncertain: p.uncertain,
          weight: mentions,
        });
      }
    }
    return out;
  }, [matchedPlace, atlas]);

  // normName → person article id, so a relative chip opens that person's entry.
  const dictByPerson = useMemo(() => {
    const m = new Map<string, string>();
    if (!index) return m;
    for (const e of index) {
      if (e.cat !== "people") continue;
      const k = personKey(e.title);
      if (!m.has(k)) m.set(k, e.id);
    }
    return m;
  }, [index]);

  const resolveRel = (r: PersonRel): PersonRel => {
    const id = dictByPerson.get(personKey(r.n));
    const out: PersonRel = id ? { id, n: r.n } : { n: r.n };
    if (r.q) out.q = r.q;
    return out;
  };

  // The auto-linker (built once from the index) — first mention of any named
  // entry in an article becomes a link to it.
  const entryLinker = useMemo(() => buildEntryLinker(index), [index]);

  function openEntry(id: string) {
    router.push(`${PATH}?entry=${encodeURIComponent(id)}`);
  }
  function closeEntry() {
    router.push(PATH);
  }

  const results = useMemo(() => {
    if (!index) return [];
    if (query.trim()) {
      const q = normalize(query.trim());
      const scored: { e: DictIndexEntry; rank: number }[] = [];
      for (const e of index) {
        const t = normalize(e.title);
        const pos = t.indexOf(q);
        if (pos === -1) continue;
        // Prefix matches first, then earliest match, then alphabetical.
        scored.push({ e, rank: pos === 0 ? 0 : t.startsWith(q + " ") ? 0 : 1 });
      }
      scored.sort(
        (a, b) => a.rank - b.rank || a.e.title.localeCompare(b.e.title),
      );
      return scored.slice(0, MAX_RESULTS).map((s) => s.e);
    }
    // Browse by category and/or letter. Alt-spelling / "See X" stubs (variant)
    // stay searchable above, but never clutter the browse.
    if (!letter && !category) return [];
    let out = index.filter((e) => e.cat !== "variant");
    if (category) out = out.filter((e) => e.cat === category);
    if (letter) out = out.filter((e) => e.letter === letter);
    return out;
  }, [index, query, letter, category]);

  const isSearch = Boolean(query.trim());
  const shown = isSearch ? results : results.slice(0, BROWSE_CAP);
  const truncated = !isSearch && results.length > BROWSE_CAP;
  const activeFacet = FACETS.find((f) => f.code === category);

  const showingArticle = Boolean(entryId);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-925">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-925/90">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <span className="mr-1 shrink-0">
            <Logo compact />
          </span>
          {showingArticle ? (
            <button
              onClick={closeEntry}
              className="shrink-0 rounded-md px-2 py-2 text-lg leading-none text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              aria-label="Back to dictionary"
              title="Back to the dictionary"
            >
              ←
            </button>
          ) : (
            <Link
              href="/try/bible/start"
              className="shrink-0 rounded-md px-2 py-1.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              ← Library
            </Link>
          )}
          {/* Always present — search other entries without leaving the article.
              Same element in both views, so typing keeps focus. */}
          <input
            type="search"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (v) setLetter(null);
              // Typing while reading returns to the results list.
              if (v && entryId) router.push(PATH);
            }}
            placeholder="Search the dictionary…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            autoComplete="off"
          />
        </div>
      </header>

      <div ref={scrollRef} className="mx-auto max-w-3xl px-4 pb-8">
        {showingArticle ? (
          // ── Article view ──
          articleLoading ? (
            <Spinner />
          ) : article ? (
            <article className="pt-6">
              <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-50">
                {article.t}
              </h1>
              {matchedPlace && (
                <DictPlaceMap place={matchedPlace} places={mapPlaces} />
              )}
              <ArticleBody
                blocks={article.b}
                onXref={openEntry}
                onPeek={setPeek}
                linker={entryLinker}
                selfId={article.id}
              />
              {persons && (
                <PeopleSection
                  people={persons}
                  resolveRel={resolveRel}
                  onOpen={openEntry}
                  onPeek={setPeek}
                />
              )}
              <Attribution withFamily={!!persons && persons.length > 0} />
            </article>
          ) : (
            <div className="pt-16 text-center text-neutral-500">
              <p>That entry couldn’t be found.</p>
              <button
                onClick={closeEntry}
                className="mt-3 text-sm font-medium text-amber-600 hover:underline dark:text-amber-400"
              >
                Back to the dictionary
              </button>
            </div>
          )
        ) : index === null ? (
          <Spinner />
        ) : (
          // ── Browse / search ──
          <div className="pt-4">
            {/* Category facets */}
            <div className="flex flex-wrap gap-1.5">
              {FACETS.map((f) => (
                <button
                  key={f.code}
                  onClick={() => {
                    setCategory((cur) => (cur === f.code ? null : f.code));
                    setQuery("");
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    category === f.code
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* A–Z browse (narrows within the active category) */}
            <div className="mt-2 flex flex-wrap gap-1">
              {LETTERS.map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setLetter((cur) => (cur === l ? null : l));
                    setQuery("");
                  }}
                  className={`h-8 w-8 rounded-md text-sm font-medium tabular-nums transition-colors ${
                    letter === l
                      ? "bg-amber-500 text-white"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {results.length > 0 ? (
              <>
                <p className="mt-5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {isSearch
                    ? `${results.length}${results.length === MAX_RESULTS ? "+" : ""} result${results.length === 1 ? "" : "s"}`
                    : `${[activeFacet?.label, letter].filter(Boolean).join(" · ")} — ${results.length.toLocaleString()} entr${results.length === 1 ? "y" : "ies"}${truncated ? `, showing first ${BROWSE_CAP}` : ""}`}
                </p>
                <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800/70">
                  {shown.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => openEntry(e.id)}
                        className="w-full py-2.5 text-left text-[15px] text-neutral-800 transition-colors hover:text-amber-700 dark:text-neutral-200 dark:hover:text-amber-400"
                      >
                        {e.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : query.trim() ? (
              <p className="mt-10 text-center text-sm text-neutral-500">
                No entries match “{query.trim()}”.
              </p>
            ) : (
              <div className="mt-10 text-center text-sm text-neutral-500">
                <p>
                  {index.length.toLocaleString()} articles on the people, places,
                  events, and terms of the Bible.
                </p>
                <p className="mt-1 text-neutral-400">
                  Search above, pick a category, or jump to a letter.
                </p>
              </div>
            )}
          </div>
        )}
        <SiteFooter className="mt-12" />
      </div>

      {peek && (
        <VersePeek
          reference={peek}
          versionAbbr="BSB"
          onClose={() => setPeek(null)}
        />
      )}
    </div>
  );
}
