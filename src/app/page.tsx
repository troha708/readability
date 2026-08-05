import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthButton } from "@/components/auth-button";
import { ReturningUserRedirect } from "@/components/returning-user-redirect";
import { SiteFooter } from "@/components/site-footer";
import { HeroMockup } from "./hero-mockup";
import { LandingSearch } from "./landing-search";
import { SITE_URL } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Readability",
  url: SITE_URL,
  description:
    "A free study Bible app with comprehension quizzes, cross-references, Greek and Hebrew word study, book introductions, chapter maps, and a searchable Bible atlas.",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Comprehension quizzes for every chapter",
    "Chapter maps and a searchable Bible atlas",
    "An introduction to every book of the Bible",
    "Cross-references, study notes, and Greek/Hebrew word study on any verse",
    "Seven public-domain translations",
    "Full-text search, highlights, and personal notes",
  ],
};

const features: { id: string; content: ReactNode }[] = [
  {
    id: "verse-tools",
    content:
      "Tap any verse to open clear, modern-English study notes and cross-references, compare it across seven public-domain translations, or study the Greek and Hebrew word by word.",
  },
  {
    id: "intro",
    content:
      "An introduction to every book: who wrote it, when, its setting and purpose.",
  },
  {
    id: "dictionary",
    content: (
      <>
        <Link
          href="/try/bible/dictionary"
          className="text-amber-500 underline decoration-amber-500/40 underline-offset-2 transition-colors hover:text-amber-400 hover:decoration-amber-400"
        >
          Dictionary
        </Link>{" "}
        articles on all the significant people, places, and concepts in the
        Bible.
      </>
    ),
  },
  {
    id: "atlas",
    content: (
      <>
        Maps of the places in each chapter, plus the interactive{" "}
        <Link
          href="/try/bible/map"
          className="text-amber-500 underline decoration-amber-500/40 underline-offset-2 transition-colors hover:text-amber-400 hover:decoration-amber-400"
        >
          Bible Atlas
        </Link>
        , with every place in the Bible on one searchable map.
      </>
    ),
  },
  {
    id: "search",
    content:
      "Full-text search, highlights, private notes, and reading progress, saved to your device and synced if you sign in.",
  },
  {
    id: "quiz",
    content: (
      <>
        5,946 questions browsable in the{" "}
        <Link
          href="/try/bible/quiz"
          className="text-amber-500 underline decoration-amber-500/40 underline-offset-2 transition-colors hover:text-amber-400 hover:decoration-amber-400"
        >
          Bible Quiz
        </Link>
      </>
    ),
  },
];

export default function Home() {
  return (
    <main className="dark min-h-screen bg-neutral-950">
      <ReturningUserRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header — a flat bar in the page's own black, closed by a single
          hairline: logo, a surface-tone search field, quiet links, quiet
          Sign in — no rules between items. The hairline runs edge to edge
          but the items sit in the same max-w-6xl column as the rest of the
          page. On phones the search drops to its own full-width row under
          the logo. */}
      <div className="border-b border-neutral-800">
        <header className="mx-auto flex max-w-6xl flex-wrap items-stretch px-6 md:h-[72px] md:flex-nowrap">
          <div className="flex h-14 items-center pr-4 md:h-auto md:pr-6">
            <Logo />
          </div>
          <LandingSearch />
          {/* Atlas/Dictionary live in the footer too, so on phones the bar
              keeps just logo + Sign in (literal.club does the same). */}
          <nav className="hidden items-center text-sm font-medium max-md:ml-auto sm:flex">
            <Link
              href="/try/bible/map"
              className="px-3 py-2 text-neutral-400 transition-colors hover:text-amber-400 sm:px-4"
            >
              Atlas
            </Link>
            <Link
              href="/try/bible/dictionary"
              className="px-3 py-2 text-neutral-400 transition-colors hover:text-amber-400 sm:px-4"
            >
              Dictionary
            </Link>
            <Link
              href="/try/bible/quiz"
              className="px-3 py-2 text-neutral-400 transition-colors hover:text-amber-400 sm:px-4"
            >
              Quiz
            </Link>
          </nav>
          <div className="flex items-stretch max-sm:ml-auto">
            <AuthButton variant="flat" />
          </div>
        </header>
      </div>

      {/* Two-column hero in a wide container; the document sections below
          stay single-column at max-w-2xl. */}
      <div className="mx-auto max-w-6xl px-6">
        {/* Hero — text left, mockup right on md+; stacked (text first) below md */}
        <section className="pb-4 pt-8 md:grid md:grid-cols-2 md:items-center md:gap-10 lg:gap-16">
          <div>
            <h1 className="font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.6rem]">
              A study Bible
            </h1>
            <p className="mt-4 text-base leading-relaxed text-neutral-300">
              Notes, cross-references, word study and maps.
              <span className="block">
                Free and open source, with no ads{" "}
                <span className="whitespace-nowrap">and no account required.</span>
              </span>
            </p>
            <div className="mt-7">
              <Link
                href="/try/bible/start"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-base font-semibold text-neutral-950 transition-colors hover:bg-amber-500"
              >
                Start reading
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="relative mt-12 min-w-0 md:mt-0">
            <p className="mb-2 text-xs text-neutral-400">
              Tap any verse for study notes
            </p>
            <HeroMockup />
          </div>
        </section>
      </div>

      {/* Lower sections share the hero's wide container on desktop —
          heading left, content right — and stack vertically below md. */}
      <div className="mx-auto max-w-6xl px-6">
        {/* What's in it */}
        <section className="pb-16 pt-14 md:grid md:grid-cols-3 md:gap-10">
          <h2 className="text-xl font-semibold text-white">
            What&rsquo;s in it
          </h2>
          <ul className="mt-4 list-disc space-y-2.5 pl-5 leading-relaxed text-neutral-300 marker:text-neutral-600 md:col-span-2 md:mt-0">
            {features.map((f) => (
              <li key={f.id}>{f.content}</li>
            ))}
          </ul>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
