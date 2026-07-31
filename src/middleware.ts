import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { IS_MOBILE } from "@/lib/build-target";

/**
 * Returning readers skip the landing page: a bare readability.bible visit
 * redirects to the library when the browser carries reading progress (the
 * rb-reader cookie set by reading-progress.ts) or a signed-in Supabase
 * session. First-time visitors — and crawlers, which carry no cookies —
 * still get the landing page. In-app links back to the landing keep
 * working: same-origin referers and an explicit ?stay both bypass the
 * redirect.
 */
function landingRedirect(request: NextRequest): NextResponse | null {
  const url = request.nextUrl;
  if (url.pathname !== "/") return null;
  if (url.searchParams.has("stay")) return null;
  const referer = request.headers.get("referer");
  try {
    if (referer && new URL(referer).origin === url.origin) return null;
  } catch {
    // Malformed referer — treat as absent.
  }
  const isReader =
    request.cookies.has("rb-reader") ||
    request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!isReader) return null;
  return NextResponse.redirect(new URL("/try/bible/start", request.url));
}

export async function middleware(request: NextRequest) {
  // The static mobile build has no server middleware; this is a no-op there.
  if (IS_MOBILE) return NextResponse.next();
  const redirect = landingRedirect(request);
  if (redirect) return redirect;
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
