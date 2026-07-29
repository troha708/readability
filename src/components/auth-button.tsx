"use client";

import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * `variant="flat"` renders the header-segment form used by the landing bar:
 * full-height, no pill, a vertical hairline on the left — in the manner of
 * literal.club's header actions. The default keeps the rounded button used
 * everywhere else.
 */
export function AuthButton({
  variant = "default",
}: {
  variant?: "default" | "flat";
} = {}) {
  const { user, loading } = useUser();
  const router = useRouter();

  const flat = variant === "flat";
  const buttonClass = flat
    ? "flex h-full items-center px-4 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200"
    : "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800";

  if (loading) {
    return flat ? (
      <div className="flex h-full items-center px-4">
        <div className="h-4 w-12 animate-pulse rounded bg-neutral-800" />
      </div>
    ) : (
      <div className="h-8 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
    );
  }

  if (!user) {
    return (
      <Link href="/login?next=/try/bible/start" className={buttonClass}>
        Sign in
      </Link>
    );
  }

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  if (flat) {
    return (
      <div className="flex h-full items-stretch">
        <span className="hidden max-w-[180px] items-center truncate pl-4 text-sm text-neutral-400 lg:flex">
          {user.email}
        </span>
        <button onClick={handleSignOut} className={buttonClass}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleSignOut} className={buttonClass}>
      Sign out
    </button>
  );
}
