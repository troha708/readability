#!/usr/bin/env node
/**
 * Build the self-hosted SVG basemap for the chapter map from Natural Earth
 * 10m vector data (public domain — "Crediting the authors is unnecessary",
 * naturalearthdata.com). No tile server: the whole basemap ships as one
 * lazy-loaded JSON of projected, simplified, quantized polylines.
 *
 * Layers:
 *   land   = ne_10m_land + ne_10m_minor_islands (so Patmos and Malta exist)
 *   relief = hypsometric tint bands contoured from a public-domain
 *            elevation grid (GMRT topo/bathy synthesis): two below-sea-
 *            level bands (≤0, ≤−200 m — the rift valley reads sunken)
 *            plus four elevation bands (≥300/700/1500/2500 m) — subtle
 *            stacked fills that make the rift, the hill country, and the
 *            mountain ranges legible
 *   lakes  = curated biblical-era lakes (reservoirs/canals excluded)
 *   rivers = curated rivers (Nile + delta, Euphrates, Tigris, Jordan, Indus)
 *   labels = curated sea/river names with a min zoom scale
 *
 * Output: public/maps/basemap.json
 *   { v, grid: [w, h], land: [[x,y,x,y,...], ...], lakes: [...],
 *     rivers: [...], labels: [[text, x, y, kind, minScale], ...] }
 * Coordinates are integer grid units (see scripts/map-projection.mjs).
 *
 * Prerequisite (files are ~35 MB total, not committed):
 *   cd %TEMP%
 *   curl -sLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson
 *   curl -sLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_minor_islands.geojson
 *   curl -sLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson
 *   curl -sLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson
 *   curl -sL -o dem.tif "https://www.gmrt.org/services/GridServer?minlongitude=-10&maxlongitude=70&minlatitude=12&maxlatitude=47&format=geotiff&resolution=high"
 *   curl -sL -o dem-deadsea.tif "https://www.gmrt.org/services/GridServer?minlongitude=35.2&maxlongitude=35.8&minlatitude=30.8&maxlatitude=31.9&format=geotiff&resolution=max"
 *
 * Usage: node scripts/build-basemap.mjs --src <dir-with-geojson-files> --dem <dem.tif> --deadsea <dem-deadsea.tif>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fromFile } from "geotiff";
import { contours } from "d3-contour";
import { EXTENT, GRID_WIDTH, GRID_HEIGHT, project } from "./map-projection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SRC = arg("src");
const DEM = arg("dem");
const DEADSEA = arg("deadsea");
if (!SRC || !fs.existsSync(SRC) || !DEM || !fs.existsSync(DEM) || !DEADSEA || !fs.existsSync(DEADSEA)) {
  console.error(
    "Usage: node scripts/build-basemap.mjs --src <dir-with-ne_10m_*.geojson> --dem <dem.tif> --deadsea <dem-deadsea.tif>",
  );
  process.exit(1);
}

// Hypsometric bands: everything at or above each elevation gets that band's
// tint, stacked lowest-first. 300 m separates the coastal plains from the
// hill country; 700 m marks the central ridges (Jerusalem sits at ~750 m);
// 1500 m is real mountains (Lebanon, Ararat, Zagros); 2500 m is the high
// peaks (Hermon 2814, Sinai's Jebel Katherina 2642, Ararat, the high Zagros).
// Two below-sea-level bands (buildDepression) render FIRST, tinted darker
// than base land, so the rift valley reads as the trench it is and deepens
// toward the Dead Sea, whose shore lies ~430 m below sea level: ≤0 catches
// the upper Jordan valley (plus the Qattara and Danakil depressions),
// ≤−200 the lower rift — Sea of Galilee (−212) down to the Dead Sea.
const RELIEF_BANDS = [300, 700, 1500, 2500];
const DEPRESSION_BANDS = [0, -200];
// The rift floor is only a few DEM pixels wide; simplifying it at the
// relief tolerance (8) would shred the ribbon, so the depression band
// keeps more detail.
const TOL_DEPRESSION = 3;
// Relief is a subtle background tint, not a boundary layer — simplify much
// harder than the coastline and drop small speckle, or it dominates the
// file (3 units ≈ 810 KB total with three bands; 8 units + four bands
// ≈ 456 KB / 185 KB gz — the measured budget ceiling is ~500 KB raw).
const TOL_RELIEF = 8;
const MIN_RELIEF_AREA = 450; // grid units²; drops patches smaller than ~90 km²

// Simplification tolerance in grid units (1 unit ≈ 0.45 km). Land can be
// coarser than lakes: the Sea of Galilee is small enough that a couple of
// units visibly distort it.
const TOL_LAND = 3;
const TOL_LAKE = 1;
const TOL_RIVER = 2.5;
const MIN_ISLAND_AREA = 9; // grid units²; keeps Patmos (~170), drops islets

// Biblical-era water only. Natural Earth's bbox contents include modern
// reservoirs (Lake Nasser, Ataturk Barajt, Buhayrat al-Assad...) and canals
// (Suez, Gharraf) that would be anachronisms on a Bible map. The Dead Sea
// is deliberately NOT taken from Natural Earth: its modern geometry is an
// anachronism too (see buildDeadSea) and is reconstructed from elevation
// data instead.
const KEEP_LAKES = new Set([
  "Sea of Galilee",
  "Lake Urmia",
  "Lake Van",
  "Lake Tuz",
  "Great Bitter Lake", // Exodus route context
]);
const KEEP_RIVERS = new Set([
  "Nile",
  "Rosetta Branch",
  "Damietta Branch",
  "El Bahr el Abyad", // White Nile
  "El Bahr el Azraq", // Blue Nile
  "Euphrates",
  "Firat", // Euphrates' Turkish reach
  "Al Furat", // Euphrates' Syrian reach
  "Tigris",
  "Dicle", // Tigris' Turkish reach
  "Shatt al Arab",
  "Jordan",
  "Indus", // eastern edge of the map (Esther 1:1 "from India to Cush")
]);

// [text, lon, lat, kind, minScale] — kind 0 = sea, 1 = river; minScale is the
// zoom factor (relative to whole-map fit) below which the label is hidden.
const LABELS = [
  ["Mediterranean Sea", 28.5, 34.3, 0, 1],
  ["Black Sea", 34.0, 43.2, 0, 1],
  ["Caspian Sea", 50.7, 41.3, 0, 1],
  ["Red Sea", 37.5, 22.5, 0, 1],
  ["Persian Gulf", 51.3, 27.6, 0, 1.5],
  ["Aegean Sea", 25.2, 38.6, 0, 3],
  ["Sea of Galilee", 35.85, 32.82, 0, 12],
  ["Dead Sea", 35.75, 31.35, 0, 10],
  ["Nile", 31.05, 27.7, 1, 3],
  ["Euphrates", 39.8, 35.55, 1, 3],
  ["Tigris", 44.2, 34.5, 1, 3],
  ["Jordan", 35.75, 32.3, 1, 14],
];

// ── Geometry helpers ─────────────────────────────────────────────────

/** Sutherland–Hodgman clip of a ring against the extent rectangle. */
function clipRing(ring) {
  const edges = [
    { inside: (p) => p[0] >= EXTENT.west, cross: (a, b) => lerpX(a, b, EXTENT.west) },
    { inside: (p) => p[0] <= EXTENT.east, cross: (a, b) => lerpX(a, b, EXTENT.east) },
    { inside: (p) => p[1] >= EXTENT.south, cross: (a, b) => lerpY(a, b, EXTENT.south) },
    { inside: (p) => p[1] <= EXTENT.north, cross: (a, b) => lerpY(a, b, EXTENT.north) },
  ];
  let poly = ring;
  for (const edge of edges) {
    if (poly.length === 0) return [];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const curIn = edge.inside(cur);
      const prevIn = edge.inside(prev);
      if (curIn) {
        if (!prevIn) out.push(edge.cross(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(edge.cross(prev, cur));
      }
    }
    poly = out;
  }
  return poly;
}

function lerpX(a, b, x) {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}
function lerpY(a, b, y) {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

/** Split a polyline into runs inside the extent, with edge intersections. */
function clipLine(points) {
  const inside = (p) =>
    p[0] >= EXTENT.west && p[0] <= EXTENT.east && p[1] >= EXTENT.south && p[1] <= EXTENT.north;
  const runs = [];
  let run = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prev = i > 0 ? points[i - 1] : null;
    if (inside(cur)) {
      if (prev && !inside(prev)) run.push(boundaryPoint(cur, prev));
      run.push(cur);
    } else if (prev && inside(prev)) {
      run.push(boundaryPoint(prev, cur));
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}

/** Point where the segment from `inside` toward `outside` meets the extent. */
function boundaryPoint(insideP, outsideP) {
  let t = 1;
  const dx = outsideP[0] - insideP[0];
  const dy = outsideP[1] - insideP[1];
  if (dx !== 0) {
    for (const x of [EXTENT.west, EXTENT.east]) {
      const tt = (x - insideP[0]) / dx;
      if (tt > 0 && tt < t) t = tt;
    }
  }
  if (dy !== 0) {
    for (const y of [EXTENT.south, EXTENT.north]) {
      const tt = (y - insideP[1]) / dy;
      if (tt > 0 && tt < t) t = tt;
    }
  }
  return [insideP[0] + t * dx, insideP[1] + t * dy];
}

/** Douglas–Peucker simplification (iterative, on projected points). */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = 0;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let d;
      if (len2 === 0) {
        d = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tol2) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function quantize(points) {
  const out = [];
  let px = null;
  let py = null;
  for (const [x, y] of points) {
    const qx = Math.round(x);
    const qy = Math.round(y);
    if (qx === px && qy === py) continue;
    out.push([qx, qy]);
    px = qx;
    py = qy;
  }
  return out;
}

function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function flatten(points) {
  const flat = [];
  for (const [x, y] of points) flat.push(x, y);
  return flat;
}

/** Quick reject: does the feature's raw coordinate set touch the extent? */
function touchesExtent(coords) {
  let touches = false;
  const walk = (c) => {
    if (touches) return;
    if (Array.isArray(c[0])) {
      c.forEach(walk);
    } else if (
      c[0] >= EXTENT.west && c[0] <= EXTENT.east &&
      c[1] >= EXTENT.south && c[1] <= EXTENT.north
    ) {
      touches = true;
    }
  };
  walk(coords);
  return touches;
}

// ── Build layers ─────────────────────────────────────────────────────

function loadFeatures(file) {
  return JSON.parse(fs.readFileSync(path.join(SRC, file), "utf8")).features;
}

function polygonRings(geometry, includeHoles) {
  // Interior rings matter for land: the Caspian Sea is a hole in Natural
  // Earth's land polygons, not a lake feature. Holes are emitted as extra
  // rings in the same layer; the renderer must fill with fill-rule="evenodd".
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return polys.flatMap((rings) => (includeHoles ? rings : [rings[0]]));
}

function lineStrings(geometry) {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function buildPolygonLayer(features, tolerance, minArea, includeHoles = false) {
  const out = [];
  for (const f of features) {
    if (!touchesExtent(f.geometry.coordinates)) continue;
    for (const ring of polygonRings(f.geometry, includeHoles)) {
      const clipped = clipRing(ring);
      if (clipped.length < 4) continue;
      const projected = clipped.map(([lon, lat]) => project(lon, lat));
      const simplified = quantize(simplify(projected, tolerance));
      if (simplified.length < 4) continue;
      if (ringArea(simplified) < minArea) continue;
      out.push(flatten(simplified));
    }
  }
  return out;
}

function buildLineLayer(features, keepNames, tolerance) {
  const out = [];
  const kept = new Set();
  for (const f of features) {
    const name = f.properties.name;
    if (!keepNames.has(name)) continue;
    if (!touchesExtent(f.geometry.coordinates)) continue;
    for (const line of lineStrings(f.geometry)) {
      for (const run of clipLine(line)) {
        const projected = run.map(([lon, lat]) => project(lon, lat));
        const simplified = quantize(simplify(projected, tolerance));
        if (simplified.length < 2) continue;
        out.push(flatten(simplified));
        kept.add(name);
      }
    }
  }
  return { out, kept };
}

/**
 * Hypsometric tint bands from the elevation grid: d3-contour produces, for
 * each threshold, a MultiPolygon (with holes) covering everything at or
 * above that elevation, in grid-index space; rings are mapped to lon/lat,
 * clipped, projected, and simplified exactly like the coastline. Rendered
 * with fill-rule evenodd, so holes (valleys inside highlands) read correctly.
 */
async function buildRelief() {
  const tiff = await fromFile(DEM);
  const img = await tiff.getImage();
  const width = img.getWidth();
  const height = img.getHeight();
  const [west, south, east, north] = img.getBoundingBox();
  const values = await img.readRasters({ interleave: true });

  const bands = contours()
    .size([width, height])
    .thresholds(RELIEF_BANDS)
    .smooth(true)(values);

  const toLonLat = ([gx, gy]) => [
    west + (gx / width) * (east - west),
    north - (gy / height) * (north - south),
  ];

  const out = [];
  for (const band of bands) {
    const rings = [];
    for (const polygon of band.coordinates) {
      for (const ring of polygon) {
        const clipped = clipRing(ring.map(toLonLat));
        if (clipped.length < 4) continue;
        const projected = clipped.map(([lon, lat]) => project(lon, lat));
        const simplified = quantize(simplify(projected, TOL_RELIEF));
        if (simplified.length < 4) continue;
        if (ringArea(simplified) < MIN_RELIEF_AREA) continue;
        rings.push(flatten(simplified));
      }
    }
    out.push(rings);
  }
  return out;
}

/**
 * Below-sea-level LAND: the mask of elev<=0 minus the oceans. GMRT includes
 * bathymetry, so "at or below 0" covers every sea; the ocean is removed by
 * flood-filling from the DEM borders — plus explicit seeds for the Black
 * Sea and Caspian, which are landlocked at this resolution (the Bosporus
 * closes at ~3.5 km/px) but must stay sea, not "depression". What remains
 * is genuine sunken land: the Jordan rift down to the Dead Sea (~-430 m),
 * the Qattara Depression, the Danakil.
 */
async function buildDepression() {
  const tiff = await fromFile(DEM);
  const img = await tiff.getImage();
  const width = img.getWidth();
  const height = img.getHeight();
  const [west, south, east, north] = img.getBoundingBox();
  const values = await img.readRasters({ interleave: true });
  const size = width * height;

  const toLonLat = ([gx, gy]) => [
    west + (gx / width) * (east - west),
    north - (gy / height) * (north - south),
  ];

  const out = [];
  for (const level of DEPRESSION_BANDS) {
    const mask = new Uint8Array(size);
    for (let i = 0; i < size; i++) mask[i] = values[i] <= level ? 1 : 0;

    const ocean = new Uint8Array(size);
    const stack = [];
    const push = (i) => {
      if (mask[i] && !ocean[i]) {
        ocean[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    // Landlocked seas that would otherwise read as depressions. (A seed
    // whose pixel is above the level, like the shallow Azov at −200,
    // simply no-ops.)
    // The client also clips relief to the land shape, so a missed water
    // body cannot render as terrain — these seeds just keep the dead
    // geometry out of the file.
    const SEA_SEEDS = [
      [34.0, 43.2], // Black Sea
      [28.2, 40.75], // Sea of Marmara (the Dardanelles close at this resolution)
      [37.8, 46.2], // Sea of Azov (its strait also closes at this resolution)
      [50.7, 41.3], // Caspian Sea
      [22.5, 38.3], // Gulf of Corinth (the Rion strait closes too)
      [21.0, 39.0], // Ambracian Gulf
      [12.3, 45.3], // Venice lagoon (closed by its barrier islands)
    ];
    for (const [lon, lat] of SEA_SEEDS) {
      const x = Math.round(((lon - west) / (east - west)) * width);
      const y = Math.round(((north - lat) / (north - south)) * height);
      if (x >= 0 && x < width && y >= 0 && y < height) push(y * width + x);
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % width;
      const y = (i / width) | 0;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    const depression = new Uint8Array(size);
    for (let i = 0; i < size; i++) depression[i] = mask[i] && !ocean[i] ? 1 : 0;

    const [band] = contours().size([width, height]).thresholds([0.5]).smooth(true)(depression);

    const rings = [];
    for (const polygon of band.coordinates) {
      for (const ring of polygon) {
        const clipped = clipRing(ring.map(toLonLat));
        if (clipped.length < 4) continue;
        const projected = clipped.map(([lon, lat]) => project(lon, lat));
        const simplified = quantize(simplify(projected, TOL_DEPRESSION));
        if (simplified.length < 4) continue;
        if (ringArea(simplified) < MIN_RELIEF_AREA) continue;
        rings.push(flatten(simplified));
      }
    }
    out.push(rings);
  }
  return out;
}

// Bands stack lowest-first; the depression bands are the lowest of all,
// shallow before deep so the deeper tint paints over the shallower.
const relief = [...(await buildDepression()), ...(await buildRelief())];

// The modern Dead Sea is an anachronism twice over: 20th-century water
// diversion dropped the lake ~30 m, cutting off the southern basin, which
// survives only as industrial evaporation ponds — Natural Earth honestly
// maps it as two disconnected bodies. In the biblical period it was ONE
// lake: the shallow southern basin (Valley of Siddim, Zoar) joined the
// deep northern one through a strait past the Lisan peninsula (still
// ~5 m deep when Lynch sounded it in 1848). Reconstruct that single lake
// as the terrain at or below the approximate pre-modern level from a
// max-resolution GMRT grid of the basin; the sill between the basins
// sits near −403 m, so this level keeps the strait wet and the Lisan a
// peninsula.
const DEAD_SEA_LEVEL = -397;

async function buildDeadSea() {
  const tiff = await fromFile(DEADSEA);
  const img = await tiff.getImage();
  const width = img.getWidth();
  const height = img.getHeight();
  const [west, south, east, north] = img.getBoundingBox();
  const values = await img.readRasters({ interleave: true });

  // Binary water mask at the reconstruction level, cleaned of modern
  // artifacts in two steps. (1) The industrial evaporation-pond dikes
  // stand above the ancient level and CONNECT to the shore, so a
  // morphological opening of the land (erode+dilate, Chebyshev radius
  // OPEN_R) erases anything thinner than ~2·OPEN_R pixels — dikes are a
  // pixel or two wide at this resolution, the Lisan peninsula is ~4 km
  // and untouched. (2) Any land left stranded inside the basin (pond
  // surfaces sitting above the level, now cut off from shore by step 1)
  // is flooded back to water via border connectivity.
  const size = width * height;
  const water = new Uint8Array(size);
  for (let i = 0; i < size; i++) water[i] = values[i] <= DEAD_SEA_LEVEL ? 1 : 0;

  // Opening of land == closing of water: dilate water, then erode it.
  // Separable two-pass max/min filters (square kernel).
  const OPEN_R = 2;
  const pass = (src, w, h, r, pick) => {
    const mid = new Uint8Array(src.length);
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = src[y * w + x];
        for (let d = -r; d <= r && v !== pick; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < w && src[y * w + xx] === pick) v = pick;
        }
        mid[y * w + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = mid[y * w + x];
        for (let d = -r; d <= r && v !== pick; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < h && mid[yy * w + x] === pick) v = pick;
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
  const dilated = pass(water, width, height, OPEN_R, 1);
  const opened = pass(dilated, width, height, OPEN_R, 0);
  water.set(opened);
  const mainland = new Uint8Array(size);
  const stack = [];
  const pushLand = (i) => {
    if (!water[i] && !mainland[i]) {
      mainland[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    pushLand(x);
    pushLand((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    pushLand(y * width);
    pushLand(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) pushLand(i - 1);
    if (x < width - 1) pushLand(i + 1);
    if (y > 0) pushLand(i - width);
    if (y < height - 1) pushLand(i + width);
  }
  for (let i = 0; i < size; i++) {
    if (!water[i] && !mainland[i]) water[i] = 1;
  }

  const [band] = contours()
    .size([width, height])
    .thresholds([0.5])
    .smooth(true)(water);

  const toLonLat = ([gx, gy]) => [
    west + (gx / width) * (east - west),
    north - (gy / height) * (north - south),
  ];

  // Keep only the largest polygon: stray sub-level pans in the rift floor
  // are noise, and the Lisan is a peninsula, so no holes are expected.
  let best = null;
  let bestArea = 0;
  for (const polygon of band.coordinates) {
    const clipped = clipRing(polygon[0].map(toLonLat));
    if (clipped.length < 4) continue;
    const projected = clipped.map(([lon, lat]) => project(lon, lat));
    const simplified = quantize(simplify(projected, TOL_LAKE));
    if (simplified.length < 4) continue;
    const area = ringArea(simplified);
    if (area > bestArea) {
      bestArea = area;
      best = simplified;
    }
  }
  if (!best) throw new Error("Dead Sea reconstruction produced no polygon — check the --deadsea DEM");
  return flatten(best);
}

const deadSea = await buildDeadSea();

const land = [
  ...buildPolygonLayer(loadFeatures("ne_10m_land.geojson"), TOL_LAND, MIN_ISLAND_AREA, true),
  ...buildPolygonLayer(loadFeatures("ne_10m_minor_islands.geojson"), TOL_LAND, MIN_ISLAND_AREA),
];

const lakeFeatures = loadFeatures("ne_10m_lakes.geojson").filter((f) =>
  KEEP_LAKES.has(f.properties.name),
);
const lakes = [...buildPolygonLayer(lakeFeatures, TOL_LAKE, 0), deadSea];
const lakeNames = new Set([
  ...lakeFeatures.map((f) => f.properties.name),
  "Dead Sea (reconstructed)",
]);

const { out: rivers, kept: riverNames } = buildLineLayer(
  loadFeatures("ne_10m_rivers_lake_centerlines.geojson"),
  KEEP_RIVERS,
  TOL_RIVER,
);

const labels = LABELS.map(([text, lon, lat, kind, minScale]) => {
  const [x, y] = project(lon, lat);
  return [text, Math.round(x), Math.round(y), kind, minScale];
});

const basemap = {
  v: 1,
  grid: [GRID_WIDTH, GRID_HEIGHT],
  // Geographic extent [west, south, east, north] — lets the client invert
  // the projection (scale bar needs km-per-pixel at the view's latitude).
  extent: [EXTENT.west, EXTENT.south, EXTENT.east, EXTENT.north],
  land,
  relief,
  lakes,
  rivers,
  labels,
};

const OUT_DIR = path.join(root, "public", "maps");
fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, "basemap.json");
fs.writeFileSync(outFile, JSON.stringify(basemap));

const points = (layer) => layer.reduce((n, l) => n + l.length / 2, 0);
console.log(
  `land: ${land.length} rings / ${points(land)} pts · ` +
    `relief: ${relief
      .map((b, i) => {
        const label =
          i < DEPRESSION_BANDS.length
            ? `≤${DEPRESSION_BANDS[i]}m`
            : `≥${RELIEF_BANDS[i - DEPRESSION_BANDS.length]}m`;
        return `${label} ${b.length}r/${points(b)}p`;
      })
      .join(", ")} · ` +
    `lakes: ${lakes.length} rings / ${points(lakes)} pts (${[...lakeNames].join(", ")}) · ` +
    `rivers: ${rivers.length} lines / ${points(rivers)} pts (${[...riverNames].join(", ")})`,
);
const missingLakes = [...KEEP_LAKES].filter((n) => !lakeNames.has(n));
const missingRivers = [...KEEP_RIVERS].filter((n) => !riverNames.has(n));
if (missingLakes.length) console.warn(`WARNING: lakes not found: ${missingLakes.join(", ")}`);
if (missingRivers.length) console.warn(`WARNING: rivers not found: ${missingRivers.join(", ")}`);
console.log(`→ ${path.relative(root, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
