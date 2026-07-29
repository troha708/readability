"use client";

/**
 * The shared vector map core: a self-hosted SVG basemap (Natural Earth,
 * public domain, pre-projected to an integer Web Mercator grid at build
 * time) with place markers from the OpenBible.info geocoding dataset.
 * Used by the reader's chapter-map sheet and the full-screen atlas page.
 *
 * Owns all view math — fit, pan, wheel/pinch zoom, marker clustering with
 * count badges, greedy label collision hiding — and marker selection.
 * Selection is reported to the parent as the selected cluster's member
 * places (it changes when zooming merges or splits clusters); the parent
 * renders whatever detail card fits its layout.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlaceKind } from "@/lib/content/places";
import { MAX_K, fitCenter, landingK, layerPath, type Basemap } from "@/lib/map-view";

let basemapPromise: Promise<Basemap | null> | null = null;

function loadBasemap(): Promise<Basemap | null> {
  if (!basemapPromise) {
    basemapPromise = fetch("/maps/basemap.json")
      .then((res) => (res.ok ? (res.json() as Promise<Basemap>) : null))
      .catch(() => null)
      .then((bm) => {
        // Only cache success — a connectivity blip shouldn't disable the
        // map for the rest of the session.
        if (!bm) basemapPromise = null;
        return bm;
      });
  }
  return basemapPromise;
}

type View = { k: number; tx: number; ty: number };

/** What a place must carry to be plotted; parents may pass richer objects. */
export type MapPlaceBase = {
  name: string;
  x: number;
  y: number;
  kind: PlaceKind;
  uncertain: boolean;
  /** Label priority when labels collide (e.g. verse or reference count). */
  weight?: number;
  /** Journey-stop sequence number — renders as a numbered marker. */
  seq?: number;
};

/** Stable identity for selection across zoom-driven recluster. */
export function placeKey(p: MapPlaceBase): string {
  return `${p.name}|${p.x}|${p.y}`;
}

export type PlacesMapApi = {
  /** Select a place by key and zoom the view to it (null clears). */
  focusKey: (key: string | null) => void;
  /** Refit the view to the current place set. */
  fit: () => void;
  /** Jump to a world-space center at zoom k (restoring a shared ?x=&y=&k=). */
  setView: (x: number, y: number, k: number) => void;
  /** Select a place without moving the view. */
  selectKey: (key: string | null) => void;
};

type Cluster<T> = { x: number; y: number; members: T[] };

const CLUSTER_RADIUS_PX = 16;
// A region/natural feature whose point sits within this many grid units of a
// settlement (~1 km) is "anchored on" it — OpenBible gives regions a single
// representative point that is usually the capital, so Assyria lands exactly
// on Nineveh. Kept tight so a feature merely NEAR a town (Galilee by Tiberias,
// Mount Tabor by Daberath) is not treated as anchored.
const ANCHOR_DIST = 3;
// Past this zoom (viewport roughly ≤ 300 km across) an anchored feature yields
// its label to the settlement it sits on: the region names the area when
// zoomed out, but on top of its capital's dot it is redundant up close.
const HANDOFF_REL_SCALE = 24;
const KM_PER_DEGREE = 111.32;
const MILES_PER_KM = 0.621371;

function mercatorY(latDeg: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
}

/** Longest 1/2/5×10ⁿ distance whose bar fits in maxPx. */
function niceBar(unitsPerPx: number, maxPx: number): { d: number; px: number } {
  const raw = unitsPerPx * maxPx;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const d = [5, 2, 1].map((m) => m * pow).find((v) => v <= raw) ?? pow;
  return { d, px: d / unitsPerPx };
}

/**
 * Regions and natural features read as italic labels sitting on the land —
 * the way a printed atlas writes "Plain of Sharon" or "Galilee" across an
 * area rather than pinning it with a dot — while settlements keep their
 * marker. Journey stops keep their numbered marker regardless.
 */
function isFeaturePlace(p: MapPlaceBase): boolean {
  return p.seq == null && (p.kind === 2 || p.kind === 3);
}

/** Greedy screen-space clustering; members keep their input order. */
function clusterPlaces<T extends MapPlaceBase>(places: T[], k: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  for (const p of places) {
    const hit = clusters.find(
      (c) => Math.hypot(c.x - p.x, c.y - p.y) * k < CLUSTER_RADIUS_PX,
    );
    if (hit) {
      // Re-center on the running mean so chains don't drift.
      hit.x = (hit.x * hit.members.length + p.x) / (hit.members.length + 1);
      hit.y = (hit.y * hit.members.length + p.y) / (hit.members.length + 1);
      hit.members.push(p);
    } else {
      clusters.push({ x: p.x, y: p.y, members: [p] });
    }
  }
  return clusters;
}

