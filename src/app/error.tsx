"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { reportError } from "@/lib/report-error";

/**
 * Route-level error boundary. Catches render/runtime errors in the app's
 * segments and shows a friendly recovery screen instead of a blank crash.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportError(error, "error-boundary");
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col bg-paper dark:bg-neutral-950">
      <nav className="flex items-center justify-between px-6 py-4">
        <Logo />
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-3 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
          An unexpected error occurred. You can try again, or head back home.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-base font-bold text-neutral-950 transition-colors hover:bg-amber-700"
          >
            Try again
          </button>
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
