"use client";

/**
 * The landing header's search: a real input with a dropdown of grouped
 * results — dictionary entries (instant, client-side index) above the top
 * verse matches (server search), with a typed reference ("John 3:16")
 * jumping straight to the chapter. Same corpora as the reader/library
 * SearchModal; an "All N verse matches" row hands off to that modal for
 * scopes and paging. Places resolve through their dictionary articles.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  searchScripture,
  fetchDictionaryIndex,
  type DictIndexEntry,
} from "@/lib/content/client";
import { parseBibleReference, type BibleReference } from "@/lib/bible-reference";
import { chapterReference } from "@/lib/bible-book-order";
import { type VerseHit } from "@/lib/search/verse-search";
import { SearchModal, normalizeTitle } from "@/components/search-modal";

const DICT_SHOWN = 4;
const VERSES_SHOWN = 6;
const VERSION = "BSB";

/** Muted per-row tag for the two facets the placeholder promises by name. */
const CAT_TAG: Record<string, string> = { people: "person", place: "place" };

type Row =
  | { kind: "ref"; ref: BibleReference; label: string }
  | { kind: "dict"; entry: DictIndexEntry }
  | { kind: "verse"; hit: VerseHit }
  | { kind: "all" };

/** The verse text with the matched phrase bolded, sliced to start near it. */
function Snippet({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = text.toLowerCase().indexOf(q);
  if (at === -1) return <>{text}</>;
  const from = at > 30 ? text.lastIndexOf(" ", at - 20) + 1 : 0;
  const lead = from > 0 ? "…" : "";
  return (
    <>
      {lead}
      {text.slice(from, at)}
      <strong className="font-semibold text-neutral-100">
        {text.slice(at, at + q.length)}
      </strong>
      {text.slice(at + q.length)}
    </>
  );
}

export function LandingSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dictIndex, setDictIndex] = useState<DictIndexEntry[] | null>(null);
  const [verses, setVerses] = useState<VerseHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestRef = useRef(0);

  // Ctrl/Cmd+K focuses the box (the reader/library shortcut, masthead-style).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Load the dictionary index once, on first focus.
  function ensureDictIndex() {
    if (!dictIndex) fetchDictionaryIndex().then(setDictIndex);
  }

  const normIndex = useMemo(
    () => (dictIndex ? dictIndex.map((e) => ({ e, n: normalizeTitle(e.title) })) : []),
    [dictIndex],
  );
  const dictMatches = useMemo(() => {
    const q = normalizeTitle(query);
    if (q.length < 2) return [];
    const scored: { e: DictIndexEntry; rank: number }[] = [];
    for (const { e, n } of normIndex) {
      const pos = n.indexOf(q);
      if (pos === -1) continue;
      scored.push({ e, rank: pos === 0 ? 0 : 1 });
    }
    scored.sort((a, b) => a.rank - b.rank || a.e.title.localeCompare(b.e.title));
    return scored.slice(0, DICT_SHOWN).map((s) => s.e);
  }, [normIndex, query]);

  function handleInput(value: string) {
    setQuery(value);
    setActive(-1);
    setOpen(true);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setVerses([]);
      setTotal(0);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestRef.current;
      searchScripture(value.trim(), VERSION, { limit: VERSES_SHOWN, scope: "all" })
        .then(({ results, total }) => {
          if (requestId !== requestRef.current) return;
          setVerses(results);
          setTotal(total);
          setSearched(true);
        })
        .catch(() => {
          if (requestId !== requestRef.current) return;
          setVerses([]);
          setTotal(0);
          setSearched(true);
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    }, 300);
  }

  const reference = parseBibleReference(query);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (reference) {
      const label = `${chapterReference(reference.book, reference.chapter)}${
        reference.verse ? `:${reference.verse}` : ""
      }`;
      out.push({ kind: "ref", ref: reference, label });
    }
    for (const entry of dictMatches) out.push({ kind: "dict", entry });
    for (const hit of verses) out.push({ kind: "verse", hit });
    if (total > verses.length) out.push({ kind: "all" });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, dictMatches, verses, total]);

  const showPanel =
    open && query.trim().length >= 2 && (rows.length > 0 || loading || searched);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function activate(row: Row) {
    close();
    if (row.kind === "ref") {
      const verseParam = row.ref.verse ? `&verse=${row.ref.verse}` : "";
      router.push(
        `/try/bible/read?book=${encodeURIComponent(row.ref.book)}&chapter=${row.ref.chapter}&version=${VERSION}${verseParam}`,
      );
    } else if (row.kind === "dict") {
      router.push(`/try/bible/dictionary?entry=${encodeURIComponent(row.entry.id)}`);
    } else if (row.kind === "verse") {
      // Phrase hits re-find and spotlight the text via ?highlight=; scattered-
      // word hits land on the verse itself (same scheme as the SearchModal).
      const target = row.hit.phrase
        ? `&highlight=${encodeURIComponent(query.trim())}`
        : `&verse=${row.hit.verse}`;
      router.push(
        `/try/bible/read?book=${encodeURIComponent(row.hit.book)}&chapter=${row.hit.chapter}&version=${VERSION}${target}`,
      );
    } else {
      setModalOpen(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!showPanel || rows.length === 0) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      // Cycle through -1 (nothing selected) .. rows.length-1.
      setActive((a) => ((a + 1 + delta + rows.length + 1) % (rows.length + 1)) - 1);
      return;
    }
    if (e.key === "Enter") {
      const row = active >= 0 ? rows[active] : rows[0];
      if (row) activate(row);
    }
  }

  const groupHeading =
    "px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500";
  const rowClass = (i: number) =>
    `block w-full cursor-pointer px-3 py-1.5 text-left text-sm ${
      i === active ? "bg-neutral-800" : "hover:bg-neutral-800/60"
    }`;

  const firstDict = rows.findIndex((r) => r.kind === "dict");
  const firstVerse = rows.findIndex((r) => r.kind === "verse");

  return (
    // The search reads as a field: a whisper of the surface tone over the
    // black bar (60% #202121 ≈ #171818), no rules around it. On phones it
    // takes its own full-width row under the logo.
    <div className="relative order-last w-full pb-3 md:order-none md:ml-5 md:mr-3 md:flex md:w-auto md:flex-1 md:items-center md:self-stretch md:py-0">
      <div className="flex h-10 w-full items-center gap-2 rounded-lg bg-neutral-900/60 px-4 text-sm">
        <svg
          className="h-4 w-4 shrink-0 text-neutral-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => {
            ensureDictIndex();
            setOpen(true);
          }}
          onBlur={() => setTimeout(close, 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search verses, people, places and concepts"
          aria-label="Search verses, people, places and concepts"
          className="w-full truncate bg-transparent text-neutral-200 outline-none placeholder:text-neutral-500"
        />
      </div>

      {showPanel && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl md:w-[28rem]">
          {rows.map((row, i) => (
            <div key={i}>
              {i === firstDict && <p className={groupHeading}>Dictionary</p>}
              {i === firstVerse && <p className={groupHeading}>Verses</p>}
              <button
                className={rowClass(i)}
                onMouseEnter={() => setActive(i)}
                onClick={() => activate(row)}
              >
                {row.kind === "ref" && (
                  <span className="font-medium text-amber-400">
                    Go to {row.label} →
                  </span>
                )}
                {row.kind === "dict" && (
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-medium text-neutral-200">
                      {row.entry.title}
                    </span>
                    {row.entry.cat && CAT_TAG[row.entry.cat] && (
                      <span className="shrink-0 text-xs text-neutral-500">
                        {CAT_TAG[row.entry.cat]}
                      </span>
                    )}
                  </span>
                )}
                {row.kind === "verse" && (
                  <span className="block">
                    <span className="font-medium text-amber-400">
                      {chapterReference(row.hit.book, row.hit.chapter)}:{row.hit.verse}
                    </span>{" "}
                    <span className="text-neutral-400">
                      <Snippet text={row.hit.text} query={query} />
                    </span>
                  </span>
                )}
                {row.kind === "all" && (
                  <span className="font-medium text-neutral-300">
                    All {total} verse matches →
                  </span>
                )}
              </button>
            </div>
          ))}
          {loading && verses.length === 0 && (
            <p className="px-3 py-1.5 text-sm text-neutral-500">Searching verses…</p>
          )}
          {!loading && searched && rows.length === 0 && (
            <p className="px-3 py-1.5 text-sm text-neutral-500">No matches.</p>
          )}
        </div>
      )}

      <SearchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialQuery={query}
      />
    </div>
  );
}
