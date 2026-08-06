import Link from "next/link";
import { GITHUB_URL } from "@/lib/site";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-neutral-200 py-6 dark:border-neutral-800 ${className}`}>
      {/* Bar type set like esv.org's own footer strip: their sans at 10.5px,
          weight 500, line-height 30px, 0.25px letter-spacing. */}
      <p className="text-center text-[10.5px] font-medium leading-[30px] tracking-[0.25px] text-neutral-500 dark:text-neutral-400">
        © {new Date().getFullYear()} Readability
      </p>
      <nav className="mt-1 flex flex-wrap items-center justify-center gap-x-4 text-[10.5px] font-medium leading-[30px] tracking-[0.25px] text-neutral-400 dark:text-neutral-500">
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
        <Link href="/try/bible/quiz" className="underline hover:text-neutral-600 dark:hover:text-neutral-400">
          Quiz
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
