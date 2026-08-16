import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Where Readability's content comes from, what is unique to the app, and who maintains it.",
};

const CONTACT = "readablebibleapp@gmail.com";

const link =
  "text-amber-600 underline hover:text-amber-700 dark:text-amber-400";

export default function AboutPage() {
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
        {/* Set as the landing's h1 is — same face, weight, slant, tracking
            and size steps — so the two pages open in one voice. */}
        <h1 className="font-scripture text-3xl/[1.2] font-semibold italic tracking-[0.005em] text-neutral-900 dark:text-white sm:text-4xl/[1.2] lg:text-[2.6rem]/[1.2]">
          A study Bible
        </h1>

        <div className="mt-8 space-y-6 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          <p>
            Readability brings together Bible study resources released under
            open licenses. The study notes, book introductions, and dictionary
            articles were released under a Creative Commons license by{" "}
            <a className={link} href="https://tyndaleopenresources.com/">
              Tyndale House Publishers
            </a>
            . The Bible
            Atlas is built on OpenBible.info&rsquo;s geocoding data, which
            locates places mentioned in the Bible by{" "}
            <a
              className={link}
              href="https://www.openbible.info/blog/2021/11/rethinking-the-bible-atlas/"
            >
              weighing the judgments of more than seventy atlases,
              dictionaries, and encyclopedias
            </a>
            , with degrees of confidence. Every source is credited in full on
            the{" "}
            <Link href="/credits" className={link}>
              Credits page
            </Link>{" "}
            and wherever it appears in the app.
          </p>
          <p>
            The only content unique to this project is the Study mode
            questions at the end of each chapter, which were created with AI
            assistance, reviewed by hand, and designed to be directly
            checkable against the text. If you notice an error, please email{" "}
            <a className={link} href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>{" "}
            so it can be fixed.
          </p>
          <p>
            The app is currently built and maintained by one developer in New
            Zealand. The code is open source under the AGPL —{" "}
            <a className={link} href={GITHUB_URL}>
              github.com/troha708/readability
            </a>
            .
          </p>
          <p>
            The goal is one intuitive app that brings you closer to
            God&rsquo;s Word. No ads, no paywalls, no account required.
            Running costs are small; if the app is useful to you and
            you&rsquo;d like to help keep it free for everyone, you can{" "}
            <Link href="/support" className={link}>
              support the project
            </Link>
            .
          </p>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
