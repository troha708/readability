#!/usr/bin/env node
/**
 * Run the Bible tables migration against the Supabase Postgres database.
 * Loads .env.local and requires DATABASE_URL (from Supabase: Settings > Database > Connection string).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Missing DATABASE_URL. Add it to .env.local from Supabase Dashboard > Settings > Database > Connection string (URI)."
  );
  process.exit(1);
}

// Run all migration files in order
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const sql = migrationFiles
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
  .join("\n");

// Use explicit config for pooler so username is definitely postgres.PROJECT_REF and SSL is set
let clientConfig = { connectionString: databaseUrl };
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];
if (projectRef && databaseUrl.includes("pooler.supabase.com")) {
  try {
    const u = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
    const password = decodeURIComponent(u.password);
    const host = u.hostname;
    const port = parseInt(u.port, 10) || 6543;
    const database = u.pathname.slice(1) || "postgres";
    clientConfig = {
      user: `postgres.${projectRef}`,
      password,
      host,
      port,
      database,
      ssl: { rejectUnauthorized: false },
    };
  } catch (_) {
    // keep connectionString
  }
}

const client = new pg.Client(clientConfig);
client.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err.message);
    if (databaseUrl.includes("db.") && databaseUrl.includes("supabase.co")) {
      console.error("\nTip: Use the Connection pooling URI instead of Direct.");
      console.error("Supabase Dashboard > Settings > Database > Connection pooling > URI (Session or Transaction).");
    }
    process.exit(1);
  }
  client.query(sql, (qerr) => {
    if (qerr) {
      console.error("Migration failed:", qerr.message);
      client.end();
      process.exit(1);
    }
    console.log("Migration completed successfully.");
    client.end();
  });
});
