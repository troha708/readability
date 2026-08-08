import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthButton } from "@/components/auth-button";
import { ReturningUserRedirect } from "@/components/returning-user-redirect";
import { SiteFooter } from "@/components/site-footer";
import { FeatureMontage } from "./feature-montage";
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
          {/* Bar type takes the treatment from esv.org's footer strip ("© 2001
              – 2026 Crossway · Take a Tour · About · …") — weight 500, 0.25px
              letter-spacing — but keeps this bar's own size, so the links
              still fill the header. Their grey there is rgb(154,159,163),
              already this site's neutral-400. */}
          <nav className="hidden items-center text-sm font-medium tracking-[0.25px] max-md:ml-auto sm:flex">
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
            {/* Set like esv.org's "Read the Bible Online": their H1 is Sentinel
                Book ITALIC at 400, line-height 1.2, letter-spacing 0.25px on
                50px (0.005em). Sentinel is Hoefler&Co's commercial face and
                their webfont is licensed to them, so this uses Bitter — the
                free slab already loaded here as the scripture serif, chosen
                for being Sentinel's closest relative. */}
            <h1 className="font-scripture text-3xl/[1.2] font-semibold italic tracking-[0.005em] text-white sm:text-4xl/[1.2] lg:text-[2.6rem]/[1.2]">
              A study Bible
            </h1>
            {/* Body copy set like esv.org's landing paragraphs: Sentinel at
                weight 300, 16px/26px, letter-spacing 0.25px (0.0156em). Bitter
                stands in for Sentinel as above; leading-relaxed is already
                their exact 1.625. Colour stays ours — theirs is light-theme
                ink on white, this page is near-black. */}
            <p className="mt-4 font-scripture text-base font-normal leading-relaxed tracking-[0.0156em] text-neutral-300">
              Notes, cross-references, word study and maps.
              <span className="block">
                Free and open source, with no ads{" "}
                <span className="whitespace-nowrap">and no account required.</span>
              </span>
            </p>
            <div className="mt-7">
              {/* Shaped like esv.org's "Read Now" (their `a.button`): flat
                  fill, small radius, sans, capitalized, no icon — at 1.5x
                  their size, so 60px tall on 22.5px side padding with 18px/500
                  type and 0.375px tracking. Their own #ac9d71 is a gold for
                  white pages and washed out on this one, so the fill is
                  amber-400, the same amber the mockup's chapter numerals use,
                  hovering to the amber-300 they hover to. */}
              <Link
                href="/try/bible/start"
                className="inline-flex h-[54px] items-center rounded-[2px] bg-amber-400 px-[20.3px] text-[16.2px] font-bold capitalize tracking-[0.34px] text-neutral-950 transition-colors hover:bg-amber-300"
              >
                Start reading
              </Link>
            </div>
          </div>

          <div className="relative mt-12 min-w-0 md:mt-0">
            {/* The panel waits to be tapped, so it has to say so — the video
                that replaced this showed the tap and needed no caption. */}
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
        {/* What's in it — montage beside the list, kicker sitting over the
            list. The split waits for lg: at md the container is only ~720px,
            and half of that leaves the montage's two columns too narrow to
            make out. Below lg the two stack, montage first. */}
        <section className="pb-16 pt-14 lg:grid lg:grid-cols-[30rem_minmax(0,1fr)] lg:gap-10">
          <FeatureMontage className="max-w-[30rem]" />
          <div className="mt-8 max-w-[32rem] lg:mt-0">
            {/* Set like esv.org's section kicker (their `landing-copy-title`):
                their sans at 13px/23px, weight 400, uppercase, 1px tracking, in
                the muted gold #bfb391. Ours is the system sans, which is what
                this site uses wherever they use Gotham. */}
            <h2 className="text-[13px] font-normal uppercase leading-[23px] tracking-[1px] text-[#bfb391]">
              What&rsquo;s in it
            </h2>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 font-scripture text-base font-normal leading-relaxed tracking-[0.0156em] text-neutral-300 marker:text-neutral-600">
              {features.map((f) => (
                <li key={f.id}>{f.content}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
