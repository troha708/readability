import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { personLetterOf, type PersonRecord } from "@/lib/content/people";

/**
 * People — per-person family graph + verse index, from STEPBible TIPNR
 * (CC BY 4.0 — data/people/_attribution.json). Surfaced inside the person's
 * Bible-dictionary article; there is no standalone people page.
 *
 * GET /api/people?byDict=1              → { byDict: { dictId: [personId, …] } }
 * GET /api/people?id=aaron-exo-4-14-heb → { person: { id, … } } | 404
 */

const DIR = join(process.cwd(), "data", "people");

let byDictCache: Record<string, string[]> | null | undefined;
function loadByDict(): Record<string, string[]> | null {
  if (byDictCache !== undefined) return byDictCache;
  try {
    byDictCache = JSON.parse(
      readFileSync(join(DIR, "_by-dict.json"), "utf-8"),
    ) as Record<string, string[]>;
  } catch {
    byDictCache = null;
  }
  return byDictCache;
}

const letterCache = new Map<string, Record<string, Omit<PersonRecord, "id">> | null>();

function loadLetter(letter: string): Record<string, Omit<PersonRecord, "id">> | null {
  const cached = letterCache.get(letter);
  if (cached !== undefined) return cached;
  const file = join(DIR, `${letter}.json`);
  let people: Record<string, Omit<PersonRecord, "id">> | null = null;
  if (existsSync(file)) {
    try {
      people = (JSON.parse(readFileSync(file, "utf-8")) as {
        people: Record<string, Omit<PersonRecord, "id">>;
      }).people;
    } catch {
      people = null;
    }
  }
  letterCache.set(letter, people);
  return people;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    // Ids are lowercase slugs ("aaron-exo-4-14-heb"); reject anything else.
    if (!/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const person = loadLetter(personLetterOf(id))?.[id];
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ person: { id, ...person } });
  }

  const byDict = loadByDict();
  if (!byDict) {
    return NextResponse.json({ error: "People data unavailable" }, { status: 500 });
  }
  return NextResponse.json({ byDict });
}
