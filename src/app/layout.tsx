import type { Metadata, Viewport } from "next";
import { Bitter, Fraunces } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Warm old-style serif used for display headings — gives the "scholarly
// books/study" feel. Body copy stays on the system sans for readability.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Slab text serif for scripture, in the manner of esv.org's Sentinel
// (which is commercial). Real italics are loaded for psalm titles,
// cross-references and transliterations.
const scripture = Bitter({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-scripture",
  display: "swap",
});
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ReminderSync } from "@/components/reminder-sync";
import { SignupNudge } from "@/components/signup-nudge";
import { ErrorReporter } from "@/components/error-reporter";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Readability — A study Bible",
    template: "%s | Readability",
  },
  description:
    "Notes, cross-references, word study and maps. Free and open source, with no ads and no account required.",
  keywords: [
    "Bible",
    "Bible reading app",
    "Bible study",
    "Bible comprehension",
    "Bible quiz",
    "read the Bible online",
    "free Bible app",
    "bionic reading Bible",
    "Bible study tools",
    "New Testament",
    "Old Testament",
    "Scripture",
  ],
  openGraph: {
    title: "A study Bible",
    description:
      "Notes, cross-references, word study and maps. Free and open source, with no ads and no account required.",
    type: "website",
    siteName: "Readability",
    // og:image / twitter:image are supplied by src/app/opengraph-image.png
    // (Next's file convention), so no explicit images here.
  },
  twitter: {
    // Large-image card so the reader preview renders big in the unfurl
    // (Discord/Slack show the portrait shot large and uncropped; note that
    // Twitter/X itself center-crops a portrait to a landscape strip).
    card: "summary_large_image",
    title: "A study Bible",
    description:
      "Notes, cross-references, word study and maps. Free and open source, with no ads and no account required.",
  },
  appleWebApp: {
    capable: true,
    title: "Readability",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#d3a83c",
};

// First visit follows the device's own light/dark setting (phones auto-switch
// by time of day, and a dark page in daylight is a mirror); an explicit choice
// via the in-app toggle is stored and wins forever after.
// The catch still consults the device preference: storage-blocked browsers
// (iOS "Block All Cookies", storage-disabled WebViews) throw on localStorage
// access but run matchMedia fine. Dark only as the last resort.
const themeScript = `(function(){var dark=true;try{var t=localStorage.getItem('theme');dark=t?t!=='light':window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){try{dark=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e2){}}if(dark)document.documentElement.classList.add('dark')})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${scripture.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
        <ReminderSync />
        <SignupNudge />
        <ErrorReporter />
      </body>
    </html>
  );
}
