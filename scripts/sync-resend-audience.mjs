#!/usr/bin/env node
/**
 * Sync Supabase account emails into a Resend Audience so broadcasts can be
 * written and sent from the Resend dashboard (unsubscribe links included
 * automatically).
 *
 * Usage:
 *   node scripts/sync-resend-audience.mjs           # add new accounts
 *   node scripts/sync-resend-audience.mjs --dry-run # show who would be added
 *
 * Only confirmed accounts are synced: with OTP sign-in, a user row is created
 * the moment an email is entered, before the code is verified — those
 * never-verified rows are not people who agreed to hear from us.
 *
 * Add-only by design: contacts already in the audience are left untouched so
 * Resend's unsubscribe state stays authoritative, and nobody is deleted.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ── Load .env.local ──────────────────────────────────────────────────
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    // vercel env pull writes values wrapped in double quotes
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

for (const [name, value] of Object.entries({
  DATABASE_URL,
  RESEND_API_KEY,
  RESEND_AUDIENCE_ID,
})) {
  if (!value) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
}

const dryRun = process.argv.includes("--dry-run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── All confirmed Supabase accounts ──────────────────────────────────
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
const { rows } = await db.query(
  "select lower(email) as email from auth.users where email is not null and email_confirmed_at is not null"
);
await db.end();
const confirmed = new Set(rows.map((r) => r.email));
console.log(`${confirmed.size} confirmed account(s) in Supabase`);

// ── Existing audience contacts ───────────────────────────────────────
const resend = async (method, url, body) => {
  const res = await fetch(`https://api.resend.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${json.message ?? "?"}`);
  return json;
};

const existing = new Set();
const contacts = await resend("GET", `/audiences/${RESEND_AUDIENCE_ID}/contacts`);
for (const c of contacts.data ?? []) existing.add(c.email.toLowerCase());
console.log(`${existing.size} contact(s) already in the Resend audience`);

// ── Add the new ones ─────────────────────────────────────────────────
const toAdd = [...confirmed].filter((e) => !existing.has(e));
if (toAdd.length === 0) {
  console.log("Nothing to add — audience is up to date.");
  process.exit(0);
}

if (dryRun) {
  console.log(`Would add ${toAdd.length} contact(s):`);
  for (const email of toAdd) console.log(`  ${email}`);
  process.exit(0);
}

let added = 0;
for (const email of toAdd) {
  await resend("POST", `/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
    email,
    unsubscribed: false,
  });
  added++;
  await sleep(600); // Resend rate limit: 2 requests/second
}
console.log(`Added ${added} contact(s).`);
