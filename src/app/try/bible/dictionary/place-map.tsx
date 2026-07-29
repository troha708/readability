"use client";

/**
 * "Show on map" for a dictionary article that names an atlas place. A collapsed
 * control that, when opened, drops down the shared PlacesMap with the looked-up
 * place centred and circled (like the atlas ?place= deep link) among the Bible's
 * most-mentioned places, with links out to the full atlas and the sources.
 */
import { useEffect, useRef, useState } from "react";
import {
  PlacesMap,
  placeKey,
  type MapPlaceBase,
  type PlacesMapApi,
} from "@/components/places-map";
import { openBiblePlaceUrl, placeSlug, type AtlasPlace } from "@/lib/content/places";

export function DictPlaceMap({
  place,
  places,
}: {
  place: AtlasPlace;
  /** The looked-up place plus the Bible's most-mentioned places, for context. */
  places: MapPlaceBase[];
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const apiRef = useRef<PlacesMapApi | null>(null);
  const slug = placeSlug(place.link);
  const atlasHref = `/try/bible/map?place=${encodeURIComponent(slug)}`;
  const targetKey = placeKey(place);

  // Reset the focus gate whenever the map is closed so re-opening re-focuses.
  useEffect(() => {
    if (!open) setReady(false);
  }, [open]);

  // After the map's first fit (onReady), select + zoom to the looked-up place:
  // this both circles it and centres it, matching the atlas's ?place= view.
  useEffect(() => {
    if (open && ready) apiRef.current?.focusKey(targetKey);
  }, [open, ready, targetKey]);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-amber-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-amber-400"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {open ? "Hide map" : "Show on map"}
      </button>

      {open && (
        <div className="mt-3">
          <PlacesMap
            places={places}
            fitKey={`dict|${targetKey}`}
            apiRef={apiRef}
            onReady={() => setReady(true)}
            expandHref={atlasHref}
            className="h-[min(46vh,380px)] w-full rounded-xl border border-neutral-200 dark:border-neutral-700"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
            {place.uncertain
              ? `Location uncertain${place.modern ? ` — possibly near modern ${place.modern}` : ""}. `
              : place.modern
                ? `Near modern ${place.modern}. `
                : ""}
            <a
              href={openBiblePlaceUrl(place.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
            >
              Sources ↗
            </a>
            {" · "}
            <a
              href={atlasHref}
              target="_blank"
              rel="noopener"
              className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
            >
              Full atlas ↗
            </a>{" "}
            · Place data from OpenBible.info (CC BY 4.0); basemap Natural Earth
            (public domain), terrain GMRT.
          </p>
        </div>
      )}
    </div>
  );
}
