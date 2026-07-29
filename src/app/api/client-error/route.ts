import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Per-field caps keep a hostile client from writing megabytes per row.
const CAPS = { message: 500, stack: 4000, digest: 100, url: 500, source: 40, userAgent: 300 };

function clip(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

/**
 * Crash-report intake. Rows land in Supabase (client_errors) and the message
 * is echoed to the server log so it also shows in Vercel's log view. Always
 * responds 204: error reporting must never produce its own errors to report.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = clip(body.message, CAPS.message);
    if (!message) return new NextResponse(null, { status: 204 });

    const row = {
      message,
      stack: clip(body.stack, CAPS.stack),
      digest: clip(body.digest, CAPS.digest),
      url: clip(body.url, CAPS.url),
      source: clip(body.source, CAPS.source),
      user_agent: clip(request.headers.get("user-agent"), CAPS.userAgent),
    };

    console.error(`[client-error] ${row.source ?? "unknown"}: ${message}`);

    const supabase = await createClient();
    await supabase.from("client_errors").insert(row);
  } catch {
    // Malformed body or a database hiccup — swallow it; see function comment.
  }
  return new NextResponse(null, { status: 204 });
}
