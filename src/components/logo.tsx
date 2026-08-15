import Link from "next/link";

type Props = {
  compact?: boolean;
  /** The reader hides the mark: bulbs mean "tap for a fact" on that screen. */
  icon?: boolean;
};

export function Logo({ compact = false, icon = true }: Props) {
  return (
    <Link
      href="/"
      // The wordmark is set as the page title is — scripture serif, italic,
      // semibold, 0.005em — so the mark and "A study Bible" read as one voice.
      // It no longer shares the family of the bar's other items (sans at 500);
      // it isn't one of them, it's the thing they sit beside.
      className={`inline-flex items-center font-scripture font-semibold italic tracking-[0.005em] text-neutral-900 transition-colors hover:text-amber-600 dark:text-white dark:hover:text-amber-400 ${
        compact ? "gap-1.5 text-base" : "gap-2 text-xl"
      }`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static asset; the optimizer adds nothing
        <img
          src="/icons/logo-bulb.png"
          alt=""
          width={159}
          height={215}
          className={compact ? "h-5 w-auto" : "h-6 w-auto"}
        />
      )}
      Readability
    </Link>
  );
}
