#!/usr/bin/env node
/**
 * Build the "People" hub data: a per-person record with a family graph, an
 * exhaustive verse index, and a link to that person's existing Bible-dictionary
 * article. Consumed by the people UI the same way the dictionary is
 * (web /api/people + the offline mobile provider).
 *
 * Source: STEPBible TIPNR ("Translators' Individualised Proper Names with all
 * References"), CC BY 4.0 — the structured skeleton: identity, tribe, type,
 * parents/siblings/partners/offspring, and every reference. Human-curated
 * Tyndale House / STEPBible scholarship.
 *   NOTE: TIPNR's own @Brief/@Short/@Article prose is AI-generated (Claude 3
 *   Opus, 2024) and is deliberately NOT used.
 *
 * Prose is NOT stored here. The Bible dictionary already carries a (longer)
 * article on nearly every one of these people, so each record instead links to
 * its dictionary entry (resolved by name at build time) — one Tyndale writeup
 * per person, no duplication. This keeps the People data ~pure CC BY.
 *
 * Usage:
 *   node scripts/build-people.mjs path/to/TIPNR.txt
 *   (reads data/tyndale-dictionary/_index.json if present, for dict links)
 *
 * Output: data/people/
 *   _index.json        { generatedAt, count, entries: [[id, name, desc, letter]] }
 *   _attribution.json
 *   {LETTER}.json      { letter, people: { id: Record } }
 *
 * A Record is:
 *   { n, u, ty, tr?, d?, rel?: { f?, m?, sib?, par?, off? }, refs: [...], dict? }
 *   where a relationship value is { id, n } (links to a real record) or { n }
 *   (an unnamed/unlinked person), plus q:1 when TIPNR marks the link "(?)" —
 *   a traditional identification (e.g. Naamah as Noah's wife) that the text
 *   itself does not state. `dict` is a dictionary article id.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data", "people");
const DICT_INDEX = path.join(__dirname, "..", "data", "tyndale-dictionary", "_index.json");

// TIPNR reference codes (OSIS-ish, with quirks: Nam=Nahum, Jol=Joel,
// Ezk=Ezekiel, Mrk=Mark, Jhn=John, Sng=Song, Php=Philippians …).
const TIPNR_CODES = {
  Gen: "Genesis", Exo: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deu: "Deuteronomy", Jos: "Joshua", Jdg: "Judges", Rut: "Ruth",
  "1Sa": "1 Samuel", "2Sa": "2 Samuel", "1Ki": "1 Kings", "2Ki": "2 Kings",
  "1Ch": "1 Chronicles", "2Ch": "2 Chronicles", Ezr: "Ezra", Neh: "Nehemiah",
  Est: "Esther", Job: "Job", Psa: "Psalms", Pro: "Proverbs", Ecc: "Ecclesiastes",
  Sng: "Song of Solomon", Isa: "Isaiah", Jer: "Jeremiah", Lam: "Lamentations",
  Ezk: "Ezekiel", Dan: "Daniel", Hos: "Hosea", Jol: "Joel", Amo: "Amos",
  Oba: "Obadiah", Jon: "Jonah", Mic: "Micah", Nam: "Nahum", Hab: "Habakkuk",
  Zep: "Zephaniah", Hag: "Haggai", Zec: "Zechariah", Mal: "Malachi",
  Mat: "Matthew", Mrk: "Mark", Luk: "Luke", Jhn: "John", Act: "Acts",
  Rom: "Romans", "1Co": "1 Corinthians", "2Co": "2 Corinthians",
  Gal: "Galatians", Eph: "Ephesians", Php: "Philippians", Col: "Colossians",
  "1Th": "1 Thessalonians", "2Th": "2 Thessalonians", "1Ti": "1 Timothy",
  "2Ti": "2 Timothy", Tit: "Titus", Phm: "Philemon", Heb: "Hebrews",
  Jas: "James", "1Pe": "1 Peter", "2Pe": "2 Peter", "1Jn": "1 John",
  "2Jn": "2 John", "3Jn": "3 John", Jud: "Jude", Rev: "Revelation",
};

const dispName = (book) => (book === "Psalms" ? "Psalm" : book);

/** Parse a single TIPNR ref token ("Exo.4.14", "1Ch.6.3b", "LXX Est.1.1"). */
function parseTipnrRef(tok) {
  const lxx = /^\s*LXX/i.test(tok);
  const t = tok.replace(/^\s*LXX\s*/i, "").trim();
  const m = /^([1-3]?[A-Za-z]{2,4})\.(\d+)\.(\d+)[a-z]?$/.exec(t);
  if (!m) return null;
  const book = TIPNR_CODES[m[1]];
  if (!book) return null;
  return { book, c: +m[2], v: +m[3], lxx };
}

