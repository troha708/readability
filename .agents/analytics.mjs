#!/usr/bin/env node
// One-shot analytics digest: all Vercel metric queries + the Supabase signup
// count fired in parallel. Usage: node .agents/analytics.mjs [window]
// (window = 10m, 2h, 24h, 7d... default 24h)
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const sh = promisify(exec);
const since = process.argv[2] ?? "24h";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const METRIC = "vercel.analytics_pageview.count";

async function metric(args) {
  const { stdout } = await sh(
    `npx vercel metrics ${METRIC} ${args} --since ${since} --format=json`,
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 },
  );
  const res = JSON.parse(stdout.slice(stdout.indexOf("{")));
  if (res.summary) return res.summary;

  // Short windows come back as a per-bucket time series with no summary, which
  // silently broke the group-by lines. Fold the series down ourselves.
  const rows = res.data ?? [];
  const key = Object.keys(rows[0] ?? {}).find(
    (k) => k !== "timestamp" && typeof rows[0][k] !== "number",
  );
  const numField = Object.keys(rows[0] ?? {}).find((k) => typeof rows[0][k] === "number");
  if (!key || !numField) return [];

  const totals = new Map();
  for (const r of rows) totals.set(r[key], (totals.get(r[key]) ?? 0) + r[numField]);
  return [...totals]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ [key]: k, [numField]: n }));
}

async function users() {
  const env = {};
  for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "select email, created_at from auth.users order by created_at",
    }),
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return res.json();
}

const label = (row, field) => (row[field] === "" ? "(direct)" : row[field]);
const fmt = (rows, field) =>
  rows.length === 0
    ? "—"
    : rows
        .map((r) => `${label(r, field)} ${Object.values(r).find((v) => typeof v === "number")}`)
        .join(" · ");

const [total, visitors, country, referrer, path, signups] = await Promise.allSettled([
  metric(""),
  metric("-a unique/visitor_id"),
  metric("--group-by country"),
  metric("--group-by referrer_hostname"),
  metric("--group-by request_path"),
  users(),
]);
const val = (r) => (r.status === "fulfilled" ? r.value : null);

// A no-data window returns an empty summary, not zeros.
const views = val(total) ? (val(total)[0]?.vercel_analytics_pageview_count_sum ?? 0) : "?";
const uniq = val(visitors)
  ? (val(visitors)[0]?.vercel_analytics_pageview_count_unique_visitor_id ?? 0)
  : "?";
console.log(`Last ${since}: ${views} views · ${uniq} visitor(s)`);
console.log(`Countries: ${val(country) ? fmt(val(country), "country") : "error"}`);
console.log(`Referrers: ${val(referrer) ? fmt(val(referrer), "referrer_hostname") : "error"}`);
console.log(`Paths: ${val(path) ? fmt(val(path), "request_path") : "error"}`);
if (val(signups)) {
  const u = val(signups);
  const newest = u[u.length - 1];
  console.log(
    `Signups: ${u.length} total (2 = owner baseline) → ${u.length - 2} real; newest ${newest.created_at.slice(0, 10)}`,
  );
} else {
  console.log(`Signups: error (${signups.reason})`);
}
