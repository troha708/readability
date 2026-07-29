import Link from "next/link";
import { GITHUB_URL } from "@/lib/site";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-neutral-200 py-6 dark:border-neutral-800 ${className}`}>
      <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
        © {new Date().getFullYear()} Readability
      </p>
      <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-neutral-400 dark:text-neutral-500">
        <Link href="/privacy" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Privacy
        </Link>
        <Link href="/terms" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Terms
        </Link>
        <Link href="/support" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Support
        </Link>
        <Link href="/try/bible/start" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Library
        </Link>
        <Link href="/try/bible/map" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Atlas
        </Link>
        <Link href="/try/bible/dictionary" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Dictionary
        </Link>
        <Link href="/about" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          About
        </Link>
        <Link href="/credits" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Credits
        </Link>
        <a href={GITHUB_URL} className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          GitHub
        </a>
        <a href="mailto:readablebibleapp@gmail.com" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Contact
        </a>
      </nav>
    </footer>
  );
}
