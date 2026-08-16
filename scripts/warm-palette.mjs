#!/usr/bin/env node
/**
 * Night-light palette transform.
 *
 * The palette is stored already shifted to the colour temperature a night-light
 * filter would put it at, so the site looks the way it does through Windows
 * Night Light without the filter being on. This script is how that shift is
 * applied, and the only supported way to re-tune it:
 *
 *     node scripts/warm-palette.mjs --kelvin 3800
 *
 * It is idempotent. palette-baseline.json holds, for every colour literal in
 * the tree, both its ORIGINAL neutral (D65) value and the value currently
 * written to the file; each run rewrites from the original, so running it twice
 * at 3800K gives the same result as running it once.
 *
 * To take the shift off entirely:
 *
 *     node scripts/warm-palette.mjs --restore
 *
 * which writes every original back verbatim. Do NOT reach for `--kelvin 6500`
 * for that: a 6500K BLACK BODY is not D65, so it lands a point or two off on
 * every channel (#ffffff comes back as #fff9fe) — close enough to look neutral,
 * not close enough to be the palette you started with.
 *
 * The model is the one a display filter actually uses: a per-channel gain taken
 * from the Planckian locus at the target temperature, normalised so the
 * brightest channel stays at 1 (the screen warms, it does not brighten), and
 * applied to the GAMMA-ENCODED value — which is what a GPU gamma ramp, and so
 * Night Light, f.lux and redshift, all do. Applying it in linear light instead
 * gives a visibly weaker shift.
 *
 * Left alone deliberately: src/app/api/map-og/route.tsx, which renders link
 * previews other people see on their own screens, and the binary assets in
 * public/.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { globSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts", "palette-baseline.json");

// Files whose colour literals are part of the app's surface.
const TARGET_GLOBS = ["src/**/*.ts", "src/**/*.tsx", "src/**/*.css", "tailwind.config.ts"];
const SKIP = ["src/app/api/map-og/route.tsx"];

// Tailwind default families used by components; warmed copies are generated
// into tailwind.night-palette.ts and merged in by the config.
const DEFAULT_FAMILIES = ["red", "yellow", "blue", "emerald", "pink", "stone"];

// ── Colour maths ─────────────────────────────────────────────────────

function planckianXY(T) {
  const x =
    T <= 4000
      ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
      : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
  const y =
    T <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : T <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

function gainsFor(T) {
  const [x, y] = planckianXY(T);
  const X = x / y,
    Y = 1,
    Z = (1 - x - y) / y;
  const lin = [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ].map((v) => Math.max(v, 0));
  const enc = lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  const m = Math.max(...enc);
  return enc.map((v) => v / m);
}

const clamp8 = (v) => Math.round(Math.min(255, Math.max(0, v)));

function warmHex(hex, gains) {
  const h = hex.slice(1);
  const short = h.length === 3;
  const full = short ? h.split("").map((c) => c + c).join("") : h;
  const alpha = full.length === 8 ? full.slice(6) : "";
  const out = [0, 1, 2]
    .map((i) => clamp8(parseInt(full.slice(i * 2, i * 2 + 2), 16) * gains[i]))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return "#" + out + alpha;
}

// rgb()/rgba(): warm the first three integer runs, leave alpha and syntax alone.
function warmRgbFunc(str, gains) {
  let seen = 0;
  return str.replace(/\d+/g, (n) => (seen < 3 ? String(clamp8(Number(n) * gains[seen++])) : n));
}

// ── Literal scanning ─────────────────────────────────────────────────

// 8 before 6 before 3, so an alpha hex is never half-matched.
const HEX = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const RGB = /rgba?\([^)]*\d[^)]*\)/g;

function literalsIn(text) {
  return [...new Set([...(text.match(HEX) ?? []), ...(text.match(RGB) ?? [])])];
}

function replaceLiteral(text, from, to) {
  if (from === to) return text;
  // A hex token must not match inside a longer hex literal.
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = from.startsWith("#") ? "(?![0-9a-fA-F])" : "";
  return text.replace(new RegExp(escaped + boundary, "g"), to);
}

