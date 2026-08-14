import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { configuredLicensedAbbrs } from "@/lib/content/verse-api";
import { LICENSED_META } from "@/lib/licensed-versions";

export const metadata: Metadata = {
  title: "Credits",
  description:
    "The public-domain and openly licensed projects Readability is built on: Bible texts, tagging data, cross-references, and commentaries.",
};

// Every entry mirrors the _attribution.json / _manifest.json files in data/.
const dataCredits = [
  {
    name: "Berean Standard Bible",
    url: "https://berean.bible",
    role: "The default Bible text. Dedicated to the public domain by the Berean Bible project in 2023; its section headings are used in the reader, and its word-by-word translation tables supply the aligned English line in the word study.",
    license: "Public domain",
  },
  {
    name: "eBible.org",
    url: "https://ebible.org",
    role: "Source of the American Standard Version, Geneva Bible (1599), Young's Literal Translation, and Darby Translation texts, and home of the World English Bible translation project. The King James text is likewise public domain.",
    license: "Public-domain texts",
  },
  {
    name: "STEP Bible / Tyndale House, Cambridge",
    url: "https://www.stepbible.org",
    role: "The Translators Amalgamated Hebrew OT and Greek NT (TAHOT/TAGNT) from STEPBible-Data provide the word-by-word tagging and the short English meaning shown for each word in the Greek and Hebrew word study, and the proper-names dataset (TIPNR) provides the family relationships and per-person passage index shown on dictionary person articles.",
    license: "CC BY 4.0",
    dataUrl: "https://github.com/STEPBible/STEPBible-Data",
  },
  {
    name: "Open Scriptures",
    url: "https://github.com/openscriptures/strongs",
    role: "Strong's Exhaustive Concordance dictionaries (1890/1894) in JSON, used for the lexicon entries in the word study.",
    license: "CC BY-SA",
  },
  {
    name: "OpenBible.info",
    url: "https://www.openbible.info/labs/cross-references/",
    role: "The expanded Treasury of Scripture Knowledge cross-references power the cross-reference feature, and the Bible Geocoding dataset supplies place locations.",
    license: "CC-BY / CC BY 4.0",
  },
  {
    name: "Natural Earth",
    url: "https://www.naturalearthdata.com",
    role: "Coastlines, lakes, and rivers behind the chapter maps and the atlas, rendered as a self-hosted vector basemap.",
    license: "Public domain",
  },
  {
    name: "GMRT",
    url: "https://www.gmrt.org",
    role: "The Global Multi-Resolution Topography synthesis supplies the elevation data behind the terrain shading and the reconstruction of the biblical-era Dead Sea on the chapter maps and the atlas.",
    license: "Open access, citation requested",
  },
  {
    name: "Tyndale Open Study Notes",
    url: "https://tyndaleopenresources.com/",
    role: "The per-verse study notes in the verse panel and the book introductions, adapted from Tyndale House Publishers' open release of their study-Bible apparatus. Adapted from Tyndale Open Study Notes; the original work is available for free at tyndaleopenresources.com.",
    license: "CC BY-SA 4.0",
  },
  {
    name: "Tyndale Open Bible Dictionary",
    url: "https://tyndaleopenresources.com/",
    role: "The Bible dictionary: 6,010 articles on the people, places, events, and terms of the Bible. Adapted from Tyndale Open Bible Dictionary; the original work is available for free at tyndaleopenresources.com.",
    license: "CC BY-SA 4.0",
  },
];

export default function CreditsPage() {
  const licensedAbbrs = configuredLicensedAbbrs();
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Link
          href="/"
          className="text-sm font-medium text-neutral-800 transition-colors hover:text-amber-600 dark:text-white dark:hover:text-amber-400"
        >
          ← Home
        </Link>
      </nav>

      <article className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Credits
        </h1>

        <div className="mt-8 space-y-6 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          <p>
            Readability is built on public-domain and openly licensed work.
            This page credits the projects whose texts and data the app uses,
            with their licenses.
          </p>

          <h2 className="font-display pt-4 text-xl font-bold text-neutral-900 dark:text-white">
            Texts and data
          </h2>
          <ul className="space-y-5">
            {dataCredits.map(({ name, url, role, license, dataUrl }) => (
              <li key={name}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:text-white dark:decoration-neutral-600 dark:hover:text-amber-400"
                >
                  {name}
                </a>{" "}
                <span className="text-sm text-neutral-800 dark:text-white">
                  ({license})
                </span>
                <p className="mt-1">
                  {role}
                  {dataUrl && (
                    <>
                      {" "}
                      <a
                        href={dataUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:decoration-neutral-600 dark:hover:text-amber-400"
                      >
                        Dataset on GitHub.
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>

          {/* Rendered only when licensed translations are switched on, so the
              page never credits a publisher whose text the site isn't
              showing. */}
          {licensedAbbrs.length > 0 && (
            <>
              <h2 className="font-display pt-4 text-xl font-bold text-neutral-900 dark:text-white">
                Licensed translations
              </h2>
              <p>
                The modern translations in the verse panel&rsquo;s
                &ldquo;Other translations&rdquo; section are shown by
                permission of their publishers and are not part of this
                project&rsquo;s source. They are fetched a verse at a time
                through{" "}
                <a
                  href="https://api.bible"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:decoration-neutral-600 dark:hover:text-amber-400"
                >
                  API.Bible
                </a>
                , a service of the American Bible Society.
              </p>
              <ul className="space-y-5">
                {licensedAbbrs.map((abbr) => (
                  <li key={abbr}>
                    <a
                      href={LICENSED_META[abbr].publisherUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:text-amber-700 dark:text-white dark:decoration-neutral-600 dark:hover:text-amber-400"
                    >
                      {LICENSED_META[abbr].name} ({abbr})
                    </a>{" "}
                    <span className="text-sm text-neutral-800 dark:text-white">
                      ({LICENSED_META[abbr].publisher})
                    </span>
                    <p className="mt-1 text-sm">{LICENSED_META[abbr].notice}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="font-display pt-4 text-xl font-bold text-neutral-900 dark:text-white">
            Software
          </h2>
          <p>
            The site itself runs on open-source software: Next.js, React,
            Tailwind CSS, Supabase, and Capacitor, among many smaller
            libraries.
          </p>

        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
