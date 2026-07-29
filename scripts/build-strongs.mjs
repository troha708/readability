#!/usr/bin/env node
/**
 * Build the original-language word-study data for the verse sheet:
 *
 * 1. data/strongs/<Book>.json — per-verse Strong's numbers from the STEPBible
 *    "Translators Amalgamated" tagging (TAGNT for the Greek NT, TAHOT for the
 *    Hebrew OT; CC BY 4.0, Tyndale House Cambridge). Unlike the previous
 *    source (ebible ASV machine alignment, which mistagged e.g. John 1:1's
 *    "with" as G1722 and left "beginning" untagged), STEPBible tags every
 *    word of the original text and carries a per-word English gloss based on
 *    the Berean Study Bible — the app's default translation.
 *
 *    Output is BSB-driven: for every verse in data/BSB, words are taken from
 *    the KJV-alternate reference when STEPBible marks one (BSB follows KJV
 *    numbering at seams like 2 Cor 13:14), else the primary NRSV reference;
 *    NA-text words are preferred, falling back to Traditional-text words for
 *    verses the NA text lacks (e.g. John 7:53–8:11, which the BSB prints).
 *    Every translated word is emitted in text order (an interlinear: read
 *    down the surface column and you read the verse); only untranslated
 *    words (e.g. the Hebrew object marker) are skipped.
 *
 *    Each entry is [gloss, strongs, surface, translit]: the surface form is
 *    the word as written in the text (θεόν in John 1:1, not the dictionary
 *    form θεός the lexicon shows), with a transliteration of that form.
 *
 * 2. data/lexicon/strongs.json — the openscriptures Strong's dictionaries
 *    (Greek + Hebrew, CC-BY-SA) trimmed to lemma / transliteration /
 *    definition / KJV renderings. Only rebuilt when --greek/--hebrew given.
 *
 * Usage:
 *   node scripts/build-strongs.mjs --src <stepbible-dir> [--greek <sg.js> --hebrew <sh.js>]
 *
 * <stepbible-dir> holds the six "TAGNT/TAHOT * - Translators Amalgamated *"
 * files from github.com/STEPBible/STEPBible-Data ("Translators Amalgamated
 * OT+NT" folder). Run scripts/validate-strongs.mjs afterwards.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SRC_DIR = arg("src");
const GREEK = arg("greek");
const HEBREW = arg("hebrew");
if (!SRC_DIR) {
  console.error(
    "Usage: node scripts/build-strongs.mjs --src <stepbible-dir> [--greek <sg.js> --hebrew <sh.js>]",
  );
  process.exit(1);
}

const CODE_TO_BOOK = {
  Gen: "Genesis", Exo: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deu: "Deuteronomy", Jos: "Joshua", Jdg: "Judges", Rut: "Ruth",
  "1Sa": "1 Samuel", "2Sa": "2 Samuel", "1Ki": "1 Kings", "2Ki": "2 Kings",
  "1Ch": "1 Chronicles", "2Ch": "2 Chronicles", Ezr: "Ezra", Neh: "Nehemiah",
  Est: "Esther", Job: "Job", Psa: "Psalms", Pro: "Proverbs",
  Ecc: "Ecclesiastes", Sng: "Song of Solomon", Isa: "Isaiah", Jer: "Jeremiah",
  Lam: "Lamentations", Ezk: "Ezekiel", Dan: "Daniel", Hos: "Hosea",
  Jol: "Joel", Amo: "Amos", Oba: "Obadiah", Jon: "Jonah", Mic: "Micah",
  Nam: "Nahum", Hab: "Habakkuk", Zep: "Zephaniah", Hag: "Haggai",
  Zec: "Zechariah", Mal: "Malachi", Mat: "Matthew", Mrk: "Mark",
  Luk: "Luke", Jhn: "John", Act: "Acts", Rom: "Romans",
  "1Co": "1 Corinthians", "2Co": "2 Corinthians", Gal: "Galatians",
  Eph: "Ephesians", Php: "Philippians", Col: "Colossians",
  "1Th": "1 Thessalonians", "2Th": "2 Thessalonians", "1Ti": "1 Timothy",
  "2Ti": "2 Timothy", Tit: "Titus", Phm: "Philemon", Heb: "Hebrews",
  Jas: "James", "1Pe": "1 Peter", "2Pe": "2 Peter", "1Jn": "1 John",
  "2Jn": "2 John", "3Jn": "3 John", Jud: "Jude", Rev: "Revelation",
};

/**
 * "G0746" → "G746", "H7225G" → "H7225", "H1254A" → "H1254" — strip zero
 * padding and STEPBible's disambiguation suffix so numbers match the
 * openscriptures dictionary keys. Returns null for STEPBible's H9xxx
 * affix/punctuation extensions, which have no dictionary entry.
 */
