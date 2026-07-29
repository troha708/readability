/**
 * Pure map-view math and basemap plumbing shared by the interactive map
 * (components/places-map.tsx) and the server-rendered share image
 * (/api/map-og). Keeping the numbers in one place means a shared atlas URL,
 * its embed, and its link-preview image all frame the same view.
 */

export type Basemap = {
  v: number;
  grid: [number, number];
  /** [west, south, east, north] in degrees. */
  extent: [number, number, number, number];
  land: number[][];
  /** Hypsometric tint bands (lowest first), stacked over the land fill. */
  relief?: number[][][];
  lakes: number[][];
  rivers: number[][];
  labels: [string, number, number, number, number][];
};

/** Zoom ceiling (px per grid unit). */
export const MAX_K = 3;

export function layerPath(layer: number[][], close: boolean): string {
  let d = "";
  for (const flat of layer) {
    for (let i = 0; i < flat.length; i += 2) {
      d += `${i === 0 ? "M" : "L"}${flat[i]} ${flat[i + 1]}`;
    }
    if (close) d += "Z";
  }
  return d;
}

/**
 * Frame a place set in a w×h viewport: zoom + world-space center (null when
 * there are no places — callers fall back to the whole basemap). A single
 * location (or one tight cluster) gets wide regional context — at ~1500 grid
 * units (≈670 km) across, rivers and coastlines are in frame, so a genealogy
 * chapter whose only place is Babylon still reads as a map rather than a
 * blank panel. Sets with real geographic spread keep a snug fit.
 */
export function fitCenter(
  w: number,
  h: number,
  points: { x: number; y: number }[],
): { k: number; cx: number; cy: number } | null {
  if (points.length === 0 || w === 0 || h === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 48;
  const spread = Math.max(maxX - minX, maxY - minY);
  const minSpan = spread < 50 ? 1500 : 250;
  const spanX = Math.max(maxX - minX, minSpan);
  const spanY = Math.max(maxY - minY, minSpan * (h / w));
  const k = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  return { k, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * The zoom a place selection lands at: a third of the way back — in zoom
 * steps, hence the cube root — from the old landing (the ~270 km regional
 * frame, or the current zoom when the user is already deeper) toward the
 * fully zoomed-out fit. From a wide start (deep links, the dictionary map,
 * a default-view search) that lands at a ~460 km frame; landing closer
 * read as context-free in testing (2026-07-22).
 */
export function landingK(cur: number, w: number, kFit: number): number {
  const from = Math.max(cur, w / 600);
  return Math.min(MAX_K, Math.cbrt(from * from * kFit));
}
