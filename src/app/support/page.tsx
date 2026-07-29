import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { IS_MOBILE } from "@/lib/build-target";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Three ways to help Readability: share it with someone, donate, or contribute code on GitHub.",
};

const CONTACT = "readablebibleapp@gmail.com";
// Swap for the GoFundMe page URL once that campaign exists.
const DONATE_URL = "https://buymeacoffee.com/readability";

export default function SupportPage() {
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
        <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Support Readability
        </h1>

        <div className="mt-8 space-y-8 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          <p>
            Readability is free, with no ads and no paywall. If it has helped
            you read the Bible, these are the three most useful ways to help.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Share it
            </h2>
            <p className="mt-2">
              Readability reaches new readers when someone passes it along.
            </p>
          </section>

          {!IS_MOBILE && (
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Donate
              </h2>
              <p className="mt-2">
                The domain and the AI tools used to develop the app both cost
                money. Donations of any size are appreciated. They go
                first to those core costs; anything left over pays for
                development time, which so far has all been volunteered.
              </p>
              <p className="mt-3">
                <a
                  href={DONATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-amber-600 underline hover:text-amber-700 dark:text-amber-400"
                >
                  ☕ Donate at buymeacoffee.com/readability
                </a>
              </p>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Build it
            </h2>
            <p className="mt-2">
              The whole project is open source under the AGPL — the app, the
              study datasets, and the Bible atlas. If you are a developer and
              want to contribute, the code is at{" "}
              <a
                className="text-amber-600 underline hover:text-amber-700 dark:text-amber-400"
                href={GITHUB_URL}
              >
                github.com/troha708/readability
              </a>
              . Email{" "}
              <a
                className="text-amber-600 underline hover:text-amber-700 dark:text-amber-400"
                href={`mailto:${CONTACT}`}
              >
                {CONTACT}
              </a>{" "}
              if you want to talk an idea through first.
            </p>
          </section>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
