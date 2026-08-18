import type { Metadata, Viewport } from "next";
import {
  Bitter,
  Libre_Baskerville,
  Gentium_Plus,
  Noto_Serif_Hebrew,
} from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Display face: page titles and the chapter drop cap. 400 and 700 only —
// there is no variable axis, so anything asking for 600 snaps to 700, and
// callers use font-bold explicitly for that reason.
const display = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display",
  display: "swap",
});

// Slab text serif for scripture. Real italics are loaded for psalm titles,
// cross-references and transliterations.
const scripture = Bitter({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-scripture",
  display: "swap",
});

// Original-language book names on the library page. Both faces are SIL Open
// Font Licence and carry the pointing — polytonic Greek accents, Hebrew niqqud.
const greek = Gentium_Plus({
  subsets: ["greek-ext"],
  weight: ["400"],
  variable: "--font-greek",
  display: "swap",
});

const hebrew = Noto_Serif_Hebrew({
  subsets: ["hebrew"],
  weight: ["400"],
  variable: "--font-hebrew",
  display: "swap",
});
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ReminderSync } from "@/components/reminder-sync";
import { SignupNudge } from "@/components/signup-nudge";
import { ErrorReporter } from "@/components/error-reporter";
import { Analytics } from "@vercel/analytics/next";
import { NightLight } from "@/components/night-light";
import { IS_MOBILE } from "@/lib/build-target";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Readability — A study Bible",
    template: "%s | Readability",
  },
  description:
    "Read with notes from Tyndale House Publishers, cross-references, a Greek and Hebrew interlinear, and maps. Free and open source, with no ads and no account required.",
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
      "Read with notes from Tyndale House Publishers, cross-references, a Greek and Hebrew interlinear, and maps. Free and open source, with no ads and no account required.",
    type: "website",
    siteName: "Readability",
    // og:image / twitter:image are supplied by src/app/opengraph-image.png
    // (Next's file convention), so no explicit images here.
  },
  twitter: {
    // Small-summary card: text on the left, the portrait John 1 reader shot
    // as a compact thumbnail on the right (owner-preferred, 2026-08-04).
    // summary_large_image would render the portrait as a big standalone box.
    card: "summary",
    title: "A study Bible",
    description:
      "Read with notes from Tyndale House Publishers, cross-references, a Greek and Hebrew interlinear, and maps. Free and open source, with no ads and no account required.",
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

// The other half of ReturningUserRedirect's session guard: any full page
// load AWAY from the landing marks the tab's session, so navigating to "/"
// from inside the app (the reader's logo link) never triggers the
// returning-reader redirect. Without this, a session that ENTERS on a deep
// link (bookmark, shared reader URL) has no flag, and the logo bounces the
// user straight back to the reader. The landing itself must not set the
// flag here — its redirect only fires when "/" is the session's first page.
const sessionScript = `(function(){try{if(location.pathname!=='/')sessionStorage.setItem('bible-session-active','true')}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${scripture.variable} ${greek.variable} ${hebrew.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: sessionScript }} />
      </head>
      <body className="antialiased">
        {children}
        {/* Warmth filter over the whole app, off unless the reader turns it on.
            Mounted here rather than in the reader so it covers the library,
            dictionary and atlas too — a night filter that stops at one route
            is worse than none. */}
        <NightLight />
        <ServiceWorkerRegister />
        <ReminderSync />
        <SignupNudge />
        <ErrorReporter />
        {/* Web Analytics was enabled on the Vercel dashboard in 2026-03 but
            the tracking component was never mounted, so no data exists before
            2026-07-31. Skipped in the native bundle: its script endpoint only
            exists when served by Vercel. */}
        {!IS_MOBILE && <Analytics />}
      </body>
    </html>
  );
}
