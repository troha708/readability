"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { AuthButton } from "@/components/auth-button";
import {
  loadHighlights,
  type HighlightsMap,
  type HighlightColor,
  type VerseHighlight,
  type ColorLabels,
  highlightColorInfo,
  NOTE_ONLY_STYLE,
  HIGHLIGHT_COLORS,
  getColorLabels,
  saveColorLabels,
} from "@/lib/highlights-service";
import { getLastReadUrl } from "@/lib/reading-progress";

type VerseRange = {
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  highlight: VerseHighlight;
};

function groupByBook(map: HighlightsMap): Record<string, VerseRange[]> {
  const raw: Record<string, { chapter: number; verse: number; hl: VerseHighlight }[]> = {};
  for (const key of Object.keys(map)) {
    const [book, chapterStr, verseStr] = key.split(":");
    if (!raw[book]) raw[book] = [];
    raw[book].push({
      chapter: parseInt(chapterStr, 10),
      verse: parseInt(verseStr, 10),
      hl: map[key],
    });
  }

  const groups: Record<string, VerseRange[]> = {};
  for (const book of Object.keys(raw)) {
    raw[book].sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
    const ranges: VerseRange[] = [];
    for (const h of raw[book]) {
      const last = ranges[ranges.length - 1];
      if (
        last &&
        last.chapter === h.chapter &&
        last.highlight.color === h.hl.color &&
        last.highlight.note === h.hl.note &&
        h.verse === last.endVerse + 1
      ) {
        last.endVerse = h.verse;
      } else {
        ranges.push({ book, chapter: h.chapter, startVerse: h.verse, endVerse: h.verse, highlight: h.hl });
      }
    }
    groups[book] = ranges;
  }
  return groups;
}

type FilterMode = "all" | "notes" | HighlightColor;

