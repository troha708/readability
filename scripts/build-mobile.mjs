#!/usr/bin/env node
/**
 * Build the static mobile bundle for Capacitor.
 *
 *   1. Regenerates the offline content bundle (public/offline).
 *   2. Temporarily hides server-only files that can't exist in a static
 *      export (API route handlers, the auth callback, and middleware) — they
 *      are unused by the offline app.
 *   3. Runs `next build` with NEXT_PUBLIC_BUILD_TARGET=mobile, producing ./out.
 *   4. Always restores the hidden files, even if the build fails.
 *
 * Usage: npm run build:mobile
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// [livePath, hiddenPath] — server-only, excluded from the static export.
// Hidden files are moved OUTSIDE src/ so Next's app router never scans them.
const HIDE = [
  ["src/app/api", ".mobile-hidden/api"],
  ["src/app/auth", ".mobile-hidden/auth"],
  ["src/middleware.ts", ".mobile-hidden/middleware.ts"],
];

const abs = (p) => path.join(root, p);

function move(from, to) {
  if (fs.existsSync(abs(from))) {
    fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
    fs.renameSync(abs(from), abs(to));
  }
}

function restore() {
  for (const [from, to] of HIDE) {
    if (fs.existsSync(abs(to))) fs.renameSync(abs(to), abs(from));
  }
  // Remove the (now-empty) holding directory.
  try {
    fs.rmdirSync(abs(".mobile-hidden"));
  } catch {
    // not empty or already gone — ignore
  }
}

console.log("→ Building offline content bundle");
execSync("node scripts/build-offline-data.mjs", { cwd: root, stdio: "inherit" });

console.log("→ Hiding server-only routes for static export");
for (const [from, to] of HIDE) move(from, to);

try {
  console.log("→ next build (mobile / static export)\n");
  execSync("next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_BUILD_TARGET: "mobile" },
  });
} finally {
  restore();
  console.log("\n→ Restored server-only routes");
}
