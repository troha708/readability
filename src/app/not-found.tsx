import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
        <p className="text-sm font-bold tracking-wide text-amber-600 dark:text-amber-400">404</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Page not found
        </h1>
        <p className="mt-3 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
          The page you’re looking for doesn’t exist or may have moved.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/try/bible/start"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-base font-bold text-neutral-950 transition-colors hover:bg-amber-700"
          >
            Start reading
          </Link>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-neutral-300 px-6 py-3 text-base font-semibold text-neutral-700 transition-colors hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-600"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