/** URL-safe id from a TIPNR UnifiedName ("Aaron@Exo.4.14-Heb" → "aaron-exo-4-14-heb"). */
function slug(unifiedName) {
  return unifiedName
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** TIPNR uses underscores for unnamed people ("daughter_of_Putiel"). */
const pretty = (name) => name.replace(/_/g, " ").trim();

/** An unnamed/placeholder individual — sorted after named people in the index. */
const isAnon = (name) => /[_#]/.test(name) || /^[a-z]/.test(name);

/** Normalize a name for matching ("Aaron (Person)" / "Paul, the Apostle" → key). */
const normName = (s) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^a-z0-9]/g, "");

/**
 * Parse one relationship link token. TIPNR's "(?)" marks an uncertain link —
 * a traditional identification the source deliberately does not assert
 * ("Naamah@Gen.4.22(?)" as Noah's wife) — kept as q so the UI can qualify it.
 * Its other annotations ("(d)", "(a)", "(f)") are dropped as before.
 */
const parseLink = (s) => {
  const q = /\(\?\)/.test(s);
  const unified = s.replace(/\((?:\?|d|a|f)\)/g, "").trim();
  if (!unified || unified === ">") return null;
  // Not a name: person-place hybrid rows (Eshtemoa, Gibeon…) carry Google
  // Maps / palopenmaps URLs in the relationship columns, which comma-split
  // into URL + coordinate fragments.
  if (/[/:]/.test(unified) || /^[\d\s.,z-]+$/i.test(unified)) return null;
  return { unified, q };
};
const splitList = (s) => (s || "").split(",").map(parseLink).filter(Boolean);

// ── TIPNR ────────────────────────────────────────────────────────────
function parseTipnr(txt) {
  const lines = txt.split(/\r?\n/);
  const people = [];
  let section = null, expectMain = false, cur = null;
  const rawRefsById = new Map(); // id → Set of spelled refs (from sub-records)

  for (const raw of lines) {
    const line = raw.replace(/\t+$/, "");
    if (/^\$=+\s*PERSON/i.test(line)) { section = "PERSON"; expectMain = true; continue; }
    if (/^\$=+\s*PLACE/i.test(line)) { section = "PLACE"; expectMain = true; continue; }
    if (/^\$=+\s*OTHER/i.test(line)) { section = "OTHER"; expectMain = true; continue; }
    if (!line.trim()) continue;

    if (expectMain && section === "PERSON" && !line.startsWith("–") && !line.startsWith("@")) {
      const c = line.split("\t");
      // A few PERSON-section rows are actually places ("founded by" records —
      // Eshtemoa, Gibeon…), typed "Place" in the type column, with map URLs
      // in the relationship columns. The atlas covers places; skip them here.
      if ((c[8] || "").trim() === "Place") { expectMain = false; cur = null; continue; }
      const unified = (c[0] || "").split("=")[0];       // "Aaron@Exo.4.14-Heb"
      const uStrong = (c[0] || "").split("=")[1] || "";
      const [father, mother] = (c[2] || "").split("+").map(parseLink);
      cur = {
        unified,
        id: slug(unified),
        uStrong,
        name: (unified.split("@")[0] || "").trim(),
        desc: (c[1] || "").trim(),
        father, mother,
        siblings: splitList(c[3]),
        partners: splitList(c[4]),
        offspring: splitList(c[5]),
        tribe: (c[6] || "").trim(),
        type: (c[8] || "").trim(),
        refs: [],
      };
      people.push(cur);
      rawRefsById.set(cur.id, new Set());
      expectMain = false;
      continue;
    }
    // Exhaustive refs come from the name-form sub-records (col 5), not the
    // compressed "– Total" line.
    if (cur && line.startsWith("–") && !line.startsWith("– Total")) {
      const c = line.split("\t");
      for (const tok of (c[5] || "").split(";")) {
        const r = parseTipnrRef(tok);
        if (r && !r.lxx) rawRefsById.get(cur.id).add(`${dispName(r.book)} ${r.c}:${r.v}`);
      }
    }
  }
  for (const p of people) p.refs = [...rawRefsById.get(p.id)];
  return people;
}

/**
 * normName → best dictionary article id FOR A PERSON. When a headword collides
 * with a place ("Adam (Person)" vs "Adam (Place)"), prefer the person article
 * and never fall back to the place — drop the link if only a place exists.
 * Signals: the title's "(Person)"/"(Place)" tag, and the _index.json category
 * (5th tuple slot from categorize-dictionary.mjs) when present. Within the
 * person candidates, the plain headword ("Aaron") beats a longer title.
 */
