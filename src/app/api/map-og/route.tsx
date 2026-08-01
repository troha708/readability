import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import rawBasemap from "../../../../public/maps/basemap.json";
import { loadAtlasData } from "@/lib/content/atlas-server";
import { placeSlug, type AtlasRef } from "@/lib/content/places";
import { chapterReference } from "@/lib/bible-book-order";
import {
  MAX_K,
  fitCenter,
  landingK,
  layerPath,
  type Basemap,
} from "@/lib/map-view";

/**
 * Link-preview image for the atlas (og:image of /try/bible/map): the actual
 * map — terrain, markers, labels — rendered server-side at the URL's view,
 * so a pasted atlas link unfurls in Discord/Slack/iMessage showing the
 * selected places at the selected zoom. Takes the same params as the page:
 * ?place= / ?journey= / ?book=&chapter= pick the place set and framing,
 * ?x=&y=&k= (the client's mirrored view) pin the exact frame.
 *
 * Lives under /api because that's the tree the mobile static export hides;
 * robots.ts explicitly allows this one path so preview crawlers (which
 * honor robots.txt) can fetch it. The view math and framing heuristics are
 * shared with the interactive map via lib/map-view; colors are the map's
 * dark-palette values (the atlas always renders dark).
 */

const W = 1200;
const H = 630;
const basemap = rawBasemap as unknown as Basemap;

// places-map.tsx dark-palette equivalents (Tailwind classes → hex).
const RELIEF = ["#1e1b17", "#1a1612", "#292624", "#302b26", "#393228", "#453c2c"];
const SEA = "#101820";
const LAND = "#232323";
const COAST = "#3e4a54";
const RIVER = "#33475a";
const AMBER_400 = "#fbbf24"; // settlements, region rings, route
const AMBER_500 = "#f59e0b"; // natural features, journey stops
const WATER_DOT = "#7fa9c4";
const MARKER_EDGE = "#171717";

type Marker = {
  name: string;
  x: number;
  y: number;
  kind: number;
  uncertain: boolean;
  weight: number;
  seq?: number;
};

// Mirrors the page's mentionsOf: regular + soft tiers, gentilic excluded.
function mentionsOf(p: { refs: AtlasRef[]; softRefs?: AtlasRef[] }): number {
  const count = (refs: AtlasRef[]) => refs.reduce((n, [, , verses]) => n + verses.length, 0);
  return count(p.refs) + count(p.softRefs ?? []);
}

export async function GET(req: NextRequest) {
  try {
    return render(req);
  } catch {
    // Never break a link unfurl: fall back to a plain title card.
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: SEA,
            color: "#f5f5f4",
            fontSize: 48,
          }}
        >
          Bible Atlas — readability.bible
        </div>
      ),
      { width: W, height: H },
    );
  }
}

