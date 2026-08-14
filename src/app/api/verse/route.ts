import { NextRequest, NextResponse } from "next/server";
import { getVerseVersions } from "@/lib/content/verse-versions";
import { getLicensedVerseVersions, licensedVersionsEnabled } from "@/lib/content/verse-api";
import { isProtestantCanonBook } from "@/lib/bible-book-order";

/**
 * One verse across every offered translation, for the reader's verse sheet.
 *
 * GET /api/verse?book=John&chapter=3&verse=16
 * → { versions: [{ abbr, name, text }] }
 *
 * Public-domain texts come off disk. When licensed modern translations are
 * configured (API_BIBLE_*), they are fetched live and appended — never stored
 * beyond the short cache in verse-api.ts. A licensed lookup that fails or is
 * over budget is simply absent; it never turns this route into an error.
 */

// A shared monthly allowance means one script can spend everyone's. This is a
// per-instance bucket — approximate by design, enough to stop casual abuse
// without a second moving part.
const RATE_LIMIT = 60; // requests per IP per minute
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    // Opportunistic sweep so the map can't grow without bound.
    if (hits.size > 5000) {
      for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const book = searchParams.get("book") ?? "";
  const chapter = parseInt(searchParams.get("chapter") ?? "", 10);
  const verse = parseInt(searchParams.get("verse") ?? "", 10);

  // The book name becomes a file path segment; accept canon names only.
  if (!isProtestantCanonBook(book) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const versions = getVerseVersions(book, chapter, verse);
  if (versions.length === 0) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }

  if (licensedVersionsEnabled()) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimited(ip)) {
      const licensed = await getLicensedVerseVersions(book, chapter, verse);
      versions.push(...licensed);
    }
  }

  return NextResponse.json({ versions });
}