function loadDictMap() {
  if (!fs.existsSync(DICT_INDEX)) return new Map();
  const entries = JSON.parse(fs.readFileSync(DICT_INDEX, "utf-8")).entries || [];
  const groups = new Map(); // normName → [{ id, title, cat }]
  for (const [id, title, , , cat] of entries) {
    const k = normName(title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ id, title, cat });
  }
  const isPlace = (c) => /\(place\)/i.test(c.title) || c.cat === "place";
  const isPerson = (c) => /\(person\)/i.test(c.title) || c.cat === "people";
  const m = new Map();
  for (const [k, cands] of groups) {
    const pool = cands.filter((c) => !isPlace(c));
    if (!pool.length) continue; // only place article(s) → a person must not link here
    pool.sort(
      (a, b) =>
        Number(isPerson(b)) - Number(isPerson(a)) ||
        Number(a.cat === "variant") - Number(b.cat === "variant") ||
        a.title.length - b.title.length,
    );
    m.set(k, pool[0].id);
  }
  return m;
}

// ── Build ────────────────────────────────────────────────────────────
function main() {
  const tipnrPath = process.argv[2];
  if (!tipnrPath || !fs.existsSync(tipnrPath)) {
    console.error("Usage: node scripts/build-people.mjs path/to/TIPNR.txt");
    process.exit(1);
  }
  const people = parseTipnr(fs.readFileSync(tipnrPath, "utf-8"));
  const known = new Set(people.map((p) => p.unified));
  const idByUnified = new Map(people.map((p) => [p.unified, p.id]));
  const dictMap = loadDictMap();

  const link = ({ unified, q }) => {
    const name = pretty((unified.split("@")[0] || "").trim());
    const rec = known.has(unified) ? { id: idByUnified.get(unified), n: name } : { n: name };
    if (q) rec.q = 1;
    return rec;
  };

  const shards = new Map(); // letter → { id: record }
  const byDict = {}; // dict article id → [personId, …] (for the dictionary merge)
  const entries = [];
  let withDict = 0;
  for (const p of people) {
    const letter = /^[A-Za-z]/.test(p.name) ? p.name[0].toUpperCase() : "#";
    const rel = {};
    if (p.father) rel.f = link(p.father);
    if (p.mother) rel.m = link(p.mother);
    if (p.siblings.length) rel.sib = p.siblings.map(link);
    if (p.partners.length) rel.par = p.partners.map(link);
    if (p.offspring.length) rel.off = p.offspring.map(link);

    const rec = { n: pretty(p.name), u: p.uStrong, ty: p.type };
    if (p.tribe && p.tribe !== ">") rec.tr = p.tribe;
    if (p.desc) rec.d = p.desc;
    if (Object.keys(rel).length) rec.rel = rel;
    rec.refs = p.refs;
    const dictId = dictMap.get(normName(p.name));
    if (dictId) { rec.dict = dictId; withDict++; (byDict[dictId] ??= []).push(p.id); }

    if (!shards.has(letter)) shards.set(letter, {});
    shards.get(letter)[p.id] = rec;
    entries.push({ tuple: [p.id, pretty(p.name), p.desc, letter], anon: isAnon(p.name) });
  }
  // Named people first within each letter; unnamed placeholders sink to the end.
  entries.sort((a, b) => Number(a.anon) - Number(b.anon) || a.tuple[1].localeCompare(b.tuple[1]));
  const indexEntries = entries.map((e) => e.tuple);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), count: indexEntries.length, entries: indexEntries }),
  );
  for (const [letter, ppl] of shards) {
    fs.writeFileSync(path.join(OUT_DIR, `${letter}.json`), JSON.stringify({ letter, people: ppl }));
  }
  // Reverse map consumed by the dictionary: a person article shows the family
  // tree(s) + verse index of the individual(s) that share its headword.
  fs.writeFileSync(path.join(OUT_DIR, "_by-dict.json"), JSON.stringify(byDict));
  fs.writeFileSync(
    path.join(OUT_DIR, "_attribution.json"),
    JSON.stringify(
      {
        source: "STEPBible TIPNR (Translators' Individualised Proper Names with all References), based on work at Tyndale House Cambridge",
        license: "CC BY 4.0",
        url: "https://github.com/STEPBible/STEPBible-Data",
        notes:
          "Identity, tribe, type, family relationships (parents/siblings/partners/offspring), and the exhaustive reference index are derived from TIPNR by scripts/build-people.mjs. TIPNR's own AI-generated @Brief/@Short/@Article prose is NOT used; prose is provided by linking to the Tyndale Open Bible Dictionary article for each person.",
      },
      null,
      2,
    ) + "\n",
  );

  // ── Report ──
  const idxSize = fs.statSync(path.join(OUT_DIR, "_index.json")).size;
  const totalSize = fs.readdirSync(OUT_DIR).reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`People: ${people.length}  |  with dictionary link: ${withDict}`);
  console.log(`_index.json: ${(idxSize / 1024).toFixed(0)} KB  |  total data/people: ${(totalSize / 1024).toFixed(0)} KB`);
}

main();
