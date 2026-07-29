#!/usr/bin/env node
/**
 * Fix the testament field for all books in the database.
 *
 * The original seed script used alphabetical file order + a hardcoded index
 * cutoff to determine OT vs NT, which mis-assigned books like Song of Solomon,
 * Jonah, Joshua, Judges, etc.
 *
 * Usage:  node scripts/fix-testaments.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)"
  );
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const OT_BOOKS = new Set([
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song Of Solomon", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
]);

async function main() {
  const { data: books, error } = await supabase
    .from("books")
    .select("id, name, testament");

  if (error) {
    console.error("Failed to fetch books:", error);
    process.exit(1);
  }

  let fixed = 0;
  for (const book of books) {
    const correctTestament = OT_BOOKS.has(book.name) ? "OT" : "NT";
    if (book.testament !== correctTestament) {
      const { error: updateErr } = await supabase
        .from("books")
        .update({ testament: correctTestament })
        .eq("id", book.id);
      if (updateErr) {
        console.error(`  Failed to update ${book.name}:`, updateErr);
      } else {
        console.log(`  Fixed: ${book.name} ${book.testament} → ${correctTestament}`);
        fixed++;
      }
    }
  }

  if (fixed === 0) {
    console.log("All books already have correct testament values.");
  } else {
    console.log(`\nFixed ${fixed} book(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