function render(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const atlas = loadAtlasData();

  // ── Resolve the place set, route, selection, and card title ─────────
  let markers: Marker[];
  let route: number[] | undefined;
  let selected: Marker | null = null;
  let title = "Bible Atlas";

  const journeyParam = sp.get("journey");
  const journey =
    journeyParam && /^\d+$/.test(journeyParam)
      ? atlas.journeys[Number(journeyParam)]
      : undefined;
  // ?min= — the page's Mentions filter; journeys ignore it, like the page.
  const minRaw = Number(sp.get("min"));
  // Default 0, matching the page's "All": gentilic-only places count 0.
  const min = minRaw === 3 || minRaw === 10 || minRaw === 50 ? minRaw : 0;

  if (journey) {
    const seen = new Set<string>();
    markers = [];
    journey.stops.forEach((s, i) => {
      const key = `${s.name}|${s.x}|${s.y}`;
      if (seen.has(key)) return; // return legs revisit cities — number once
      seen.add(key);
      markers.push({
        name: s.name,
        x: s.x,
        y: s.y,
        kind: 0,
        uncertain: false,
        weight: 1000 - i,
        seq: i + 1,
      });
    });
    route = journey.stops.flatMap((s) => [s.x, s.y]);
    title = journey.name;
  } else {
    const book = sp.get("book");
    const chapter = parseInt(sp.get("chapter") ?? "", 10);
    const bIdx = book ? atlas.books.indexOf(book) : -1;
    // Chapter presence spans all tiers — soft/gentilic-only places (Mount
    // Zaphon in Job 26, Gerasa in Mark 5) belong on the chapter's card too.
    const inChapter = (p: (typeof atlas.places)[number]) =>
      [...p.refs, ...p.softRefs, ...p.gentilicRefs].find(
        ([b, ch]) => b === bIdx && ch === chapter,
      );
    const focusPlaces =
      bIdx !== -1 && Number.isFinite(chapter)
        ? atlas.places.filter((p) => inChapter(p))
        : [];
    if (focusPlaces.length > 0) {
      markers = focusPlaces
        .filter((p) => mentionsOf(p) >= min)
        .map((p) => {
          const ref = inChapter(p);
          return { ...p, weight: ref ? ref[2].length : 1 };
        });
      title = `Places in ${chapterReference(atlas.books[bIdx], chapter)}`;
    } else {
      markers = atlas.places
        .filter((p) => mentionsOf(p) >= min)
        .map((p) => ({ ...p, weight: mentionsOf(p) }));
    }
    const placeParam = sp.get("place");
    if (placeParam) {
      const located = atlas.places.find((p) => placeSlug(p.link) === placeParam);
      if (located) {
        title = located.name;
        selected =
          markers.find((m) => m.x === located.x && m.y === located.y && m.name === located.name) ??
          null;
        if (!selected) {
          selected = { ...located, weight: mentionsOf(located) };
          markers.push(selected);
        }
      } else {
        const unloc = atlas.unlocated.find((p) => placeSlug(p.link) === placeParam);
        if (unloc) title = `${unloc.name} (location unknown)`;
      }
    }
  }

  // ── View: shared ?x=&y=&k= wins; otherwise frame like the page would ──
  const [GW, GH] = basemap.grid;
  const kFit = Math.min(W / GW, H / GH);
  const px = Number(sp.get("x"));
  const py = Number(sp.get("y"));
  const pk = Number(sp.get("k"));
  let k: number;
  let cx: number;
  let cy: number;
  if (Number.isFinite(px) && Number.isFinite(py) && pk > 0) {
    k = Math.min(Math.max(pk, kFit), MAX_K);
    cx = px;
    cy = py;
  } else if (selected) {
    k = landingK(kFit, W, kFit);
    cx = selected.x;
    cy = selected.y;
  } else {
    const f = fitCenter(W, H, markers);
    k = f ? Math.min(Math.max(f.k, kFit), MAX_K) : kFit;
    cx = f ? f.cx : GW / 2;
    cy = f ? f.cy : GH / 2;
  }
  const clampAxis = (t: number, span: number, world: number) =>
    world * k <= span
      ? (span - world * k) / 2
      : Math.min(0, Math.max(span - world * k, t));
  const tx = clampAxis(W / 2 - cx * k, W, GW);
  const ty = clampAxis(H / 2 - cy * k, H, GH);
  const sx = (m: { x: number }) => m.x * k + tx;
  const sy = (m: { y: number }) => m.y * k + ty;

  // ── Pick the markers to draw: in frame, greedy declutter by weight ────
  const inFrame = markers.filter(
    (m) => sx(m) > -20 && sx(m) < W + 20 && sy(m) > -20 && sy(m) < H + 20,
  );
  inFrame.sort(
    (a, b) => (b === selected ? 1 : 0) - (a === selected ? 1 : 0) || b.weight - a.weight,
  );
  const drawn: Marker[] = [];
  for (const m of inFrame) {
    if (drawn.length >= 110) break;
    if (
      m === selected ||
      !drawn.some((q) => Math.hypot(sx(q) - sx(m), sy(q) - sy(m)) < 24)
    )
      drawn.push(m);
  }

  // ── The map itself as one SVG (rasterized whole by the og renderer;
  //    text stays out of it — resvg here has no fonts — and is overlaid
  //    as positioned elements below) ─────────────────────────────────────
  const land = layerPath(basemap.land, true);
  const sw = (pxw: number) => pxw / k;
  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${SEA}"/>` +
    `<g transform="translate(${tx} ${ty}) scale(${k})">` +
    `<path d="${land}" fill="${LAND}" stroke="${COAST}" stroke-width="${sw(1)}" fill-rule="evenodd"/>` +
    `<clipPath id="lc"><path d="${land}" clip-rule="evenodd"/></clipPath>` +
    `<g clip-path="url(#lc)">` +
    (basemap.relief ?? [])
      .map(
        (band, i) =>
          `<path d="${layerPath(band, true)}" fill="${RELIEF[i] ?? RELIEF[RELIEF.length - 1]}" fill-rule="evenodd"/>`,
      )
      .join("") +
    `</g>` +
    `<path d="${layerPath(basemap.rivers, false)}" fill="none" stroke="${RIVER}" stroke-width="${sw(1)}"/>` +
    `<path d="${layerPath(basemap.lakes, true)}" fill="${SEA}" stroke="${COAST}" stroke-width="${sw(1)}"/>`;
  if (route && route.length >= 4) {
    // Same gentle quadratic arcs as the interactive map's journey overlay.
    let d = `M${route[0]} ${route[1]}`;
    for (let i = 2; i < route.length; i += 2) {
      const x0 = route[i - 2], y0 = route[i - 1];
      const x1 = route[i], y1 = route[i + 1];
      const qx = (x0 + x1) / 2 - (y1 - y0) * 0.15;
      const qy = (y0 + y1) / 2 + (x1 - x0) * 0.15;
      d += `Q${Math.round(qx)} ${Math.round(qy)} ${x1} ${y1}`;
    }
    svg += `<path d="${d}" fill="none" stroke="${AMBER_400}" stroke-opacity="0.6" stroke-width="${sw(1.6)}" stroke-dasharray="${sw(7)} ${sw(5)}" stroke-linecap="round"/>`;
  }
  svg += `</g>`;

  // Markers in screen space, selected drawn last so it sits on top.
  const glyph = (m: Marker) => {
    const gx = sx(m).toFixed(1);
    const gy = sy(m).toFixed(1);
    let g = `<g transform="translate(${gx} ${gy})">`;
    if (m === selected)
      g += `<circle r="8.5" fill="${AMBER_500}" fill-opacity="0.25" stroke="${AMBER_400}" stroke-width="1"/>`;
    if (m.seq != null)
      g += `<rect x="-8" y="-8" width="16" height="16" rx="4" fill="${AMBER_500}" stroke="${MARKER_EDGE}" stroke-width="1.5"/>`;
    else if (m.kind === 2)
      g += `<circle r="5" fill="none" stroke="${AMBER_400}" stroke-width="1.8"/>`;
    else if (m.kind === 3)
      g += `<path d="M0 -5.2 L5 3.8 L-5 3.8 Z" fill="${AMBER_500}" stroke="${MARKER_EDGE}" stroke-width="1.2"/>`;
    else
      g += `<circle r="4.4" fill="${m.kind === 1 ? WATER_DOT : AMBER_400}" stroke="${MARKER_EDGE}" stroke-width="1.4"/>`;
    if (m.uncertain)
      g += `<circle r="7.5" fill="none" stroke="${AMBER_400}" stroke-opacity="0.7" stroke-width="1" stroke-dasharray="2 2.5"/>`;
    return g + `</g>`;
  };
  svg += drawn
    .filter((m) => m !== selected)
    .map(glyph)
    .join("");
  if (selected) svg += glyph(selected);
  svg += `</svg>`;

  // ── Overlaid text: place labels (greedy collision, heaviest first) ────
  const labels: { text: string; left: number; top: number; big: boolean }[] = [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [
    // keep the card corners clear
    { x: 0, y: H - 120, w: 560, h: 120 },
    { x: W - 340, y: H - 60, w: 340, h: 60 },
  ];
  for (const m of drawn) {
    if (labels.length >= 14) break;
    const w = m.name.length * 9.5 + 14;
    const box = { x: sx(m) + 7, y: sy(m) - 11, w, h: 22 };
    if (box.x + box.w > W - 8 || box.y < 8) continue;
    const collides = boxes.some(
      (b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h,
    );
    if (collides && m !== selected) continue;
    boxes.push(box);
    labels.push({ text: m.name, left: box.x + 1, top: box.y + 2, big: m === selected });
  }
  // Sea/river names, zoom-gated exactly like the page.
  const relScale = k / kFit;
  const seaLabels = basemap.labels
    .filter(([, , , , minScale]) => relScale >= minScale)
    .map(([text, lx, ly, kind]) => {
      const fs = kind === 1 ? 13 : 15;
      return {
        text,
        fs,
        left: lx * k + tx - text.length * fs * 0.28,
        top: ly * k + ty - fs * 0.75,
      };
    })
    .filter((l) => l.left > -100 && l.left < W && l.top > -20 && l.top < H);

  const chip = title !== "Bible Atlas";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: SEA,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          width={W}
          height={H}
          alt=""
          style={{ position: "absolute", left: 0, top: 0 }}
        />
        {seaLabels.map((l, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: l.left,
              top: l.top,
              fontSize: l.fs,
              fontStyle: "italic",
              color: "#4e6678",
            }}
          >
            {l.text}
          </span>
        ))}
        {drawn
          .filter((m) => m.seq != null)
          .map((m) => (
            <div
              key={`seq-${m.seq}`}
              style={{
                position: "absolute",
                left: sx(m) - 8,
                top: sy(m) - 8,
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#0a0a0a",
              }}
            >
              {m.seq}
            </div>
          ))}
        {labels.map((l, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: l.left,
              top: l.big ? l.top - 3 : l.top,
              fontSize: l.big ? 20 : 16,
              fontWeight: l.big ? 700 : 500,
              color: l.big ? AMBER_400 : "#f5f5f4",
              textShadow: `0 0 4px ${MARKER_EDGE}, 0 1px 2px ${MARKER_EDGE}`,
            }}
          >
            {l.text}
          </span>
        ))}
        <div
          style={{
            position: "absolute",
            left: 24,
            bottom: 20,
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            backgroundColor: "rgba(16,24,32,0.85)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "10px 18px",
          }}
        >
          <span style={{ fontSize: chip ? 30 : 26, fontWeight: 700, color: "#f5f5f4" }}>
            {title}
          </span>
          <span style={{ fontSize: 17, color: "#d6ba7e" }}>
            {chip ? "Bible Atlas · readability.bible" : "readability.bible"}
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 8,
            fontSize: 12,
            color: "#737373",
          }}
        >
          Places: OpenBible.info CC BY · Natural Earth · GMRT
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
