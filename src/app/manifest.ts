import type { MetadataRoute } from "next";

// The manifest is constant; mark it static so `output: export` (mobile) builds.
export const dynamic = "force-static";

// Web app manifest — served at /manifest.webmanifest and auto-linked by Next.
// Makes the site installable ("Add to Home Screen") and gives it an app icon,
// name, theme color, and a fullscreen standalone display.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Readability — A study Bible",
    short_name: "Readability",
    description:
      "A study Bible: cross-references, word study, maps, a dictionary, and a quiz for every chapter.",
    start_url: "/try/bible/start",
    scope: "/",
    display: "standalone",
    // Splash ground — tracks the dark reading ground (neutral-925).
    background_color: "#100e0d",
    theme_color: "#d3a83c",
    categories: ["education", "books", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