function normalizeNumber(n) {
  const m = n.match(/^([GH])0*(\d+)[A-Za-z]?$/);
  if (!m) return null;
  if (m[1] === "H" && parseInt(m[2], 10) >= 9000) return null;
  return `${m[1]}${m[2]}`;
}

/**
 * Clean a STEPBible English gloss for display: drop "[the]"-style additions
 * and "<obj.>"-style untranslated markers, morpheme slashes, punctuation.
 * Returns "" when nothing translatable remains (the word is then skipped —
 * dedup anchors each number to its first *translated* occurrence).
 */
function cleanGloss(g) {
  return g
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\/ ?/g, " ")
    .replace(/[.,;·:!?"“”()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Jhn.1.1#01=NKO" → primary ref; "2Co.13.13[13.14]#01=NKO" also carries the
 * KJV-alternate ref in square brackets (round/curly alternates — NA, Hebrew,
 * others — are ignored; the primary ref is already NRSV/English).
 */
function parseRef(field) {
  const m = field.match(
    /^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)([^#]*)#\d+[a-z]?=(.+)$/,
  );
  if (!m) return null;
  const alt = m[4].match(/\[(?:[1-3]?[A-Za-z]{2,3}\.)?(\d+)\.(\d+)\]/);
  return {
    code: m[1],
    key: `${m[2]}:${m[3]}`,
    altKey: alt ? `${alt[1]}:${alt[2]}` : null,
    type: m[5],
  };
}

const GREEK_LETTERS = {
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "ē", θ: "th",
  ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p",
  ρ: "r", σ: "s", ς: "s", τ: "t", υ: "u", φ: "ph", χ: "ch", ψ: "ps", ω: "ō",
};

/**
 * Mechanical Greek transliteration (ē/ō macrons, th/ph/ch/ps, h from a rough
 * breathing, rh for initial ῥ, γ→n before γ/κ/ξ/χ). STEPBible ships its own
 * transliteration but appends a disambiguating letter whenever two distinct
 * forms would transliterate identically (ἀρχῇ → "archēa" because ἀρχὴ is
 * already "archē"), so it can't be displayed as-is; it's used as a
 * cross-check on this function instead (translitMismatch stat).
 */
function translitGreek(word) {
  const nfd = word.normalize("NFD");
  const rough = nfd.includes("\u0314"); // combining rough breathing
  // strip combining marks (accents, breathings, iota subscript U+0345)
  const letters = [...nfd].filter((c) => c < "\u0300" || c > "\u036f");
  const isCap = letters.length > 0 && letters[0] !== letters[0].toLowerCase();
  const lower = letters.map((c) => c.toLowerCase());
  let out = "";
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if (c === "\u03b3" && "\u03b3\u03ba\u03be\u03c7".includes(lower[i + 1] ?? "")) {
      out += "n"; // γ before γ/κ/ξ/χ
      continue;
    }
    out += GREEK_LETTERS[c] ?? c;
  }
  if (rough) out = out.startsWith("r") ? `rh${out.slice(1)}` : `h${out}`;
  if (isCap && out) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

/** "θεόν, ¶" → "θεόν" — drop ¶ / NA-bracket markers and edge punctuation. */
function cleanGreekSurface(s) {
  return s
    .replace(/[[\]\u00b6\u00ac]/g, "") // ¶ pilcrow, ¬
    .replace(/[,.;:\u0387\u037e]+$/g, "") // incl. ano teleia, Greek question mark
    .trim();
}

/**
 * "הָ/אָֽרֶץ\׃" → "הָאָרֶץ" — drop the "\"-suffixed punctuation tokens (sof
 * pasuq etc.), morpheme slashes, and cantillation accents + meteg (vowel
 * points U+05B0–U+05BC stay legible).
 */
function cleanHebrewSurface(s) {
  return s
    .split("\\")[0]
    .replace(/\//g, "")
    .replace(/[\u0591-\u05af\u05bd]/g, "")
    .trim();
}

/**
 * "ha./'A.retz" → "ha'aretz" — drop syllable dots and morpheme slashes,
 * lowercase the stress capitals. Aleph/ayin apostrophes and hyphens stay.
 */
function cleanHebrewTranslit(s) {
  return s.replace(/[/.[\]]/g, "").toLowerCase().trim();
}

// ── 1. Per-verse word lists from STEPBible TAGNT/TAHOT ──────────────

const STRONGS_OUT = path.join(root, "data", "strongs");
const BSB_DIR = path.join(root, "data", "BSB");
fs.mkdirSync(STRONGS_OUT, { recursive: true });

// STEPBible's extended numbers (e.g. G6063 for εἴδω) have no entry in the
// openscriptures dictionaries the UI joins against, and both serving paths
// drop unresolvable numbers — so resolve them by lemma instead, and only
// give up when the lemma is unknown too.
const lexPath = path.join(root, "data", "lexicon", "strongs.json");
const lexicon = fs.existsSync(lexPath)
  ? JSON.parse(fs.readFileSync(lexPath, "utf8"))
  : {};
const lemmaToNum = new Map();
for (const [num, e] of Object.entries(lexicon)) {
  if (e.lemma && !lemmaToNum.has(e.lemma)) lemmaToNum.set(e.lemma, num);
}

const stats = {
  lemmaResolved: 0,
  unresolved: 0,
  skippedUntranslated: 0,
  altFilled: 0,
  traditionalFallback: 0,
  missing: 0,
  translitMismatch: 0,
};
const translitMismatchSamples = [];

// book → key → {na: [{word,num,surface,translit}], all: [...]}, same shape
// for KJV-alternate refs. `all` includes every word; `na` only NA-text words.
const primaryIdx = new Map();
const altIdx = new Map();

function bucket(idx, book, key) {
  let verses = idx.get(book);
  if (!verses) idx.set(book, (verses = new Map()));
  let b = verses.get(key);
  if (!b) verses.set(key, (b = { na: [], all: [] }));
  return b;
}

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => /^TA[GH]/.test(f) && f.endsWith(".txt"));
if (files.length === 0) {
  console.error(`No TAGNT/TAHOT files found in ${SRC_DIR}`);
  process.exit(1);
}

for (const file of files) {
  const isGreek = file.startsWith("TAGNT");
  const text = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 9) continue;
    const ref = parseRef(cols[0]);
    if (!ref) continue;
    const bookName = CODE_TO_BOOK[ref.code];
    if (!bookName) continue;

    let num;
    let isNA;
    if (isGreek) {
      isNA = /[Nn]/.test(ref.type);
      const sm = cols[3]?.match(/^([GH]\d+[A-Za-z]?)=/);
      num = sm ? normalizeNumber(sm[1]) : null;
    } else {
      // TAHOT: the main (content-morpheme) dStrong sits in its own column;
      // the English gloss one column later than TAGNT (col 2 is translit).
      // Leningrad-text words preferred; others (e.g. type R, text restored
      // from other manuscripts — Joshua 21:36-37) serve as fallback.
      isNA = ref.type.startsWith("L");
      const main = cols[8]?.trim().split(/[_\s]/)[0];
      num = main ? normalizeNumber(main) : null;
    }
    if (num && !lexicon[num]) {
      const lemma = cols[4]?.split("=")[0]?.trim();
      const byLemma = lemma ? lemmaToNum.get(lemma) : undefined;
      if (byLemma) {
        num = byLemma;
        stats.lemmaResolved++;
      } else {
        stats.unresolved++;
        num = null;
      }
    }
    if (!num) continue;

    const rawGloss = (isGreek ? cols[2] : cols[3]) ?? "";
    let word = cleanGloss(rawGloss);
    if (!word) {
      // <...> marks a word the BSB doesn't translate separately — the Greek
      // article in "pros ton theon", the Hebrew object marker. Unwrap it so
      // the word still appears in the interlinear.
      const inner = [...rawGloss.matchAll(/<([^>]*)>/g)]
        .map((m) => m[1])
        .join(" ");
      word = cleanGloss(inner);
      if (word === "obj") word = "object marker";
    }
    if (!word) {
      stats.skippedUntranslated++;
      continue;
    }

    // Surface form (the word as written in the text) + its transliteration.
    let surface;
    let translit;
    if (isGreek) {
      // col 1 is "θεόν, (theon)" — surface with STEPBible's translit.
      const wm = (cols[1] ?? "").match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      surface = cleanGreekSurface((wm ? wm[1] : (cols[1] ?? "")).trim());
      const step = wm ? wm[2].trim() : "";
      translit = translitGreek(surface) || step;
      // Cross-check: ours must equal STEPBible's, allowing for their
      // single-letter homograph disambiguator (ἀρχῇ → "archēa").
      if (
        step &&
        translit !== step &&
        !(step.length === translit.length + 1 && step.startsWith(translit))
      ) {
        stats.translitMismatch++;
        if (translitMismatchSamples.length < 12) {
          translitMismatchSamples.push(`${surface}: ${translit} vs ${step}`);
        }
      }
    } else {
      surface = cleanHebrewSurface(cols[1] ?? "");
      translit = cleanHebrewTranslit(cols[2] ?? "");
    }

    const entry = { word, num, surface, translit };
    const b = bucket(primaryIdx, bookName, ref.key);
    b.all.push(entry);
    if (isNA) b.na.push(entry);
    if (ref.altKey) {
      const ab = bucket(altIdx, bookName, ref.altKey);
      ab.all.push(entry);
      if (isNA) ab.na.push(entry);
    }
  }
}

/** Every word in text order — reading the surface column is reading the verse. */
function finalize(list) {
  return list.map((e) => [e.word, e.num, e.surface, e.translit]);
}

let bookCount = 0;
let verseCount = 0;
const missingSamples = [];
for (const [bookName, verses] of primaryIdx) {
  const out = {};
  const bsbFile = path.join(BSB_DIR, `${bookName}.json`);
  if (fs.existsSync(bsbFile)) {
    // BSB-driven: emit exactly the verses the app's text has.
    const bsb = JSON.parse(fs.readFileSync(bsbFile, "utf8"));
    for (const ch of bsb.chapters) {
      for (const m of ch.html.matchAll(/data-number="(\d+)"/g)) {
        const key = `${ch.chapter}:${m[1]}`;
        const alt = altIdx.get(bookName)?.get(key);
        const prim = verses.get(key);
        const b = alt ?? prim;
        if (!b) {
          stats.missing++;
          if (missingSamples.length < 10) missingSamples.push(`${bookName} ${key}`);
          continue;
        }
        if (alt && alt !== prim) stats.altFilled++;
        if (b.na.length === 0) stats.traditionalFallback++;
        out[key] = finalize(b.na.length ? b.na : b.all);
        verseCount++;
      }
    }
  } else {
    for (const [key, b] of verses) {
      out[key] = finalize(b.na.length ? b.na : b.all);
      verseCount++;
    }
  }
  fs.writeFileSync(
    path.join(STRONGS_OUT, `${bookName}.json`),
    JSON.stringify({ book: bookName, verses: out }),
  );
  bookCount++;
}

fs.writeFileSync(
  path.join(STRONGS_OUT, "_attribution.json"),
  JSON.stringify(
    {
      source:
        "STEPBible Translators Amalgamated Hebrew OT & Greek NT (TAHOT/TAGNT), Tyndale House Cambridge",
      license: "CC BY 4.0",
      url: "https://github.com/STEPBible/STEPBible-Data",
      notes:
        "Word-level tagging of the original text; English glosses based on the Berean Study Bible. Reformatted per BSB verse as [gloss, strongs, surface form, transliteration] tuples, every translated word in text order; NA-text words preferred with Traditional-text fallback (NT), Leningrad text (OT); Psalm superscriptions (verse 0) omitted.",
    },
    null,
    2,
  ),
);

console.log(
  `Strong's word lists: ${bookCount} books, ${verseCount} verses.\n` +
    `  ${stats.altFilled} verses via KJV-alternate refs; ` +
    `${stats.traditionalFallback} via Traditional-text fallback; ` +
    `${stats.missing} BSB verses without words${missingSamples.length ? ` (${missingSamples.join("; ")}${stats.missing > 10 ? "; …" : ""})` : ""}.\n` +
    `  ${stats.lemmaResolved} extended numbers resolved by lemma; ${stats.unresolved} unresolved; ` +
    `${stats.skippedUntranslated} untranslated words skipped.\n` +
    `  ${stats.translitMismatch} Greek transliterations disagree with STEPBible's` +
    `${translitMismatchSamples.length ? ` (${translitMismatchSamples.join("; ")}${stats.translitMismatch > 12 ? "; …" : ""})` : ""}.`,
);

// ── 2. Trimmed lexicon (unchanged source: openscriptures) ───────────

if (GREEK && HEBREW) {
  const greek = require(path.resolve(GREEK));
  const hebrew = require(path.resolve(HEBREW));

  const LEX_OUT = path.join(root, "data", "lexicon");
  fs.mkdirSync(LEX_OUT, { recursive: true });

  const lex = {};
  let kept = 0;
  for (const [dict, translitKey] of [
    [hebrew, "xlit"],
    [greek, "translit"],
  ]) {
    for (const [num, e] of Object.entries(dict)) {
      lex[num] = {
        lemma: e.lemma ?? "",
        translit: e[translitKey] ?? e.translit ?? e.xlit ?? "",
        def: (e.strongs_def ?? "").trim(),
        kjv: (e.kjv_def ?? "").trim(),
      };
      kept++;
    }
  }

  fs.writeFileSync(path.join(LEX_OUT, "strongs.json"), JSON.stringify(lex));
  fs.writeFileSync(
    path.join(LEX_OUT, "_attribution.json"),
    JSON.stringify(
      {
        source:
          "Strong's Exhaustive Concordance dictionaries (1890/1894), JSON by Open Scriptures",
        license: "CC-BY-SA",
        url: "https://github.com/openscriptures/strongs",
      },
      null,
      2,
    ),
  );
  console.log(`Lexicon: ${kept} entries.`);
}
