/**
 * Build-target flag.
 *
 * The web build (Vercel) leaves this unset and renders normally — server
 * components, SSR, SEO all intact. The native (Capacitor) build sets
 * NEXT_PUBLIC_BUILD_TARGET=mobile, which switches the app to a static export
 * that reads all content from the bundled public/offline/ files instead of
 * Supabase + the server filesystem.
 */
export const BUILD_TARGET = process.env.NEXT_PUBLIC_BUILD_TARGET ?? "web";

/** True when building/running the offline native app. */
export const IS_MOBILE = BUILD_TARGET === "mobile";
