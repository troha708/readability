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
      // Same size and weight as before; the 0.25px letter-spacing is what puts
      // the wordmark on the same typographic footing as the bar's other items.
      className={`inline-flex items-center font-bold tracking-[0.25px] text-neutral-900 transition-colors hover:text-amber-600 dark:text-white dark:hover:text-amber-400 ${
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
