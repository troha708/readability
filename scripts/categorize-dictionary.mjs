#!/usr/bin/env node
/**
 * Add a category tag (`cat`, the 5th tuple element) to every entry in
 * data/tyndale-dictionary/_index.json, so the dictionary UI can offer facet
 * chips (People / Places / God-Faith-Theology / Worship-Objects-Daily Life /
 * Scripture-History-Peoples / Other) instead of only an A–Z list.
 *
 * Run AFTER build-tyndale-dictionary.mjs (it rewrites _index.json in place):
 *   node scripts/build-tyndale-dictionary.mjs path/to/Articles
 *   node scripts/categorize-dictionary.mjs
 *
 * Two layers, merged here:
 *  1. DETERMINISTIC (recomputed every run, high precision) — reuses the exact
 *     matchers the other hubs already use, so a dict article is tagged the way
 *     those hubs resolve it:
 *       • person  → title matches the People gazetteer (data/people/_index.json,
 *                   normName as in build-people.mjs)
 *       • place   → title matches the atlas gazetteer (data/places/*.json,
 *                   placeNameCandidates as in src/lib/content/dictionary.ts)
 *       • other   → article cross-references a Tyndale taxonomic hub article
 *                   (Plants / Animals / Birds / Minerals and Metals /
 *                   Stones, Precious) — flora, fauna, and materials
 *                   of the natural world, plus the miscellany below
 *       • context → title is a Bible-book/letter/gospel article
 *       • people/place/nature/… → Tyndale's own trailing "(Person)"/"(Place)"/
 *                   "(Plant)"… disambiguation tag when present
 *       • variant → an alternate-spelling or "See X" redirect stub (hidden from
 *                   browse; still searchable)
 *  2. LLM OVERLAY (frozen, one-time) — data/tyndale-dictionary/_llm-categories.json,
 *     a { id: cat } map for the ~1,973 entries with no structural signal
 *     (theology, worship, objects, daily life, plus people/places/peoples the
 *     gazetteers don't cover). Produced once by a Claude Sonnet classification
 *     pass over each entry's title + first sentence. Regenerate only if the
 *     taxonomy changes.
 *
 * Categories (codes): people | place | theology | culture | context | other
 *   plus the hidden `variant`. The UI groups these into 6 browse facets and
 *   hides `variant`. `other` is the natural-world grab-bag (flora / fauna /
 *   minerals) folded together with a hand-listed tail of concept entries
 *   (OTHER_OVERRIDE) the LLM had parked under `context` — diseases, abstract
 *   virtues, a few objects, cosmology, and astronomy.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DICT = path.join(ROOT, "data", "tyndale-dictionary");
const INDEX = path.join(DICT, "_index.json");
const OVERLAY = path.join(DICT, "_llm-categories.json");

// ── the two authoritative matchers (kept in sync with the codebase) ──
const normName = (s) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^a-z0-9]/g, "");

function placeNameCandidates(title) {
  if (/\(person\)/i.test(title)) return [];
  const clean = (s) => s.replace(/\s+/g, " ").trim();
  const out = [clean(title)];
  const noTag = clean(title.replace(/\s*\([^)]*\)\s*$/, ""));
  if (noTag && noTag !== out[0]) out.push(noTag);
  const ci = title.indexOf(",");
  if (ci > 0) {
    const head = clean(title.slice(0, ci)), tail = clean(title.slice(ci + 1));
    out.push(clean(`${tail} ${head}`));
    let common = 0;
    const h = head.toLowerCase(), t = tail.toLowerCase();
    while (common < h.length && common < t.length && h[common] === t[common]) common++;
    if (head && common >= 3) out.push(head);
  }
  return out;
}

// ── gazetteers ──
function loadPersons() {
  const f = path.join(ROOT, "data", "people", "_index.json");
  if (!fs.existsSync(f)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(f)).entries.map((e) => normName(e[1].replace(/_/g, " "))));
}
function loadPlaces() {
  const dir = path.join(ROOT, "data", "places");
  const set = new Set();
  if (!fs.existsSync(dir)) return set;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.json$/.test(f) || f[0] === "_") continue;
    const d = JSON.parse(fs.readFileSync(path.join(dir, f)));
    for (const ch in d.chapters) for (const rec of d.chapters[ch].p) set.add(normName(String(rec[0])));
  }
  return set;
}

// Tyndale taxonomic hub articles → the facet their members belong to. Members
// are found by inbound cross-reference (an "Acacia" article links to "Plants").
// Flora / fauna / minerals route to the `other` grab-bag; Musical Instruments
// are objects of daily life, so they route to `culture`.
const HUB_CAT = {
  Plants: "other", Animals: "other", Birds: "other",
  "Minerals and Metals": "other", "Stones, Precious": "other",
  "Musical Instruments": "culture",
};
const TAG_CAT = {
  Person: "people", Persons: "people", Place: "place",
  Plant: "other", Animal: "other", Monster: "other",
  Tribe: "context",
  Idol: "theology", Deity: "theology", God: "theology", Yhwh: "theology",
  Measure: "culture", Measurement: "culture", Month: "culture",
  Garment: "culture", Pillar: "culture", Music: "culture",
};

// Concept entries the one-time LLM pass filed under `context` that aren't
// really Scripture / History / Peoples. Moved into `other` by id: diseases,
// abstract virtues & emotions, a few stray objects, cosmology/body terms, and
// astronomy. (Ids are the alphanumeric-only form of the title.)
const OTHER_OVERRIDE = new Set([
  "Disease", "Dropsy", "Dysentery", "Emerod", "EpilepsyEpileptic", "Gangrene",
  "Agape", "Boast", "Desire", "Discipline", "Exhortation", "Fear", "Futility",
  "Gentleness", "Gratitude", "Grief",
  "Besom", "Paper", "Book", "MosesSeat",
  "Age", "Color", "CornersoftheEarth", "Day", "Earth", "Firmament", "Hand", "Path",
  "Arcturus", "Astrology", "Astronomy", "BearAstronomy",
]);
const BOOK_RE = /,\s*(Book|Books|Letter|First Letter|Second Letter|Third Letter|Gospel) (of|to)\b|^Gospel of|,\s*Gospel of/;
const isStub = (s) =>
  /^see\s/i.test(s) ||
  /\bsee\s+[A-Z][\w-]+(\s#\d+)?\.?\s*$/.test(s.trim()) ||
  /^(kjv|alternat\w+|greek|hebrew|douay|latin|variant|another\s+(spelling|form))\b.*(spelling|form|rendering|name|translation|transliteration|term|of)/i.test(s);

function main() {
  if (!fs.existsSync(INDEX)) {
    console.error("No _index.json — run build-tyndale-dictionary.mjs first.");
    process.exit(1);
  }
  const persons = loadPersons();
  const places = loadPlaces();
  const overlay = fs.existsSync(OVERLAY) ? JSON.parse(fs.readFileSync(OVERLAY)) : {};

  // Build the nature-hub id set + a per-article "links to a hub?" map + the
  // first-paragraph snippet, from the per-letter article files.
  const hubCat = {}, linksHub = {}, snippet = {};
  const redirectAlias = {}; // targetId → [alias titles that redirect to it]
  for (const f of fs.readdirSync(DICT)) {
    if (!/^[A-Z#]\.json$/.test(f)) continue;
    const arts = JSON.parse(fs.readFileSync(path.join(DICT, f))).articles;
    for (const id in arts) if (HUB_CAT[arts[id].t]) hubCat[id] = HUB_CAT[arts[id].t];
  }
  for (const f of fs.readdirSync(DICT)) {
    if (!/^[A-Z#]\.json$/.test(f)) continue;
    const arts = JSON.parse(fs.readFileSync(path.join(DICT, f))).articles;
    for (const id in arts) {
      const p = arts[id].b.find((b) => !b.h);
      snippet[id] = (p ? p.runs.map((r) => r.s).join("") : "").replace(/\s+/g, " ").trim().slice(0, 180);
      for (const b of arts[id].b) for (const r of b.runs) if (r.x && hubCat[r.x] && !linksHub[id]) linksHub[id] = hubCat[r.x];
      // Record "See X" redirects so X's article can find the atlas place its
      // (older-spelling) alias holds — e.g. "Dead Sea" ← "Salt Sea".
      if (/^\s*see\s/i.test(snippet[id])) {
        const x = arts[id].b.flatMap((b) => b.runs).find((r) => r.x);
        if (x) (redirectAlias[x.x] ??= []).push(arts[id].t);
      }
    }
  }

  function deterministic(id, title) {
    // A pure "See X" redirect is a stub first of all — even when its name
    // matches a place ("Salt Sea" → Dead Sea): hide it from browse so it can't
    // hold the map its target should show. (Only the narrow leading-"See" form;
    // the looser stub patterns stay below the gazetteer, so a real article like
    // "Behemoth" whose text merely ends near a cross-ref isn't mistaken for one.)
    if (/^see\s/i.test(snippet[id] || "")) return "variant";
    const tag = (title.match(/\(([^)]+)\)\s*$/) || [])[1];
    if (tag && TAG_CAT[tag]) return TAG_CAT[tag];
    if (BOOK_RE.test(title)) return "context";
    if (linksHub[id]) return linksHub[id];
    const n = normName(title);
    if (persons.has(n)) return "people"; // person wins over an ambiguous place
    if (placeNameCandidates(title).some((c) => places.has(normName(c)))) return "place";
    if (isStub(snippet[id] || "")) return "variant";
    return null;
  }

  const data = JSON.parse(fs.readFileSync(INDEX));
  const counts = {};
  let fromOverlay = 0, fallback = 0;
  for (const e of data.entries) {
    const [id, title] = e;
    let cat = deterministic(id, title);
    if (!cat) {
      cat = overlay[id];
      if (cat) fromOverlay++;
    }
    if (!cat) { cat = "context"; fallback++; } // safety net; should be ~0
    if (cat === "nature") cat = "other";       // legacy overlay values
    if (OTHER_OVERRIDE.has(id)) cat = "other"; // misc concepts → Other
    e[4] = cat; // 5th tuple element
    counts[cat] = (counts[cat] || 0) + 1;
  }
  fs.writeFileSync(INDEX, JSON.stringify(data));
  fs.writeFileSync(
    path.join(DICT, "_place-aliases.json"),
    JSON.stringify(redirectAlias),
  );

  const LABEL = {
    people: "People", place: "Places", other: "Other",
    theology: "God, Faith & Theology", culture: "Worship, Objects & Daily Life",
    context: "Scripture, History & Peoples", variant: "(hidden variants/redirects)",
  };
  console.log(`Categorized ${data.entries.length} entries (${fromOverlay} via LLM overlay, ${fallback} fallback):`);
  for (const [c, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${LABEL[c] || c}`);
}

main();