export function PlacesMap<T extends MapPlaceBase>({
  places,
  fitKey,
  onSelectionChange,
  onViewChange,
  onReady,
  apiRef,
  expandHref,
  declutter = false,
  route,
  controls = true,
  className = "",
  hintClassName = "left-2 top-2",
}: {
  places: T[];
  /** Refit (and clear selection) whenever this changes. */
  fitKey: string;
  onSelectionChange?: (members: T[] | null) => void;
  /** Reports each settled view as world-space center + zoom. `user` marks
   *  deliberate framings (pan/zoom gestures, a restored shared view) that a
   *  share URL should carry; `auto` marks programmatic fits and place
   *  landings, which reproduce from ?place=/?journey=/?book= alone. */
  onViewChange?: (
    center: { x: number; y: number; k: number },
    kind: "user" | "auto",
  ) => void;
  /** Fires once, after the first real fit (basemap loaded, viewport
   *  measured). focusKey calls made before this are wiped by that fit. */
  onReady?: () => void;
  apiRef?: { current: PlacesMapApi | null };
  /** Optional link rendered under the zoom controls (sheet → atlas page). */
  expandHref?: string;
  /** Journey route as flat world coords [x0,y0,x1,y1,...] — drawn as a
   *  dashed approximate line through the stops, under the markers. */
  route?: number[];
  /** Zoom-dependent prominence filtering: at low zoom only the
   *  highest-weight places in each neighborhood render, and more appear as
   *  the user zooms in (the atlas's 1,180 places would otherwise wall the
   *  Levant with markers). Hidden places stay searchable — a selected place
   *  is always shown. */
  declutter?: boolean;
  /** False hides the zoom/fit controls and the declutter hint — the embed
   *  view is a non-interactive preview. */
  controls?: boolean;
  /** Sizing/border classes for the map container. */
  className?: string;
  /** Position classes for the declutter hint — a caller whose own UI floats
   *  over the map's top-left corner (the atlas's search box) moves it. */
  hintClassName?: string;
}) {
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [view, setView] = useState<View | null>(null);
  // Selection is a stable place identity, not a cluster index — zooming
  // merges/splits clusters and reorders them under the user.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const readyNotified = useRef(false);
  // What caused the next view change — set at each setView call site, read
  // by the report effect below (state updates are functional, so the cause
  // can't ride along with the value itself).
  const viewKind = useRef<"user" | "auto">("auto");

  useEffect(() => {
    let cancelled = false;
    loadBasemap().then((bm) => {
      if (cancelled) return;
      if (bm) setBasemap(bm);
      else setBasemapFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track the map viewport's pixel size (phone vs desktop, sheet vs page).
  useLayoutEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paths = useMemo(
    () =>
      basemap && {
        land: layerPath(basemap.land, true),
        relief: (basemap.relief ?? []).map((band) => layerPath(band, true)),
        lakes: layerPath(basemap.lakes, true),
        rivers: layerPath(basemap.rivers, false),
      },
    [basemap],
  );

  // Journey route: gentle quadratic arcs between consecutive stops — the
  // bow reads as "approximate path", deliberately not a surveyed line.
  const routePath = useMemo(() => {
    if (!route || route.length < 4) return null;
    let d = `M${route[0]} ${route[1]}`;
    for (let i = 2; i < route.length; i += 2) {
      const x0 = route[i - 2], y0 = route[i - 1];
      const x1 = route[i], y1 = route[i + 1];
      const cx = (x0 + x1) / 2 - (y1 - y0) * 0.15;
      const cy = (y0 + y1) / 2 + (x1 - x0) * 0.15;
      d += `Q${Math.round(cx)} ${Math.round(cy)} ${x1} ${y1}`;
    }
    return d;
  }, [route]);

  // Hypsometric tints, lowest band first — kept subtle so markers and
  // labels stay dominant. The first two bands are BELOW sea level (≤0,
  // ≤−200 m), tinted darker than the base land so the rift valley reads
  // sunken, deepening toward the Dead Sea; the rest lighten with
  // elevation. The depression tints lean warm/brown so they cannot be
  // mistaken for the blue-dark water fill beside the Dead Sea. (The map
  // always renders its dark palette — see the `dark` class on the
  // container — the light values are kept for coherence.)
  const RELIEF_FILLS = [
    "fill-[#e9e4d0] dark:fill-[#1e1b17]",
    "fill-[#dfd8c0] dark:fill-[#1a1612]",
    "fill-[#f1e9d8] dark:fill-[#292624]",
    "fill-[#e6d9bf] dark:fill-[#302b26]",
    "fill-[#d9c7a4] dark:fill-[#393228]",
    "fill-[#cbb489] dark:fill-[#453c2c]",
  ];
  // Relief is clipped to the land shape: the depression bands come from
  // elevation data alone, and any water body landlocked at the DEM's
  // resolution (Sea of Marmara, Gulf of Corinth, the Venice lagoon...)
  // would otherwise take a "sunken land" tint. Clipping makes sea areas
  // ineligible for terrain by construction.
  const landClipId = useId();

  /** Scale at which the whole basemap fits the viewport. */
  const kFitMap = useMemo(() => {
    if (!basemap || size.w === 0 || size.h === 0) return 0;
    return Math.min(size.w / basemap.grid[0], size.h / basemap.grid[1]);
  }, [basemap, size]);

  function clampView(v: View): View {
    if (!basemap) return v;
    const [W, H] = basemap.grid;
    const k = Math.min(Math.max(v.k, kFitMap), MAX_K);
    const clampAxis = (t: number, span: number, world: number) =>
      world * k <= span
        ? (span - world * k) / 2
        : Math.min(0, Math.max(span - world * k, t));
    return {
      k,
      tx: clampAxis(v.tx, size.w, W),
      ty: clampAxis(v.ty, size.h, H),
    };
  }

  /** Fit the current place set (falling back to the whole basemap). The
   *  framing itself lives in lib/map-view so the share image matches it. */
  function fitView(): View | null {
    if (!basemap || size.w === 0 || kFitMap === 0) return null;
    const f = fitCenter(size.w, size.h, places);
    if (!f) return clampView({ k: kFitMap, tx: 0, ty: 0 });
    return clampView({
      k: f.k,
      tx: size.w / 2 - f.cx * f.k,
      ty: size.h / 2 - f.cy * f.k,
    });
  }

  // Report each settled view upward (the atlas mirrors it into the URL).
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  useEffect(() => {
    if (!view || size.w === 0) return;
    onViewChangeRef.current?.(
      {
        x: Math.round((size.w / 2 - view.tx) / view.k),
        y: Math.round((size.h / 2 - view.ty) / view.k),
        k: view.k,
      },
      viewKind.current,
    );
  }, [view, size]);

  // Initial fit once basemap + size are known, and refit when the parent
  // swaps the place set (fitKey).
  useEffect(() => {
    viewKind.current = "auto";
    const v = fitView();
    if (v) setView(v);
    setSelectedKey(null);
    if (v && !readyNotified.current) {
      // First real fit: basemap and viewport size are in. Callers that want
      // to focus a place on load (the atlas's ?place= deep link) must wait
      // for this — an earlier focusKey would be wiped by this very refit.
      readyNotified.current = true;
      onReady?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, kFitMap, fitKey]);

  // Wheel zoom needs a non-passive listener; React's onWheel can't preventDefault.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - rect.left, e.clientY - rect.top);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, kFitMap, size]);

  // All view changes go through functional updates: pointer events can be
  // coalesced within a frame (two pinch fingers, fast pans), and computing
  // from a snapshot would drop every other finger's contribution.
  function zoomAt(factor: number, px: number, py: number, pan?: { dx: number; dy: number }) {
    viewKind.current = "user";
    setView((v) => {
      if (!v) return v;
      const tx = v.tx + (pan?.dx ?? 0);
      const ty = v.ty + (pan?.dy ?? 0);
      const k = Math.min(Math.max(v.k * factor, kFitMap), MAX_K);
      const scale = k / v.k;
      return clampView({
        k,
        tx: px - (px - tx) * scale,
        ty: py - (py - ty) * scale,
      });
    });
  }

  function focusKey(key: string | null) {
    setSelectedKey(key);
    if (!key) return;
    const p = places.find((pp) => placeKey(pp) === key);
    if (!p || size.w === 0 || kFitMap === 0) return;
    viewKind.current = "auto";
    setView((v) => {
      // Landing zoom lives in lib/map-view (landingK) so the share image
      // lands where the page does.
      const k = landingK(v?.k ?? kFitMap, size.w, kFitMap);
      return clampView({ k, tx: size.w / 2 - p.x * k, ty: size.h / 2 - p.y * k });
    });
  }

  // Imperative surface for the parent (search → focus a place, restore a
  // shared view).
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      focusKey,
      fit: () => {
        viewKind.current = "auto";
        const v = fitView();
        if (v) setView(v);
      },
      setView: (x, y, k) => {
        if (size.w === 0 || kFitMap === 0) return;
        viewKind.current = "user";
        setView(clampView({ k, tx: size.w / 2 - x * k, ty: size.h / 2 - y * k }));
      },
      selectKey: (key) => setSelectedKey(key),
    };
    return () => {
      apiRef.current = null;
    };
  });

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };

    if (pointers.current.size === 2) {
      // Pinch: scale by the change in pointer distance, and pan by the
      // midpoint's movement (the standard two-finger map gesture does both).
      const [a, b] = [...pointers.current.entries()];
      const other = a[0] === e.pointerId ? b[1] : a[1];
      const rect = mapRef.current!.getBoundingClientRect();
      const distPrev = Math.hypot(prev.x - other.x, prev.y - other.y);
      const distCur = Math.hypot(cur.x - other.x, cur.y - other.y);
      if (distPrev > 0) {
        const mx = (cur.x + other.x) / 2 - rect.left;
        const my = (cur.y + other.y) / 2 - rect.top;
        zoomAt(distCur / distPrev, mx, my, {
          dx: (cur.x - prev.x) / 2,
          dy: (cur.y - prev.y) / 2,
        });
      }
      dragged.current = true;
    } else if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
      viewKind.current = "user";
      setView((v) => (v ? clampView({ k: v.k, tx: v.tx + dx, ty: v.ty + dy }) : v));
    }
    pointers.current.set(e.pointerId, cur);
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
  }

  // ── Prominence filter (atlas declutter) ─────────────────────────────
  // Greedy by weight: a place renders only if no heavier place is within
  // DECLUTTER_RADIUS_PX at the current zoom. World-space distances × k are
  // pan-invariant, and k is bucketed (~3 steps per doubling) so the O(n²)
  // pass runs a handful of times per zoom gesture, not per frame.
  const kBucket = view ? Math.round(Math.log2(view.k) * 3) : 0;
  const hasView = view !== null;

  // Features (region/natural) whose point sits on a settlement in the CURRENT
  // set. Computed against the passed places, so it respects the kind filters:
  // hide settlements (regions-only) and nothing is anchored, so regions keep
  // their labels at every zoom.
  const anchoredKeys = useMemo(() => {
    const set = new Set<string>();
    const settlements = places.filter((p) => p.kind === 0 && p.seq == null);
    if (settlements.length === 0) return set;
    const d2 = ANCHOR_DIST * ANCHOR_DIST;
    for (const p of places) {
      if (!isFeaturePlace(p)) continue;
      for (const s of settlements) {
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        if (dx * dx + dy * dy <= d2) {
          set.add(placeKey(p));
          break;
        }
      }
    }
    return set;
  }, [places]);

  // A boolean (not raw view.k) so the O(n²) pass below only re-runs when the
  // handoff actually toggles, not every zoom frame.
  const handoffActive =
    declutter && view !== null && kFitMap > 0 && view.k / kFitMap >= HANDOFF_REL_SCALE;

  const declutterResult = useMemo(() => {
    if (!declutter || !hasView) return { list: places, hidden: 0 };
    // Zoom handoff: drop anchored features so the settlement they sit on takes
    // over (a selected feature stays — search must always reach its target).
    const base = handoffActive
      ? places.filter(
          (p) =>
            !(isFeaturePlace(p) && anchoredKeys.has(placeKey(p)) && placeKey(p) !== selectedKey),
        )
      : places;
    const k = Math.pow(2, kBucket / 3);
    const R = 26;
    const byPriority = base
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (b.p.weight ?? 0) - (a.p.weight ?? 0) || a.i - b.i);
    const keptIdx = new Set<number>();
    const kept: MapPlaceBase[] = [];
    for (const { p, i } of byPriority) {
      if (
        placeKey(p) === selectedKey ||
        !kept.some((q) => {
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          // Suppress only what deeper zoom will actually draw as its own
          // marker (clear of suppression at MAX_K). Everything else falls
          // through: truly co-located places (Nineveh at Assyria's anchor)
          // live in cluster badges, and at maximum zoom nothing is
          // suppressed — so the "zoom in" hint can never lie.
          return d * k < R && d * MAX_K >= R;
        })
      ) {
        keptIdx.add(i);
        kept.push(p);
      }
    }
    const list = base.filter((_, i) => keptIdx.has(i));
    // hidden counts only declutter-suppressed places (revealed by zoom); the
    // handed-off features are gone from `base`, so the "zoom in" hint stays
    // honest — zooming in never brings them back.
    return { list, hidden: base.length - list.length };
  }, [places, declutter, hasView, kBucket, selectedKey, handoffActive, anchoredKeys]);
  const visiblePlaces = declutterResult.list;
  const hiddenCount = declutterResult.hidden;

  // ── Clusters + greedy label placement (screen space) ────────────────
  const clusters = useMemo(
    () => (view ? clusterPlaces(visiblePlaces, view.k) : []),
    [visiblePlaces, view],
  );

  const selected =
    selectedKey === null
      ? null
      : (() => {
          const i = clusters.findIndex((c) =>
            c.members.some((m) => placeKey(m) === selectedKey),
          );
          return i === -1 ? null : i;
        })();

  // Report selection (and its zoom-driven membership changes) upward.
  const selectedCluster = selected !== null ? clusters[selected] : null;
  const selectionSig = selectedCluster
    ? selectedCluster.members.map(placeKey).join("")
    : "";
  const selectionRef = useRef(onSelectionChange);
  selectionRef.current = onSelectionChange;
  const membersRef = useRef<T[] | null>(null);
  membersRef.current = selectedCluster?.members ?? null;
  useEffect(() => {
    selectionRef.current?.(membersRef.current);
  }, [selectionSig]);

  const { visible: labeled, small: smallLabels } = useMemo(() => {
    if (!view)
      return { visible: new Set<number>(), small: new Map<number, { dx: number; dy: number }>() };
    const order = clusters
      .map((c, i) => ({ c, i }))
      .sort(
        (a, b) =>
          b.c.members.length - a.c.members.length ||
          // A feature's label IS its marker, so it claims label space ahead
          // of a settlement (which keeps its dot when its label is dropped).
          (isFeaturePlace(a.c.members[0]) ? 0 : 1) -
            (isFeaturePlace(b.c.members[0]) ? 0 : 1) ||
          (b.c.members[0].weight ?? 0) - (a.c.members[0].weight ?? 0) ||
          a.c.members[0].name.localeCompare(b.c.members[0].name),
      );
    type Box = { x: number; y: number; w: number; h: number };
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const boxes: Box[] = [];
    const visible = new Set<number>();
    const small = new Map<number, { dx: number; dy: number }>();
    // Fallback placements for a feature label that lost collision: same spot
    // first, then nudged off the anchor — a region's point is representative,
    // so a few px of drift reads fine and beats a bare ring.
    const NUDGES = [
      [0, 0], [0, -9], [0, 9], [-12, 0], [12, 0], [-9, -9], [9, -9], [-9, 9], [9, 9],
    ];
    for (const { c, i } of order) {
      if (i === selected) {
        visible.add(i); // the selected place is always labeled
      }
      const sx = c.x * view.k + view.tx;
      const sy = c.y * view.k + view.ty;
      if (sx < -40 || sx > size.w + 40 || sy < -20 || sy > size.h + 20) continue;
      const text =
        c.members.length > 1 ? `${c.members[0].name} +${c.members.length - 1}` : c.members[0].name;
      const w = text.length * 6.6 + 4;
      // Feature labels sit centered on the point; ordinary labels are offset
      // to the right of the dot — collision boxes must match each geometry.
      const asLabel = c.members.length === 1 && isFeaturePlace(c.members[0]);
      const box = asLabel
        ? { x: sx - w / 2, y: sy - 7, w, h: 14 }
        : { x: sx + 7, y: sy - 7, w, h: 14 };
      if (!visible.has(i)) {
        if (boxes.some((b) => overlaps(box, b))) {
          // A feature's label IS its marker, and a bare ring names nothing —
          // so before giving it up, retry smaller and slightly displaced,
          // testing an inset box so a few px of overlap is tolerated.
          if (asLabel) {
            const sw = text.length * 5.4 + 4;
            for (const [dx, dy] of NUDGES) {
              const sbox = { x: sx + dx - sw / 2, y: sy + dy - 6, w: sw, h: 12 };
              const inset = { x: sbox.x + 2, y: sbox.y + 2, w: sbox.w - 4, h: sbox.h - 4 };
              if (!boxes.some((b) => overlaps(inset, b))) {
                visible.add(i);
                small.set(i, { dx, dy });
                boxes.push(sbox);
                break;
              }
            }
          }
          continue;
        }
        visible.add(i);
      }
      boxes.push(box);
    }
    return { visible, small };
  }, [clusters, view, size, selected]);

  const relScale = view && kFitMap > 0 ? view.k / kFitMap : 1;

  // Scale bar, computed at the viewport's center latitude (Mercator scale
  // varies north–south; the center is the mapping convention).
  let scaleBar: { km: number; kmPx: number; mi: number; miPx: number } | null = null;
  if (basemap && view && size.h > 0) {
    const [west, south, east, north] = basemap.extent;
    const lonPerUnit = (east - west) / basemap.grid[0];
    const mercN = mercatorY(north);
    const mercPerUnit = (mercN - mercatorY(south)) / basemap.grid[1];
    const centerYUnits = (size.h / 2 - view.ty) / view.k;
    const centerLat =
      2 * Math.atan(Math.exp(mercN - centerYUnits * mercPerUnit)) - Math.PI / 2;
    const kmPerPx = (lonPerUnit * KM_PER_DEGREE * Math.cos(centerLat)) / view.k;
    const km = niceBar(kmPerPx, 110);
    const mi = niceBar(kmPerPx * MILES_PER_KM, 110);
    scaleBar = { km: km.d, kmPx: km.px, mi: mi.d, miPx: mi.px };
  }

  // A lone region/natural feature draws as a centered italic label instead
  // of a glyph — but only when its label wins collision; otherwise it falls
  // back to its glyph below, so a feature never disappears in a dense view.
  function rendersAsLabel(c: Cluster<T>, i: number): boolean {
    return c.members.length === 1 && isFeaturePlace(c.members[0]) && labeled.has(i);
  }

  function markerGlyph(c: Cluster<T>, i: number) {
    const isSelected = i === selected;
    const sx = c.x * view!.k + view!.tx;
    const sy = c.y * view!.k + view!.ty;
    if (sx < -30 || sx > size.w + 30 || sy < -30 || sy > size.h + 30) return null;
    const first = c.members[0];
    const many = c.members.length > 1;
    const uncertain = !many && first.uncertain;

    if (rendersAsLabel(c, i)) {
      const nudge = smallLabels.get(i);
      const smallLbl = nudge !== undefined;
      return (
        <g
          key={i}
          transform={`translate(${sx + (nudge?.dx ?? 0)} ${sy + (nudge?.dy ?? 0)})`}
          role="button"
          tabIndex={0}
          aria-label={`${first.name}${uncertain ? " (location uncertain)" : ""}`}
          className="cursor-pointer focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            // A drag that began on this marker retargets its click here
            // (pointer capture); it was a pan, not a toggle.
            if (dragged.current) return;
            setSelectedKey(isSelected ? null : placeKey(first));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelectedKey(isSelected ? null : placeKey(first));
            }
          }}
        >
          {/* Warm stone + letter-spacing distinguishes an interactive land
              feature from the inert blue-grey sea/river labels; the white
              halo keeps it legible over relief tints. */}
          <text
            textAnchor="middle"
            dy={smallLbl ? "3" : "3.6"}
            paintOrder="stroke"
            strokeWidth={smallLbl ? "2.5" : "3"}
            className={`${smallLbl ? "text-[9.5px]" : "text-[11px]"} font-medium italic tracking-wide stroke-white dark:stroke-neutral-900 ${
              isSelected
                ? "fill-amber-700 underline dark:fill-amber-300"
                : "fill-stone-600 hover:fill-amber-700 dark:fill-stone-300 dark:hover:fill-amber-300"
            }`}
          >
            {first.name}
          </text>
        </g>
      );
    }
    // A cluster is named after the member the user cares about: the one
    // they selected/searched, else the most-referenced ("Jerusalem +11",
    // never "Ammon +11" just because Ammon sorts first).
    const heaviest = c.members.reduce(
      (a, b) => ((b.weight ?? 0) > (a.weight ?? 0) ? b : a),
      first,
    );
    const named =
      (isSelected && c.members.find((m) => placeKey(m) === selectedKey)) || heaviest;
    const label = many ? `${named.name} +${c.members.length - 1}` : named.name;

    return (
      <g
        key={i}
        transform={`translate(${sx} ${sy})`}
        role="button"
        tabIndex={0}
        aria-label={
          many
            ? `${c.members.length} places near ${named.name}`
            : `${named.name}${uncertain ? " (location uncertain)" : ""}`
        }
        className="cursor-pointer focus:outline-none"
        onClick={(e) => {
          e.stopPropagation();
          // A drag that began on this marker retargets its click here
          // (pointer capture); it was a pan, not a toggle.
          if (dragged.current) return;
          setSelectedKey(isSelected ? null : placeKey(first));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedKey(isSelected ? null : placeKey(first));
          }
        }}
      >
        {/* generous invisible hit area for touch */}
        <circle r="13" fill="transparent" />
        {isSelected && (
          <circle
            r={many ? 12.5 : 8.5}
            className="fill-amber-500/25 stroke-amber-600 dark:stroke-amber-400"
            strokeWidth="1"
          />
        )}
        {many ? (
          <>
            <circle
              r="8.5"
              className="fill-amber-600 stroke-white dark:fill-amber-500 dark:stroke-neutral-900"
              strokeWidth="1.5"
            />
            <text
              textAnchor="middle"
              dy="3"
              className="pointer-events-none fill-white text-[9px] font-bold dark:fill-neutral-950"
            >
              {c.members.length}
            </text>
          </>
        ) : first.seq != null ? (
          // Journey stop: numbered square, distinct from round cluster badges
          <>
            <rect
              x="-8"
              y="-8"
              width="16"
              height="16"
              rx="4"
              className="fill-amber-600 stroke-white dark:fill-amber-500 dark:stroke-neutral-900"
              strokeWidth="1.5"
            />
            <text
              textAnchor="middle"
              dy="3"
              className="pointer-events-none fill-white text-[9px] font-bold dark:fill-neutral-950"
            >
              {first.seq}
            </text>
          </>
        ) : first.kind === 2 ? (
          <circle
            r="5"
            fill="none"
            strokeWidth="1.8"
            className={`stroke-amber-600 dark:stroke-amber-400 ${uncertain ? "opacity-75" : ""}`}
          />
        ) : first.kind === 3 ? (
          <path
            d="M0 -5.2 L5 3.8 L-5 3.8 Z"
            strokeWidth="1.2"
            className={`fill-amber-700 stroke-white dark:fill-amber-500 dark:stroke-neutral-900 ${uncertain ? "opacity-75" : ""}`}
          />
        ) : (
          <circle
            r="4.4"
            strokeWidth="1.4"
            className={`stroke-white dark:stroke-neutral-900 ${
              first.kind === 1
                ? "fill-[#4e7d99] dark:fill-[#7fa9c4]"
                : "fill-amber-600 dark:fill-amber-400"
            } ${uncertain ? "opacity-75" : ""}`}
          />
        )}
        {uncertain && (
          <circle
            r="7.5"
            fill="none"
            strokeWidth="1"
            strokeDasharray="2 2.5"
            className="stroke-amber-700/70 dark:stroke-amber-400/70"
          />
        )}
        {labeled.has(i) && (
          <text
            x="8"
            dy="3.5"
            paintOrder="stroke"
            strokeWidth="2.5"
            // Not clickable: a long label ("Corinth +1") can lie across a
            // neighbor's dot and would steal its taps.
            className="pointer-events-none fill-neutral-800 stroke-white text-[11px] font-medium dark:fill-neutral-100 dark:stroke-neutral-900"
          >
            {label}
          </text>
        )}
      </g>
    );
  }

  return (
    <div
      ref={mapRef}
      // `dark` here is deliberate: Tailwind's class-based dark variant is
      // ancestor-scoped, so the map always renders its dark palette in both
      // app themes — one atlas look everywhere (settled 2026-07-19).
      className={`dark relative touch-none select-none overflow-hidden ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={() => {
        if (!dragged.current) setSelectedKey(null);
      }}
    >
      {basemapFailed ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral-400">
          Map unavailable offline.
        </div>
      ) : !basemap || !view || !paths ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
        </div>
      ) : (
        <svg width={size.w} height={size.h} className="block bg-[#d9e4ec] dark:bg-[#101820]">
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <path
              d={paths.land}
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
              strokeWidth="1"
              className="fill-[#faf7f2] stroke-[#b0c2ce] dark:fill-[#232323] dark:stroke-[#3e4a54]"
            />
            <defs>
              <clipPath id={landClipId}>
                <path d={paths.land} clipRule="evenodd" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${landClipId})`}>
              {paths.relief.map((d, i) => (
                <path key={i} d={d} fillRule="evenodd" className={RELIEF_FILLS[i] ?? RELIEF_FILLS[RELIEF_FILLS.length - 1]} />
              ))}
            </g>
            <path
              d={paths.rivers}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth="1"
              className="stroke-[#a9c3d5] dark:stroke-[#33475a]"
            />
            <path
              d={paths.lakes}
              vectorEffect="non-scaling-stroke"
              strokeWidth="1"
              className="fill-[#d9e4ec] stroke-[#b0c2ce] dark:fill-[#101820] dark:stroke-[#3e4a54]"
            />
            {routePath && (
              <path
                d={routePath}
                data-testid="journey-route"
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth="1.6"
                strokeDasharray="7 5"
                strokeLinecap="round"
                className="stroke-amber-600/70 dark:stroke-amber-400/60"
              />
            )}
          </g>

          {/* Sea and river names (screen-space, zoom-gated) */}
          <g aria-hidden>
            {basemap.labels
              .filter(([, , , , minScale]) => relScale >= minScale)
              .map(([text, x, y, kind]) => (
                <text
                  key={text}
                  x={x * view.k + view.tx}
                  y={y * view.k + view.ty}
                  textAnchor="middle"
                  className={`pointer-events-none italic ${
                    kind === 1 ? "text-[10px]" : "text-[11px]"
                  } fill-[#7f99ab] dark:fill-[#4e6678]`}
                >
                  {text}
                </text>
              ))}
          </g>

          {/* Feature labels first (underneath), so an overlapping settlement
              dot in the pass below wins the tap — a long label must not steal
              a neighbor's click. */}
          <g>{clusters.map((c, i) => (rendersAsLabel(c, i) ? markerGlyph(c, i) : null))}</g>
          {/* Point markers */}
          <g>{clusters.map((c, i) => (rendersAsLabel(c, i) ? null : markerGlyph(c, i)))}</g>
        </svg>
      )}

      {/* Zoom controls */}
      {controls && view && (
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white/95 shadow-sm dark:border-neutral-600 dark:bg-neutral-800/95">
          {[
            { label: <>+</>, title: "Zoom in", fn: () => zoomAt(1.6, size.w / 2, size.h / 2) },
            { label: <>−</>, title: "Zoom out", fn: () => zoomAt(1 / 1.6, size.w / 2, size.h / 2) },
            {
              // frame-corners "fit" icon — visually distinct from the
              // outward-arrows "open full map" link below it
              label: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 9V5a2 2 0 0 1 2-2h4" />
                  <path d="M15 3h4a2 2 0 0 1 2 2v4" />
                  <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
                  <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
                </svg>
              ),
              title: "Fit places",
              fn: () => { viewKind.current = "auto"; const v = fitView(); if (v) setView(v); },
            },
          ].map((b, i) => (
            <button
              key={b.title}
              onClick={(e) => {
                // don't bubble to the container's clear-selection click
                e.stopPropagation();
                b.fn();
              }}
              title={b.title}
              aria-label={b.title}
              className={`flex h-8 w-8 items-center justify-center text-base leading-none text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 ${
                i > 0 ? "border-t border-neutral-200 dark:border-neutral-600" : ""
              }`}
            >
              {b.label}
            </button>
          ))}
          {expandHref && (
            // New tab on purpose: the atlas shouldn't cost the reader their
            // place in the chapter.
            <a
              href={expandHref}
              target="_blank"
              rel="noopener"
              title="Open full atlas in a new tab"
              aria-label="Open full atlas in a new tab"
              onClick={(e) => e.stopPropagation()}
              className="flex h-8 w-8 items-center justify-center border-t border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Declutter hint */}
      {controls && hiddenCount > 0 && (
        <div className={`pointer-events-none absolute ${hintClassName} rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-neutral-500 dark:bg-neutral-900/80 dark:text-neutral-400`}>
          {hiddenCount} more place{hiddenCount === 1 ? "" : "s"} — zoom in
        </div>
      )}

      {/* Scale bar */}
      {scaleBar && (
        <div
          className="pointer-events-none absolute bottom-2 left-2 text-[10px] font-medium leading-none text-neutral-600 dark:text-neutral-300"
          role="img"
          aria-label={`Map scale: ${scaleBar.km} kilometers`}
        >
          <div
            style={{ width: scaleBar.kmPx }}
            className="border-b border-l border-r border-neutral-500/80 pb-0.5 pl-1 dark:border-neutral-300/80"
          >
            {scaleBar.km} km
          </div>
          <div
            style={{ width: scaleBar.miPx }}
            className="border-l border-r border-neutral-500/80 pl-1 pt-0.5 dark:border-neutral-300/80"
          >
            {scaleBar.mi} mi
          </div>
        </div>
      )}
    </div>
  );
}
