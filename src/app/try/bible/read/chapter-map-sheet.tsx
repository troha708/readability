"use client";

/**
 * Bottom sheet opened by the header's Map button: every locatable place the
 * visible chapter mentions, plotted on the shared PlacesMap. Place data is
 * from OpenBible.info's Bible Geocoding dataset (CC BY 4.0); each selected
 * place links to its OpenBible.info page, which lists the sources attesting
 * the identification. The expand control opens the full-screen atlas page
 * focused on this chapter.
 */
import { useEffect, useMemo, useState } from "react";
import { chapterReference } from "@/lib/bible-book-order";
import { openBiblePlaceUrl, type ChapterPlace, type ChapterPlaces } from "@/lib/content/places";
import { PlacesMap } from "@/components/places-map";
import { readShowModernNames, writeShowModernNames } from "@/lib/map-prefs";

const KIND_LABELS = ["", "water", "region", "natural feature"];

/** One marker per name+site. Where the dataset keeps several records for
 *  the same name at the same site (Zin in Joshua 15, Red Sea in Numbers
 *  33), the card lists each record's verses separately, each with its own
 *  Sources link — grouping is display-only. */
type GroupedChapterPlace = ChapterPlace & { members: ChapterPlace[]; weight: number };

export function ChapterMapSheet({
  bookName,
  chapter,
  data,
  onClose,
  onGoToVerse,
}: {
  bookName: string;
  chapter: number;
  data: ChapterPlaces;
  onClose: () => void;
  onGoToVerse: (verse: number) => void;
}) {
  const [selection, setSelection] = useState<GroupedChapterPlace[] | null>(null);
  // Modern identifications under the ancient names — the same preference the
  // atlas writes, so the setting follows the reader between the two maps.
  const [showModern, setShowModern] = useState(false);
  useEffect(() => setShowModern(readShowModernNames()), []);
  const reference = `${chapterReference(bookName, chapter)}`;
  const places = useMemo(
    // Same-named records at the same site (Zin in Joshua 15, Red Sea in
    // Numbers 33) group into ONE marker and one card; the card keeps each
    // record's verses and Sources link separate. Weight mirrors the atlas
    // mentionsOf: regular + soft, gentilic excluded.
    () => {
      const bySite = new Map<string, ChapterPlace[]>();
      for (const p of data.places) {
        const k = `${p.name}|${p.x}|${p.y}`;
        let g = bySite.get(k);
        if (!g) bySite.set(k, (g = []));
        g.push(p);
      }
      return [...bySite.values()].map((members): GroupedChapterPlace => {
        const count = (m: ChapterPlace) => m.verses.length + m.soft.length;
        const sorted = [...members].sort((a, b) => count(b) - count(a));
        return {
          ...sorted[0],
          members: sorted,
          weight: sorted.reduce((n, m) => n + count(m), 0),
        };
      });
    },
    [data],
  );

  // Close on Escape, like the verse sheet.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-neutral-200 bg-paper shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <span className="text-base font-semibold text-amber-700 dark:text-amber-400">
            Places in {reference}
            <span className="ml-2 text-xs font-medium text-neutral-400">
              {data.places.length}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <a
              href={`/try/bible/map?book=${encodeURIComponent(bookName)}&chapter=${chapter}`}
              target="_blank"
              rel="noopener"
              className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
            >
              Full atlas ↗
            </a>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label="Close map"
            >
              ×
            </button>
          </span>
        </div>

        <div className="overflow-y-auto pb-6">
          {/* Map viewport */}
          {data.places.length > 0 && (
            <PlacesMap
              places={places}
              route={data.journey?.route}
              showModern={showModern}
              fitKey={`${bookName}|${chapter}`}
              onSelectionChange={setSelection}
              expandHref={`/try/bible/map?book=${encodeURIComponent(bookName)}&chapter=${chapter}`}
              className="mx-5 h-[min(46vh,400px)] rounded-xl border border-neutral-200 dark:border-neutral-700"
            />
          )}

          <div className="px-5">
            {/* Modern identifications under the names on the map. Hidden when
                this chapter's places have none to show; the setting is shared
                with the full atlas. */}
            {places.some((p) => p.modern) && (
              <button
                onClick={() => {
                  const next = !showModern;
                  setShowModern(next);
                  writeShowModernNames(next);
                }}
                aria-pressed={showModern}
                className={`mt-2 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-[0.25px] transition-colors ${
                  showModern
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                    : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                Modern names
              </button>
            )}
            {/* Journey context (Acts): the chapter's own leg is drawn on the
                map; the full route lives in the atlas. */}
            {data.journey && (
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Part of{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-200">
                  {data.journey.name}
                </span>{" "}
                ·{" "}
                <a
                  href={`/try/bible/map?journey=${data.journey.index}`}
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                >
                  view full route ↗
                </a>{" "}
                — route approximate.
              </p>
            )}
            {/* Selected place card */}
            {selection && (
              <div className="mt-3 rounded-xl bg-neutral-100/80 px-4 py-3 dark:bg-neutral-800/60">
                {selection.map((p) => {
                  const members = p.members?.length ? p.members : [p];
                  const grouped = members.length > 1;
                  const verseButtons = (verses: number[], muted = false) =>
                    verses.map((v, i) => (
                      <span key={v}>
                        {muted && i > 0 && ", "}
                        <button
                          onClick={() => onGoToVerse(v)}
                          className={
                            muted
                              ? "underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400"
                              : "rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-50 dark:bg-neutral-700 dark:text-amber-400 dark:hover:bg-neutral-600"
                          }
                        >
                          v. {v}
                        </button>
                      </span>
                    ));
                  const tierLines = (m: ChapterPlace) => (
                    <>
                      {m.soft.length > 0 && (
                        <p className="mt-0.5 text-xs italic text-neutral-500 dark:text-neutral-400">
                          Some translations read {m.name} here: {verseButtons(m.soft, true)}
                        </p>
                      )}
                      {m.gentilic.length > 0 && (
                        <p className="mt-0.5 text-xs italic text-neutral-500 dark:text-neutral-400">
                          Named through its people here: {verseButtons(m.gentilic, true)}
                        </p>
                      )}
                    </>
                  );
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
                  return (
                    // key by leader link: unique per name+site group.
                    <div key={p.link} className="py-1 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                          {p.name}
                        </span>
                        {(p.type || p.kind > 0) && (
                          <span className="text-xs text-neutral-400">
                            {p.type || KIND_LABELS[p.kind]}
                          </span>
                        )}
                        {!grouped && (
                          <span className="flex flex-wrap gap-1">{verseButtons(p.verses)}</span>
                        )}
                      </div>
                      {!grouped && tierLines(p)}
                      {grouped &&
                        members.map((m) => (
                          <div key={m.link} className="mt-1">
                            <span className="flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                              {verseButtons(m.verses)}
                              {m.uncertain && (
                                <span className="italic">identification uncertain ·</span>
                              )}
                              {sourcesLink(m.link)}
                            </span>
                            {tierLines(m)}
                          </div>
                        ))}
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {p.aka
                          ? p.uncertain
                            ? `Identification uncertain — possibly another name for ${p.aka}. `
                            : `Another name for ${p.aka}. `
                          : p.uncertain
                            ? `Location uncertain${p.modern ? ` — possibly near modern ${p.modern}` : " — best-supported site shown"}. `
                            : p.modern
                              ? `Near modern ${p.modern}. `
                              : ""}
                        {grouped ? (
                          <span>{members.length} entries in the source data.</span>
                        ) : (
                          sourcesLink(p.link)
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Places whose presence in this chapter rests on single-translation
                renderings (e.g. NRSV's "Zaphon" at Job 26:7) — say so up front,
                not only in the tap card. */}
            {data.places.some((p) => p.verses.length === 0 && p.soft.length > 0) && (
              <p className="mt-3 text-xs italic text-neutral-400">
                Named here only in some translations:{" "}
                {data.places
                  .filter((p) => p.verses.length === 0 && p.soft.length > 0)
                  .map((p) => `${p.name} (v. ${p.soft.join(", ")})`)
                  .join(" · ")}
              </p>
            )}
            {/* Places the chapter names only through their people ("country of
                the Gerasenes") — same up-front honesty. */}
            {data.places.some(
              (p) => p.verses.length === 0 && p.soft.length === 0 && p.gentilic.length > 0,
            ) && (
              <p className="mt-3 text-xs italic text-neutral-400">
                Named here only through its people:{" "}
                {data.places
                  .filter(
                    (p) => p.verses.length === 0 && p.soft.length === 0 && p.gentilic.length > 0,
                  )
                  .map((p) => `${p.name} (v. ${p.gentilic.join(", ")})`)
                  .join(" · ")}
              </p>
            )}

            {/* Unlocated places — honesty over silence */}
            {data.unlocated.length > 0 && (
              <p className="mt-3 text-xs text-neutral-400">
                Location unknown:{" "}
                {data.unlocated
                  .map((u) => `${u.name} (v. ${u.verses.join(", ")})`)
                  .join(" · ")}
              </p>
            )}

            {/* Attribution */}
            <p className="mt-3 text-[11px] text-neutral-400">
              Place data from{" "}
              <a
                href="https://www.openbible.info/geo/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
              >
                OpenBible.info
              </a>{" "}
              (CC BY 4.0) · basemap from{" "}
              <a
                href="https://www.naturalearthdata.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
              >
                Natural Earth
              </a>{" "}
              (public domain), terrain shading from{" "}
              <a
                href="https://www.gmrt.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
              >
                GMRT
              </a>{" "}
              elevation data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
