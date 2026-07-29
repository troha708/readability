"use client";

/**
 * Scripture-only entry point: readability.bible/plain
 *
 * The reader is scripture plus the public-domain layers — cross-references,
 * original-language words, translation comparison, search — with nothing
 * authored over the text, so this is simply a stable front door that lands on
 * the book roadmap.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PlainEntry() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/try/bible/start");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950">
      <p className="text-sm text-neutral-500">Opening the text…</p>
    </main>
  );
}
