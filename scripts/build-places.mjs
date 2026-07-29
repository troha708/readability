#!/usr/bin/env node
/**
 * Convert the OpenBible.info Bible Geocoding dataset (CC BY 4.0,
 * github.com/openbibleinfo/Bible-Geocoding-Data) into per-book chapter→place
 * lookup JSON for the reader's chapter map and /api/places.
 *
 * Only representative-point coordinates are used (plain CC BY); the dataset's
 * OSM-derived precise geometries (ODbL) are not touched.
 *
 * A place is included in a chapter when at least MIN_NAME_TRANSLATIONS of the
 * dataset's ten reference translations render it as a proper name in some
 * verse of that chapter — this keeps markers aligned with names the reader
 * can actually see in the text, and drops single-translation idiosyncrasies.
 * The location comes from the dataset's top-ranked identification; when the
 * source votes are split across candidates the place is flagged uncertain.
 * Places with no locatable identification (Eden, Azazel...) are listed
 * separately as unlocated so the UI can be honest about them.
 *
 * Output: data/places/<Book>.json
 *   { "book": "...", "chapters": { "12": {
 *       "p": [[name, x, y, kind, uncertain, [verses], modernName, link], ...],
 *       "u": [[name, [verses]], ...] } } }
 * x/y are integer grid units (see scripts/map-projection.mjs);
 * kind: 0 settlement, 1 water, 2 region/people, 3 natural feature;
 * link is the openbible.info path piece "<id>/<slug>" — the place's page
 * there lists the sources attesting each identification, which is what makes
 * every marker verifiable.
 *
 * Also emits public/maps/atlas.json for the full-screen atlas page: every
 * located place with its verse references across the whole Bible, keyed to a
 * canon-ordered book list:
 *   { v, books: [...66 names], places: [[name, x, y, kind, uncertain,
 *     modern, link, [[bookIdx, chapter, [verses]], ...]], ...],
 *     unlocated: [[name, link, refs], ...] }
 *
 * Prerequisite (~15 MB, not committed):
 *   cd %TEMP%
 *   curl -sLO https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/ancient.jsonl
 *   curl -sLO https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/modern.jsonl
 *
 * Usage: node scripts/build-places.mjs --src <dir-with-jsonl-files>
 *
 * Run scripts/validate-places.mjs afterwards.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GRID_WIDTH, GRID_HEIGHT, project } from "./map-projection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SRC = arg("src");
if (!SRC || !fs.existsSync(SRC)) {
  console.error("Usage: node scripts/build-places.mjs --src <dir-with-ancient.jsonl+modern.jsonl>");
  process.exit(1);
}

const MIN_NAME_TRANSLATIONS = 2;
// A top-ranked identification owning less than this share of the (positive)
// source votes across all candidates is presented as uncertain.
const CERTAIN_VOTE_SHARE = 0.65;

// OSIS book code → app book name (66-book Protestant canon).
const OSIS_TO_BOOK = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deut: "Deuteronomy", Josh: "Joshua", Judg: "Judges", Ruth: "Ruth",
  "1Sam": "1 Samuel", "2Sam": "2 Samuel", "1Kgs": "1 Kings", "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles", "2Chr": "2 Chronicles", Ezra: "Ezra", Neh: "Nehemiah",
  Esth: "Esther", Job: "Job", Ps: "Psalms", Prov: "Proverbs",
  Eccl: "Ecclesiastes", Song: "Song of Solomon", Isa: "Isaiah", Jer: "Jeremiah",
  Lam: "Lamentations", Ezek: "Ezekiel", Dan: "Daniel", Hos: "Hosea",
  Joel: "Joel", Amos: "Amos", Obad: "Obadiah", Jonah: "Jonah", Mic: "Micah",
  Nah: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah", Hag: "Haggai",
  Zech: "Zechariah", Mal: "Malachi", Matt: "Matthew", Mark: "Mark",
  Luke: "Luke", John: "John", Acts: "Acts", Rom: "Romans",
  "1Cor": "1 Corinthians", "2Cor": "2 Corinthians", Gal: "Galatians",
  Eph: "Ephesians", Phil: "Philippians", Col: "Colossians",
  "1Thess": "1 Thessalonians", "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy", "2Tim": "2 Timothy", Titus: "Titus", Phlm: "Philemon",
  Heb: "Hebrews", Jas: "James", "1Pet": "1 Peter", "2Pet": "2 Peter",
  "1John": "1 John", "2John": "2 John", "3John": "3 John", Jude: "Jude",
  Rev: "Revelation",
};

// Dataset resolution type → marker kind.
const KIND_WATER = new Set(["river", "body of water", "spring", "well", "pool", "wadi", "canal"]);
const KIND_REGION = new Set(["region", "people group", "road", "field"]);
const KIND_NATURAL = new Set([
  "mountain", "mountain range", "mountain ridge", "mountain pass", "hill",
  "cliff", "rock", "promontory", "valley", "island", "tree", "forest",
  "natural area", "garden", "stone heap",
]);

function kindOf(type) {
  if (KIND_WATER.has(type)) return 1;
  if (KIND_REGION.has(type)) return 2;
  if (KIND_NATURAL.has(type)) return 3;
  return 0; // settlement, campsite, structure, gate, altar, ...
}

function readJsonl(file) {
  return fs
    .readFileSync(path.join(SRC, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const CANON_ORDER = Object.values(OSIS_TO_BOOK);
const BOOK_INDEX = new Map(CANON_ORDER.map((b, i) => [b, i]));

const ancient = readJsonl("ancient.jsonl");
const modernById = new Map(readJsonl("modern.jsonl").map((m) => [m.id, m]));

// per book → per chapter → { p: Map(dedupKey → entry), u: Map(name → entry) }
const byBook = new Map();
// Whole-Bible view for the atlas page: dedupKey → { entry, refs: Map }
const atlasPlaces = new Map();
const atlasUnlocated = new Map();
// rec.id → located entry (or null), for the journey-stop resolver.
const entryByRecId = new Map();
let locatedPlaces = 0;
let unlocatedPlaces = 0;
let uncertainPlaces = 0;
let skippedVerses = 0;

for (const rec of ancient) {
  const keptVerses = (rec.verses ?? []).filter(
    (v) => (v.instance_types?.name ?? 0) >= MIN_NAME_TRANSLATIONS,
  );
  if (keptVerses.length === 0) continue;

  const name = rec.friendly_id.replace(/ \d+$/, "");
  const idents = rec.identifications ?? [];
  const top = idents[0];
  const resolution = (top?.resolutions ?? []).find((r) => r.lonlat);

  let entry = null;
  const [lon, lat] = resolution
    ? resolution.lonlat.split(",").map(Number)
    : [NaN, NaN];
  const [px, py] = resolution ? project(lon, lat) : [NaN, NaN];
  const inExtent =
    resolution && px >= 0 && px <= GRID_WIDTH && py >= 0 && py <= GRID_HEIGHT;
  if (resolution && !inExtent) {
    // A future dataset refresh could place something outside the basemap;
    // pinning it to the map edge would show a wrong location. Treat it as
    // unlocated instead, and say so loudly.
    console.warn(
      `WARNING: ${rec.friendly_id} projects outside the basemap extent (${lon},${lat}) — treated as unlocated`,
    );
  }
  if (inExtent) {
    const [x, y] = [px, py];
    const votes = idents.map((id) => Math.max(0, id.score?.vote_total ?? 0));
    const totalVotes = votes.reduce((a, b) => a + b, 0);
    const uncertain =
      idents.length > 1 &&
      (votes[0] === 0 || votes[0] / totalVotes < CERTAIN_VOTE_SHARE);

    // "near modern X" for the card, when the dataset names a distinct modern
    // basis for the identification. Regions get no modern name: their
    // representative point (e.g. Egypt → Ain Shams) is an anchor, not a
    // modern equivalent.
    const kind = kindOf(resolution.type);
    const modern = kind === 2 ? undefined : modernById.get(resolution.modern_basis_id);
    let modernName = "";
    if (modern && modern.friendly_id.toLowerCase() !== name.toLowerCase()) {
      modernName = modern.preceding_article
        ? `${modern.preceding_article} ${modern.friendly_id}`
        : modern.friendly_id;
    }

    entry = {
      name,
      x: Math.round(x),
      y: Math.round(y),
      kind,
      uncertain: uncertain ? 1 : 0,
      modernName,
      link: `${rec.id}/${rec.url_slug}`,
    };
    locatedPlaces++;
    if (uncertain) uncertainPlaces++;
  } else {
    unlocatedPlaces++;
  }
  entryByRecId.set(rec.id, entry);

  for (const v of keptVerses) {
    const m = v.osis.match(/^([0-9A-Za-z]+)\.(\d+)\.(\d+)$/);
    if (!m) {
      skippedVerses++;
      continue;
    }
    const book = OSIS_TO_BOOK[m[1]];
    if (!book) {
      skippedVerses++;
      continue;
    }
    const chapter = m[2];
    const verse = parseInt(m[3], 10);

    let chapters = byBook.get(book);
    if (!chapters) {
      chapters = new Map();
      byBook.set(book, chapters);
    }
    let ch = chapters.get(chapter);
    if (!ch) {
      ch = { p: new Map(), u: new Map() };
      chapters.set(chapter, ch);
    }
    if (entry) {
      // Two ancient places can resolve to the same name and spot in one
      // chapter (e.g. the two figurative Babylons that both resolve to Rome);
      // merge their verse lists (the first record's link wins).
      const key = `${entry.name}|${entry.x}|${entry.y}`;
      let dedup = ch.p.get(key);
      if (!dedup) {
        dedup = { ...entry, verses: new Set() };
        ch.p.set(key, dedup);
      }
      dedup.verses.add(verse);

      let atlas = atlasPlaces.get(key);
      if (!atlas) {
        atlas = { entry, refs: new Map() };
        atlasPlaces.set(key, atlas);
      }
      addRef(atlas.refs, book, chapter, verse);
    } else {
      let dedup = ch.u.get(rec.friendly_id);
      if (!dedup) {
        dedup = { name, verses: new Set() };
        ch.u.set(rec.friendly_id, dedup);
      }
      dedup.verses.add(verse);

      let atlas = atlasUnlocated.get(rec.friendly_id);
      if (!atlas) {
        atlas = { name, link: `${rec.id}/${rec.url_slug}`, refs: new Map() };
        atlasUnlocated.set(rec.friendly_id, atlas);
      }
      addRef(atlas.refs, book, chapter, verse);
    }
  }
}

function addRef(refs, book, chapter, verse) {
  const key = `${book}|${chapter}`;
  let set = refs.get(key);
  if (!set) {
    set = new Set();
    refs.set(key, set);
  }
  set.add(verse);
}

/** refs Map("Book|ch" → Set(verses)) → [[bookIdx, ch, [verses]], ...] in canon order. */
function packRefs(refs) {
  return [...refs.entries()]
    .map(([key, verses]) => {
      const [book, ch] = key.split("|");
      return [BOOK_INDEX.get(book), parseInt(ch, 10), [...verses].sort((a, b) => a - b)];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// ── Paul's journeys ──────────────────────────────────────────────────
// Stops are listed ONLY where Acts names the place, in narrative order
// (returns retrace the same cities). Each stop is [name, lookupOsis,
// displayRef?]: the resolver finds the unique ancient record whose stripped
// name matches AND whose verse list contains lookupOsis — so a wrong verse
// or the wrong Antioch fails the build instead of plotting silently. The
// connecting lines are drawn by the client as explicitly-approximate arcs.
const JOURNEYS = [
  {
    name: "Paul's 1st journey",
    stops: [
      ["Antioch", "Acts.13.1"], ["Seleucia", "Acts.13.4"], ["Salamis", "Acts.13.5"],
      ["Paphos", "Acts.13.6"], ["Perga", "Acts.13.13"], ["Antioch", "Acts.13.14"],
      ["Iconium", "Acts.13.51"], ["Lystra", "Acts.14.6"], ["Derbe", "Acts.14.6", "14:20"],
      ["Lystra", "Acts.14.21"], ["Iconium", "Acts.14.21"], ["Antioch", "Acts.14.21"],
      ["Perga", "Acts.14.25"], ["Attalia", "Acts.14.25"], ["Antioch", "Acts.14.26"],
    ],
  },
  {
    name: "Paul's 2nd journey",
    stops: [
      ["Antioch", "Acts.15.35"], ["Derbe", "Acts.16.1"], ["Lystra", "Acts.16.1"],
      ["Troas", "Acts.16.8"], ["Samothrace", "Acts.16.11"], ["Neapolis", "Acts.16.11"],
      ["Philippi", "Acts.16.12"], ["Amphipolis", "Acts.17.1"], ["Apollonia", "Acts.17.1"],
      ["Thessalonica", "Acts.17.1"], ["Berea", "Acts.17.10"], ["Athens", "Acts.17.15"],
      ["Corinth", "Acts.18.1"], ["Cenchreae", "Acts.18.18"], ["Ephesus", "Acts.18.19"],
      ["Caesarea", "Acts.18.22"], ["Antioch", "Acts.18.22"],
    ],
  },
  {
    name: "Paul's 3rd journey",
    stops: [
      ["Antioch", "Acts.18.22", "18:23"], ["Ephesus", "Acts.19.1"], ["Philippi", "Acts.20.6"],
      ["Troas", "Acts.20.6"], ["Assos", "Acts.20.13"], ["Mitylene", "Acts.20.14"],
      ["Chios", "Acts.20.15"], ["Samos", "Acts.20.15"], ["Miletus", "Acts.20.15"],
      ["Cos", "Acts.21.1"], ["Rhodes", "Acts.21.1"], ["Patara", "Acts.21.1"],
      ["Tyre", "Acts.21.3"], ["Ptolemais", "Acts.21.7"], ["Caesarea", "Acts.21.8"],
      ["Jerusalem", "Acts.21.17"],
    ],
  },
  {
    name: "Voyage to Rome",
    stops: [
      ["Caesarea", "Acts.25.13", "27:1"], ["Sidon", "Acts.27.3"], ["Myra", "Acts.27.5"],
      ["Cnidus", "Acts.27.7"], ["Salmone", "Acts.27.7"], ["Fair Havens", "Acts.27.8"],
      ["Cauda", "Acts.27.16"], ["Malta", "Acts.28.1"], ["Syracuse", "Acts.28.12"],
      ["Rhegium", "Acts.28.13"], ["Puteoli", "Acts.28.13"],
      ["Forum of Appius", "Acts.28.15"], ["Three Taverns", "Acts.28.15"],
      ["Rome", "Acts.28.16"],
    ],
  },
];

function resolveJourneys() {
  const out = [];
  const errors = [];
  for (const journey of JOURNEYS) {
    const stops = [];
    const stopChapters = [];
    for (const [name, osis, displayRef] of journey.stops) {
      const matches = ancient.filter(
        (r) =>
          r.friendly_id.replace(/ \d+$/, "") === name &&
          (r.verses ?? []).some((v) => v.osis === osis),
      );
      if (matches.length !== 1) {
        errors.push(`${journey.name}: "${name}" @ ${osis} matched ${matches.length} records`);
        continue;
      }
      const entry = entryByRecId.get(matches[0].id);
      if (!entry) {
        errors.push(`${journey.name}: "${name}" @ ${osis} resolved but has no location`);
        continue;
      }
      const ref = displayRef ?? osis.replace(/^Acts\./, "").replace(".", ":");
      stops.push([entry.name, entry.x, entry.y, ref]);
      stopChapters.push(parseInt(ref.split(":")[0], 10));
    }
    out.push({ n: journey.name, s: stops, chapters: stopChapters });
  }
  if (errors.length) {
    console.error("JOURNEY RESOLUTION FAILED:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  return out;
}

const resolvedJourneys = resolveJourneys();

// The reader's Acts chapter maps get the journey segment the chapter itself
// narrates: the maximal run of consecutive stops named in that chapter (two
// or more — a lone stop is just a place). Where a chapter touches two
// journeys, the longer run wins.
const actsSegments = new Map(); // chapter (string) → [journeyIdx, name, flatCoords]
resolvedJourneys.forEach((j, jIdx) => {
  let run = [];
  let runCh = null;
  const flush = () => {
    if (runCh !== null && run.length >= 2) {
      const key = String(runCh);
      const existing = actsSegments.get(key);
      if (!existing || existing[2].length / 2 < run.length) {
        actsSegments.set(key, [jIdx, j.n, run.flatMap((s) => [s[1], s[2]])]);
      }
    }
  };
  j.s.forEach((s, i) => {
    if (j.chapters[i] !== runCh) {
      flush();
      runCh = j.chapters[i];
      run = [];
    }
    run.push(s);
  });
  flush();
});

const OUT_DIR = path.join(root, "data", "places");
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const old of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, old));

let chapterCount = 0;
for (const [book, chapters] of byBook) {
  const out = {};
  const keys = [...chapters.keys()].sort((a, b) => Number(a) - Number(b));
  for (const key of keys) {
    const ch = chapters.get(key);
    const places = [...ch.p.values()]
      .map((e) => ({ ...e, verses: [...e.verses].sort((a, b) => a - b) }))
      .sort((a, b) => a.verses[0] - b.verses[0] || a.name.localeCompare(b.name))
      .map((e) => [e.name, e.x, e.y, e.kind, e.uncertain, e.verses, e.modernName, e.link]);
    const unlocated = [...ch.u.values()]
      .map((e) => ({ ...e, verses: [...e.verses].sort((a, b) => a - b) }))
      .sort((a, b) => a.verses[0] - b.verses[0] || a.name.localeCompare(b.name))
      .map((e) => [e.name, e.verses]);
    out[key] = { p: places };
    if (unlocated.length) out[key].u = unlocated;
    if (book === "Acts" && actsSegments.has(key)) out[key].j = actsSegments.get(key);
    chapterCount++;
  }
  fs.writeFileSync(
    path.join(OUT_DIR, `${book}.json`),
    JSON.stringify({ book, chapters: out }),
  );
}

fs.writeFileSync(
  path.join(OUT_DIR, "_attribution.json"),
  JSON.stringify(
    {
      source: "OpenBible.info Bible Geocoding data (representative points)",
      license: "CC BY 4.0",
      url: "https://www.openbible.info/geo/",
      notes:
        "Top-ranked identification per ancient place; uncertainty flagged from the dataset's source votes. OSM-derived precise geometries (ODbL) are not used.",
    },
    null,
    2,
  ),
);

// Whole-Bible atlas for /try/bible/map.
const atlas = {
  v: 1,
  books: CANON_ORDER,
  places: [...atlasPlaces.values()]
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name))
    .map(({ entry, refs }) => [
      entry.name,
      entry.x,
      entry.y,
      entry.kind,
      entry.uncertain,
      entry.modernName,
      entry.link,
      packRefs(refs),
    ]),
  unlocated: [...atlasUnlocated.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, link, refs }) => [name, link, packRefs(refs)]),
  journeys: resolvedJourneys.map(({ n, s }) => ({ n, s })),
};
const MAPS_DIR = path.join(root, "public", "maps");
fs.mkdirSync(MAPS_DIR, { recursive: true });
const atlasFile = path.join(MAPS_DIR, "atlas.json");
fs.writeFileSync(atlasFile, JSON.stringify(atlas));

const totalBytes = fs
  .readdirSync(OUT_DIR)
  .reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0);
console.log(
  `${byBook.size} books, ${chapterCount} chapters with places · ` +
    `${locatedPlaces} located (${uncertainPlaces} uncertain), ${unlocatedPlaces} unlocated, ` +
    `${skippedVerses} verse refs skipped → data/places/ (${(totalBytes / 1024).toFixed(0)} KB) · ` +
    `atlas: ${atlas.places.length} places → public/maps/atlas.json (${(fs.statSync(atlasFile).size / 1024).toFixed(0)} KB)`,
);