export default function HighlightsPage() {
  const [highlights, setHighlights] = useState<HighlightsMap>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [colorLabels, setColorLabels] = useState<ColorLabels>({});
  const [editingColor, setEditingColor] = useState<HighlightColor | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [lastReadUrl, setLastReadUrl] = useState<string | null>(null);

  useEffect(() => {
    loadHighlights().then((h) => {
      setHighlights(h);
      setLoading(false);
    });
    setColorLabels(getColorLabels());
    setLastReadUrl(getLastReadUrl());
  }, []);

  useEffect(() => {
    if (editingColor) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingColor]);

  function handleSaveLabel() {
    if (!editingColor) return;
    const updated = { ...colorLabels };
    const trimmed = editValue.trim();
    if (trimmed) {
      updated[editingColor] = trimmed;
    } else {
      delete updated[editingColor];
    }
    setColorLabels(updated);
    saveColorLabels(updated);
    setEditingColor(null);
    setEditValue("");
  }

  // All books that have highlights (for dropdown)
  const allBooks = [...new Set(Object.keys(highlights).map((k) => k.split(":")[0]))].sort();

  // Filter highlights
  const filtered = Object.fromEntries(
    Object.entries(highlights).filter(([key, v]) => {
      if (bookFilter !== "all" && !key.startsWith(bookFilter + ":")) return false;
      if (filter === "all") return true;
      if (filter === "notes") return !!v.note;
      return v.color === filter;
    }),
  );

  const grouped = groupByBook(filtered);
  const bookNames = Object.keys(grouped);
  const totalCount = Object.values(grouped).reduce((sum, ranges) => sum + ranges.length, 0);

  // Count per color for badges — a note with no highlight has no colour to count
  const colorCounts: Record<HighlightColor, number> = { yellow: 0, green: 0, blue: 0, pink: 0 };
  for (const v of Object.values(highlights)) {
    if (v.color) colorCounts[v.color]++;
  }

  function colorLabel(color: HighlightColor): string {
    return colorLabels[color] || color.charAt(0).toUpperCase() + color.slice(1);
  }

  const filterBtnClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
      active
        ? "bg-white text-amber-700 shadow-sm dark:bg-neutral-700 dark:text-amber-400"
        : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
    }`;

  return (
    <main className="min-h-screen bg-white px-4 py-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl">
        {/* Navbar */}
        <div className="mb-2 flex items-center justify-between">
          <Logo />
          <AuthButton />
        </div>

        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold text-neutral-900 dark:text-white">
            My Highlights & Notes
          </h1>
          <p className="mt-1 font-scripture text-sm text-neutral-500 dark:text-neutral-400">
            {totalCount} highlight{totalCount !== 1 ? "s" : ""} across{" "}
            {bookNames.length} book{bookNames.length !== 1 ? "s" : ""}
          </p>

          {/* Filter tabs */}
          <div className="mt-3 inline-flex flex-wrap justify-center gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
            <button onClick={() => setFilter("all")} className={filterBtnClass(filter === "all")}>
              All
            </button>
            <button onClick={() => setFilter("notes")} className={filterBtnClass(filter === "notes")}>
              With Notes
            </button>
            {HIGHLIGHT_COLORS.map((c) => {
              const isEditing = editingColor === c.name;
              return (
                <span key={c.name} className="flex items-center gap-0">
                  {isEditing ? (
                    <form
                      className={`flex items-center gap-1 rounded-md px-2 py-1 ${filterBtnClass(true)}`}
                      onSubmit={(e) => { e.preventDefault(); handleSaveLabel(); }}
                    >
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.dot}`} />
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={c.name.charAt(0).toUpperCase() + c.name.slice(1)}
                        maxLength={24}
                        className="w-20 min-w-0 rounded border border-neutral-300 bg-white px-1.5 py-0 text-xs text-neutral-800 outline-none focus:border-amber-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
                        onBlur={handleSaveLabel}
                        onKeyDown={(e) => { if (e.key === "Escape") { setEditingColor(null); setEditValue(""); } }}
                      />
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => setFilter(c.name)}
                        className={filterBtnClass(filter === c.name)}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.dot}`} />
                          {colorLabel(c.name)}
                          {colorCounts[c.name] > 0 && (
                            <span className="text-[0.6rem] tabular-nums text-neutral-400 dark:text-neutral-500">
                              {colorCounts[c.name]}
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        onClick={() => { setEditingColor(c.name); setEditValue(colorLabels[c.name] ?? ""); }}
                        className="rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                        aria-label={`Rename ${c.name} label`}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                    </>
                  )}
                </span>
              );
            })}
          </div>

          {/* Book filter */}
          {allBooks.length > 1 && (
            <div className="mt-3">
              <select
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 outline-none focus:border-amber-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <option value="all">All Books</option>
                {allBooks.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center font-scripture text-sm text-neutral-400">
            Loading highlights...
          </div>
        ) : totalCount === 0 ? (
          <div className="py-20 text-center">
            <p className="font-scripture text-neutral-400 dark:text-neutral-500">
              {filter === "notes"
                ? "No highlights with notes yet."
                : filter !== "all"
                  ? `No ${colorLabel(filter as HighlightColor)} highlights yet.`
                  : "No highlights yet."}
            </p>
            <p className="mt-2 font-scripture text-sm text-neutral-400 dark:text-neutral-500">
              Select text while reading to highlight it.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {bookNames.map((book) => (
              <div key={book}>
                <h2 className="mb-2 font-ui text-sm font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {book}
                </h2>
                <div className="space-y-2">
                  {grouped[book].map((entry) => {
                    const colorInfo = entry.highlight.color
                      ? highlightColorInfo(entry.highlight.color)
                      : NOTE_ONLY_STYLE;
                    const verseLabel = entry.startVerse === entry.endVerse
                      ? `${entry.startVerse}`
                      : `${entry.startVerse}-${entry.endVerse}`;
                    return (
                      <Link
                        key={`${entry.book}:${entry.chapter}:${entry.startVerse}-${entry.endVerse}`}
                        href={`/try/bible/read?book=${encodeURIComponent(entry.book)}&chapter=${entry.chapter}&version=BSB`}
                        className={`block rounded-lg border p-3 transition-colors hover:border-amber-300 dark:hover:border-amber-700 ${colorInfo.bg} border-neutral-200 dark:border-neutral-700`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 shrink-0 rounded-full ${colorInfo.dot}`} />
                          <span className="font-scripture text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                            {entry.book} {entry.chapter}:{verseLabel}
                          </span>
                          <span className="text-[0.6rem] font-medium text-neutral-400 dark:text-neutral-500">
                            {entry.highlight.color
                              ? colorLabel(entry.highlight.color)
                              : "Note"}
                          </span>
                          <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
                            {new Date(entry.highlight.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {entry.highlight.note && (
                          <p className="mt-1.5 pl-5 font-scripture text-sm text-neutral-600 dark:text-neutral-400">
                            {entry.highlight.note}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back links */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/try/bible/start"
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
          >
            &larr; Library
          </Link>
          {lastReadUrl && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <Link
                href={lastReadUrl}
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                Continue reading &rarr;
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
