import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";

/**
 * Shared chrome for static legal pages (privacy policy, terms). Mirrors the
 * login/landing shell: white/dark background, a logo nav, and a narrow,
 * readable text column. Children are the page body (headings + paragraphs).
 */
export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
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
          {title}
        </h1>
        <p className="mt-2 text-sm text-neutral-800 dark:text-white">
          Effective {effectiveDate}
        </p>
        <div className="mt-8 space-y-6 font-scripture text-[16px] font-normal leading-relaxed text-neutral-800 dark:text-white">
          {children}
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}

/** Section heading inside a legal page. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-neutral-900 dark:text-white">{heading}</h2>
      {children}
    </section>
  );
}