// ── Generated Tailwind defaults ──────────────────────────────────────

function writeNightPalette(kelvin, gains) {
  const colors = require("tailwindcss/colors");
  // `white` is a keyword rather than a family, and it is the one every panel,
  // card and rail in the light theme is painted with — leave it at #ffffff and
  // the chrome stays cold against a warmed reading page. (`black` needs no
  // entry: every gain multiplied by zero is still zero.)
  const white = `  white: "${warmHex("#ffffff", gains)}", // #ffffff\n`;
  const body = white + DEFAULT_FAMILIES.map((family) => {
    const steps = Object.entries(colors[family])
      .filter(([, v]) => typeof v === "string" && v.startsWith("#"))
      .map(([step, v]) => `    ${step}: "${warmHex(v, gains)}", // ${v}`)
      .join("\n");
    return `  ${family}: {\n${steps}\n  },`;
  }).join("\n");

  writeFileSync(
    path.join(ROOT, "tailwind.night-palette.ts"),
    `// GENERATED by scripts/warm-palette.mjs — do not edit by hand.
//
// Tailwind's stock families${
      kelvin
        ? `, shifted to ${kelvin}K so the reds, blues and greens
// the components borrow sit in the same night light as the palette proper.`
        : `, at their neutral values — the night-light shift
// has been taken off (scripts/warm-palette.mjs --restore).`
    }
// The trailing comment on each line is the neutral (D65) value it came from.
export const nightPalette = {
${body}
};
`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────

const restore = process.argv.includes("--restore");
const kelvinArg = process.argv.indexOf("--kelvin");
const kelvin = kelvinArg > -1 ? Number(process.argv[kelvinArg + 1]) : null;
if (!restore && (!kelvin || Number.isNaN(kelvin))) {
  console.error("usage: node scripts/warm-palette.mjs --kelvin 3800 | --restore");
  process.exit(1);
}
// Restoring is not a temperature: it writes the originals back untouched, so
// unity gains rather than gains for some temperature near D65.
const gains = restore ? [1, 1, 1] : gainsFor(kelvin);

const files = TARGET_GLOBS.flatMap((g) => globSync(g, { cwd: ROOT })).filter(
  (f) => !SKIP.includes(f.split(path.sep).join("/")),
);

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : { kelvin: 6500, entries: [] };
// file -> original -> current
const known = new Map();
for (const e of baseline.entries) {
  if (!known.has(e.file)) known.set(e.file, new Map());
  known.get(e.file).set(e.original, e.current);
}

const entries = [];
let changed = 0;

for (const rel of files) {
  const file = rel.split(path.sep).join("/");
  const abs = path.join(ROOT, rel);
  let text = readFileSync(abs, "utf8");
  const before = text;
  const seen = known.get(file) ?? new Map();

  // Everything currently in the file, mapped back to what it started as.
  const currentToOriginal = new Map([...seen].map(([orig, cur]) => [cur, orig]));
  for (const lit of literalsIn(text)) {
    const original = currentToOriginal.get(lit) ?? lit;
    // Restore writes the original string itself, not the original run back
    // through the transform — unity gains would still expand a #abc shorthand
    // to six digits, which is a rewrite of source the palette never asked for.
    const next = restore
      ? original
      : lit.startsWith("#")
        ? warmHex(original, gains)
        : warmRgbFunc(original, gains);
    text = replaceLiteral(text, lit, next);
    entries.push({ file, original, current: next });
  }

  if (text !== before) {
    writeFileSync(abs, text);
    changed++;
  }
}

writeNightPalette(restore ? null : kelvin, gains);
writeFileSync(BASELINE, JSON.stringify({ kelvin: restore ? null : kelvin, entries }, null, 2) + "\n");

console.log(
  `${restore ? "restored to neutral" : `${kelvin}K`}  ` +
    `gains [${gains.map((g) => g.toFixed(3)).join(", ")}]  ` +
    `${entries.length} literals across ${files.length} files, ${changed} rewritten`,
);
