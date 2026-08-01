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

const KIND_LABELS = ["", "water", "region", "natural feature"];

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
  const [selection, setSelection] = useState<ChapterPlace[] | null>(null);
  const reference = `${chapterReference(bookName, chapter)}`;
  const places = useMemo(
    () => data.places.map((p) => ({ ...p, weight: p.verses.length })),
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
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
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
              fitKey={`${bookName}|${chapter}`}
              onSelectionChange={setSelection}
              expandHref={`/try/bible/map?book=${encodeURIComponent(bookName)}&chapter=${chapter}`}
              className="mx-5 h-[min(46vh,400px)] rounded-xl border border-neutral-200 dark:border-neutral-700"
            />
          )}

          <div className="px-5">
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
                {selection.map((p) => (
                  // key by link: names repeat (91 dupes) and, since records
                  // stopped merging, so do name+coords pairs (the two Ais) —
                  // the openbible link is the one per-record unique id.
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
                      <span className="flex flex-wrap gap-1">
                        {p.verses.map((v) => (
                          <button
                            key={v}
                            onClick={() => onGoToVerse(v)}
                            className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-50 dark:bg-neutral-700 dark:text-amber-400 dark:hover:bg-neutral-600"
                          >
                            v. {v}
                          </button>
                        ))}
                      </span>
                    </div>
                    {p.soft.length > 0 && (
                      <p className="mt-0.5 text-xs italic text-neutral-500 dark:text-neutral-400">
                        Some translations read {p.name} here:{" "}
                        {p.soft.map((v, i) => (
                          <span key={v}>
                            {i > 0 && ", "}
                            <button
                              onClick={() => onGoToVerse(v)}
                              className="underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400"
                            >
                              v. {v}
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
                    {p.gentilic.length > 0 && (
                      <p className="mt-0.5 text-xs italic text-neutral-500 dark:text-neutral-400">
                        Named through its people here:{" "}
                        {p.gentilic.map((v, i) => (
                          <span key={v}>
                            {i > 0 && ", "}
                            <button
                              onClick={() => onGoToVerse(v)}
                              className="underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400"
                            >
                              v. {v}
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {p.uncertain
                        ? `Location uncertain${p.modern ? ` — possibly near modern ${p.modern}` : " — best-supported site shown"}. `
                        : p.modern
                          ? `Near modern ${p.modern}. `
                          : ""}
                      <a
                        href={openBiblePlaceUrl(p.link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
                      >
                        Sources ↗
                      </a>
                    </p>
                  </div>
                ))}
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
