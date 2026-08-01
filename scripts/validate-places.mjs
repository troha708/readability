#!/usr/bin/env node
/**
 * Validation gate for the chapter-map place index (run after
 * build-places.mjs). Checks structural integrity, that every chapter key
 * exists in the BSB text, that coordinates project correctly, and a set of
 * known-answer spot checks so a bad upstream file or a broken parser can't
 * ship silently.
 *
 * Usage: node scripts/validate-places.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GRID_WIDTH, GRID_HEIGHT, project } from "./map-projection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PLACES_DIR = path.join(root, "data", "places");

const CANON = new Set([
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
  "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
  "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
  "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy",
  "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
]);

let failures = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures++;
}

const files = fs.readdirSync(PLACES_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
if (files.length === 0) fail("no place files in data/places/");

const byBook = new Map();
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(PLACES_DIR, file), "utf8"));
  byBook.set(data.book, data.chapters);
  if (!CANON.has(data.book)) fail(`${file}: book "${data.book}" not in the 66-book canon`);
  if (file !== `${data.book}.json`) fail(`${file}: filename does not match book "${data.book}"`);
}

// ── Structural checks ────────────────────────────────────────────────
let placeCount = 0;
for (const [book, chapters] of byBook) {
  // Chapter keys must exist in the BSB text.
  const bsbFile = path.join(root, "data", "BSB", `${book}.json`);
  const bsbChapters = new Set(
    JSON.parse(fs.readFileSync(bsbFile, "utf8")).chapters.map((c) => String(c.chapter)),
  );
  for (const [chKey, ch] of Object.entries(chapters)) {
    if (!bsbChapters.has(chKey)) fail(`${book} ${chKey}: chapter not in BSB text`);
    for (const p of ch.p ?? []) {
      placeCount++;
      const [name, x, y, kind, uncertain, verses, modernName, link, type, soft] = p;
      if (typeof name !== "string" || !name) fail(`${book} ${chKey}: empty place name`);
      if (/ \d+$/.test(name)) fail(`${book} ${chKey}: "${name}" kept a disambiguation suffix`);
      if (!Number.isInteger(x) || x < 0 || x > GRID_WIDTH || !Number.isInteger(y) || y < 0 || y > GRID_HEIGHT)
        fail(`${book} ${chKey}: "${name}" out-of-grid coordinates ${x},${y}`);
      if (![0, 1, 2, 3].includes(kind)) fail(`${book} ${chKey}: "${name}" bad kind ${kind}`);
      if (![0, 1].includes(uncertain)) fail(`${book} ${chKey}: "${name}" bad uncertain flag`);
      // Regular verses may be empty only when soft verses carry the entry
      // (the place's presence in this chapter rests on 1-of-10-translation
      // renderings, e.g. Mount Zaphon in Job 26).
      const badVerseArr = (a) =>
        !Array.isArray(a) || a.some((v) => !Number.isInteger(v) || v < 1);
      if (badVerseArr(verses) || (verses.length === 0 && !soft))
        fail(`${book} ${chKey}: "${name}" bad verse list`);
      if (soft !== undefined && (badVerseArr(soft) || soft.length === 0))
        fail(`${book} ${chKey}: "${name}" bad soft verse list`);
      if (soft && verses.some((v) => soft.includes(v)))
        fail(`${book} ${chKey}: "${name}" verse listed as both regular and soft`);
      if (typeof modernName !== "string") fail(`${book} ${chKey}: "${name}" bad modern name`);
      if (typeof link !== "string" || !/^[a-z0-9]+\/.+$/.test(link))
        fail(`${book} ${chKey}: "${name}" bad openbible link "${link}"`);
      if (typeof type !== "string") fail(`${book} ${chKey}: "${name}" missing type word`);
    }
    for (const [name, verses] of ch.u ?? []) {
      if (typeof name !== "string" || !name) fail(`${book} ${chKey}: empty unlocated name`);
      if (!Array.isArray(verses) || verses.length === 0) fail(`${book} ${chKey}: unlocated "${name}" bad verses`);
    }
  }
}

// ── Known-answer spot checks ─────────────────────────────────────────
function placesIn(book, chapter) {
  return (byBook.get(book)?.[String(chapter)]?.p ?? []).map((p) => p[0]);
}
function expectPlaces(book, chapter, names) {
  const have = new Set(placesIn(book, chapter));
  for (const name of names) {
    if (!have.has(name)) fail(`${book} ${chapter}: expected place "${name}", have [${[...have].join(", ")}]`);
  }
}

expectPlaces("Genesis", 12, ["Haran", "Shechem", "Bethel", "Egypt", "Canaan"]);
expectPlaces("Exodus", 19, ["Mount Sinai", "Rephidim"]);
expectPlaces("Joshua", 6, ["Jericho"]);
expectPlaces("Jonah", 1, ["Nineveh", "Joppa", "Tarshish"]);
expectPlaces("John", 11, ["Bethany", "Jerusalem"]);
expectPlaces("Acts", 28, ["Malta", "Syracuse", "Rome"]);
expectPlaces("Psalms", 137, ["Babylon", "Zion"]);

// Jerusalem must project to the same grid cell everywhere it appears, and to
// the coordinates implied by its real lon/lat (35.234167, 31.776667).
const [jx, jy] = project(35.234167, 31.776667).map(Math.round);
const j2sam5 = (byBook.get("2 Samuel")?.["5"]?.p ?? []).find((p) => p[0] === "Jerusalem");
if (!j2sam5) {
  fail("2 Samuel 5: Jerusalem missing");
} else if (Math.abs(j2sam5[1] - jx) > 1 || Math.abs(j2sam5[2] - jy) > 1) {
  fail(`Jerusalem projected to ${j2sam5[1]},${j2sam5[2]}, expected ~${jx},${jy}`);
}

// Chapters with no named places must have no file entry (Psalm 1 names none).
if (byBook.get("Psalms")?.["1"]) fail("Psalms 1 should have no places entry");

// The basemap must exist, parse, and share this projection's grid.
const basemapFile = path.join(root, "public", "maps", "basemap.json");
if (!fs.existsSync(basemapFile)) {
  fail("public/maps/basemap.json missing (run build-basemap.mjs)");
} else {
  const bm = JSON.parse(fs.readFileSync(basemapFile, "utf8"));
  if (bm.grid[0] !== GRID_WIDTH || bm.grid[1] !== GRID_HEIGHT)
    fail(`basemap grid ${bm.grid} != projection grid ${GRID_WIDTH}x${GRID_HEIGHT}`);
  if (!Array.isArray(bm.extent) || bm.extent.length !== 4 || bm.extent[0] >= bm.extent[2] || bm.extent[1] >= bm.extent[3])
    fail(`basemap extent malformed: ${JSON.stringify(bm.extent)}`);
  for (const layer of ["land", "lakes", "rivers"]) {
    if (!Array.isArray(bm[layer]) || bm[layer].length === 0) fail(`basemap layer "${layer}" empty`);
  }
  // 2 depression bands (≤0, ≤−200 m) + 4 elevation bands (≥300/700/1500/2500).
  if (!Array.isArray(bm.relief) || bm.relief.length !== 6 || bm.relief.some((b) => !Array.isArray(b) || b.length === 0))
    fail("basemap relief bands missing/empty — expected 6 (rebuild with --dem)");
  // 6 curated lakes, one ring each — in particular the Dead Sea must be the
  // single reconstructed biblical-era lake, not Natural Earth's modern
  // split pair (see buildDeadSea in build-basemap.mjs).
  if (bm.lakes.length !== 6)
    fail(`basemap has ${bm.lakes.length} lake rings, expected 6 (Dead Sea reconstruction missing?)`);
}

// The whole-Bible atlas file for /try/bible/map.
const atlasFile = path.join(root, "public", "maps", "atlas.json");
if (!fs.existsSync(atlasFile)) {
  fail("public/maps/atlas.json missing (run build-places.mjs)");
} else {
  const atlas = JSON.parse(fs.readFileSync(atlasFile, "utf8"));
  if (!Array.isArray(atlas.books) || atlas.books.length !== 66)
    fail(`atlas books list has ${atlas.books?.length} entries, expected 66`);
  if (!Array.isArray(atlas.places) || atlas.places.length < 1000)
    fail(`atlas has only ${atlas.places?.length} places`);
  for (const [name, x, y, kind, uncertain, modern, link, refs, type, softRefs] of atlas.places) {
    if (typeof link !== "string" || !link.includes("/")) fail(`atlas "${name}": bad link`);
    if (!Number.isInteger(x) || x < 0 || x > GRID_WIDTH || !Number.isInteger(y) || y < 0 || y > GRID_HEIGHT)
      fail(`atlas "${name}": out-of-grid ${x},${y}`);
    if (![0, 1, 2, 3].includes(kind) || ![0, 1].includes(uncertain) || typeof modern !== "string")
      fail(`atlas "${name}": bad kind/uncertain/modern`);
    if (typeof type !== "string") fail(`atlas "${name}": missing type word`);
    // Regular refs may be empty only when the place exists purely through
    // soft (1-of-10-translation) references.
    if (!Array.isArray(refs) || (refs.length === 0 && !softRefs)) fail(`atlas "${name}": no refs`);
    const checkRefs = (list, label) => {
      for (const [bIdx, ch, verses] of list) {
        if (!Number.isInteger(bIdx) || bIdx < 0 || bIdx >= atlas.books.length)
          fail(`atlas "${name}": bad ${label} book index ${bIdx}`);
        if (!Number.isInteger(ch) || ch < 1 || !Array.isArray(verses) || verses.length === 0)
          fail(`atlas "${name}": bad ${label} ref ${bIdx}:${ch}`);
      }
    };
    checkRefs(refs, "regular");
    if (softRefs !== undefined) {
      if (!Array.isArray(softRefs) || softRefs.length === 0)
        fail(`atlas "${name}": empty soft ref list`);
      else checkRefs(softRefs, "soft");
    }
  }
  const jerusalem = atlas.places.find((p) => p[0] === "Jerusalem");
  if (!jerusalem) fail("atlas: Jerusalem missing");
  else if (jerusalem[7].length < 300)
    fail(`atlas: Jerusalem has only ${jerusalem[7].length} chapter refs — parse regression?`);

  // The two Zaphons (the defect an academic reader caught 2026-08-01): the
  // mountain must carry its "Mount" rendering, its type word, its regular
  // refs (Ps 48:2, Isa 14:13) AND its soft ref (Job 26:7, NRSV-only) — and
  // stay distinct from the Gadite town.
  const JOB = 17, PS = 18, ISA = 22;
  const mtZaphon = atlas.places.find((p) => p[0] === "Mount Zaphon");
  if (!mtZaphon) {
    fail('atlas: "Mount Zaphon" missing (rename from translated names broken?)');
  } else {
    if (mtZaphon[8] !== "mountain") fail(`atlas Mount Zaphon: type "${mtZaphon[8]}" != "mountain"`);
    const hard = JSON.stringify(mtZaphon[7]);
    if (!hard.includes(`[${PS},48,[2]]`) || !hard.includes(`[${ISA},14,[13]]`))
      fail(`atlas Mount Zaphon: regular refs ${hard} missing Ps 48:2 / Isa 14:13`);
    if (JSON.stringify(mtZaphon[9] ?? []) !== `[[${JOB},26,[7]]]`)
      fail(`atlas Mount Zaphon: soft refs ${JSON.stringify(mtZaphon[9])} != Job 26:7`);
  }
  const townZaphon = atlas.places.find((p) => p[0] === "Zaphon");
  if (!townZaphon) fail('atlas: town "Zaphon" missing');
  else if (townZaphon[8] !== "settlement")
    fail(`atlas town Zaphon: type "${townZaphon[8]}" != "settlement"`);

  // Fields are plots of ground — points (kind 3), never italic region labels
  // (2026-08-01 kind audit).
  const akeldama = atlas.places.find((p) => p[0] === "Akeldama");
  if (!akeldama) fail("atlas: Akeldama missing");
  else if (akeldama[3] !== 3 || akeldama[8] !== "field")
    fail(`atlas Akeldama: kind ${akeldama[3]}/type "${akeldama[8]}", expected 3/"field"`);
  const job26 = (byBook.get("Job")?.["26"]?.p ?? []).find((p) => p[0] === "Mount Zaphon");
  if (!job26) fail("Job 26: Mount Zaphon missing from chapter file");
  else if (JSON.stringify(job26[9] ?? []) !== "[7]" || job26[5].length !== 0)
    fail(`Job 26 Mount Zaphon: expected soft [7] + no regular verses, got ${JSON.stringify(job26[5])}/${JSON.stringify(job26[9])}`);

  // Paul's journeys: four routes, sane stop counts, coordinates on-grid.
  if (!Array.isArray(atlas.journeys) || atlas.journeys.length !== 4) {
    fail(`atlas: expected 4 journeys, have ${atlas.journeys?.length}`);
  } else {
    for (const j of atlas.journeys) {
      if (!j.n || !Array.isArray(j.s) || j.s.length < 10)
        fail(`atlas journey "${j.n}": only ${j.s?.length} stops`);
      for (const [name, x, y, ref] of j.s ?? []) {
        if (typeof name !== "string" || typeof ref !== "string" || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > GRID_WIDTH || y < 0 || y > GRID_HEIGHT)
          fail(`atlas journey "${j.n}": bad stop ${name}`);
      }
    }
    const voyage = atlas.journeys[3];
    if (voyage.s[voyage.s.length - 1]?.[0] !== "Rome")
      fail("atlas: voyage to Rome does not end at Rome");

    // Acts chapter files carry the journey segment the chapter narrates.
    const acts = byBook.get("Acts");
    const journeyNames = new Set(atlas.journeys.map((j) => j.n));
    for (const ch of ["13", "16", "20", "27", "28"]) {
      const j = acts?.[ch]?.j;
      if (!j) {
        fail(`Acts ${ch}: expected a journey segment`);
        continue;
      }
      const [idx, name, flat] = j;
      if (!Number.isInteger(idx) || !journeyNames.has(name) || !Array.isArray(flat) || flat.length < 4 || flat.length % 2 !== 0)
        fail(`Acts ${ch}: malformed journey segment`);
    }
    if (acts?.["15"]?.j) fail("Acts 15 (Jerusalem council) should have no journey segment");
    if (acts?.["2"]?.j) fail("Acts 2 should have no journey segment");
  }
}

const attribution = path.join(PLACES_DIR, "_attribution.json");
if (!fs.existsSync(attribution)) fail("data/places/_attribution.json missing");

console.log(
  failures
    ? `${failures} failure(s) across ${files.length} books / ${placeCount} place entries`
    : `OK: ${files.length} books, ${placeCount} chapter-place entries, spot checks passed`,
);
process.exit(failures ? 1 : 0);
