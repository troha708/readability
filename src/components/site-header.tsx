"use client";

/**
 * The one site header, used by the landing page and the library so the two
 * are the same object rather than two headers that resemble each other.
 *
 * Desktop (md+): a flat bar in the page's own ground, closed by a single
 * hairline — logo, the typeahead search taking the slack, quiet links, quiet
 * Sign in. The hairline runs edge to edge while the items sit in the page's
 * max-w-6xl column.
 *
 * Mobile: the wordmark alone, centred, with a three-line button on the left
 * that drops everything else — search, the section links, Sign in — into a
 * panel beneath. Nothing is lost on a phone; it is one tap further away.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthButton } from "@/components/auth-button";
import { LandingSearch } from "@/app/landing-search";
import { isNativeApp } from "@/lib/notifications";

const SECTIONS = [
  { href: "/try/bible/map", label: "Atlas" },
  { href: "/try/bible/dictionary", label: "Dictionary" },
  { href: "/try/bible/quiz", label: "Quiz" },
  { href: "/try/bible/highlights", label: "Notes" },
];

const DESKTOP_LINK =
  "px-3 py-2 text-neutral-500 transition-colors hover:text-amber-600 dark:text-neutral-400 dark:hover:text-amber-400 sm:px-4";

const MENU_LINK =
  "-mx-2 rounded-md px-2 py-2.5 text-[15px] font-medium tracking-[0.25px] text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Reminders are a native-app-only feature, so the settings entry point is
  // hidden on the web. Detected after mount to keep SSR markup stable.
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  // Escape closes the panel, matching every other dismissible surface here.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      {/* ── Phone: three lines, then the wordmark centred ───────────── */}
      <div className="relative flex h-14 items-center px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="absolute left-3 rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        {/* Centred on the bar itself, not between its neighbours, so the
            wordmark doesn't shift when the button's label changes. */}
        <div className="mx-auto">
          <Logo />
        </div>
      </div>

      {menuOpen && (
        <div
          id="site-menu"
          className="border-t border-neutral-200 px-4 pb-4 pt-3 dark:border-neutral-800 md:hidden"
        >
          <LandingSearch className="w-full pb-3" />
          <nav className="flex flex-col">
            {SECTIONS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={MENU_LINK}
              >
                {label}
              </Link>
            ))}
            {isNative && (
              <Link
                href="/try/bible/settings"
                onClick={() => setMenuOpen(false)}
                className={MENU_LINK}
              >
                Reminders &amp; settings
              </Link>
            )}
          </nav>
          <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
            <AuthButton />
          </div>
        </div>
      )}

      {/* ── Desktop: the full bar ───────────────────────────────────── */}
      <header className="mx-auto hidden max-w-6xl items-stretch px-6 md:flex md:h-[72px]">
        <div className="flex items-center pr-6">
          <Logo />
        </div>
        <LandingSearch />
        <nav className="hidden items-center text-sm font-medium tracking-[0.25px] sm:flex">
          {SECTIONS.map(({ href, label }) => (
            <Link key={href} href={href} className={DESKTOP_LINK}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-stretch">
          {isNative && (
            <Link
              href="/try/bible/settings"
              aria-label="Reminders & settings"
              className="flex items-center px-3 text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </Link>
          )}
          <AuthButton variant="flat" />
        </div>
      </header>
    </div>
  );
}
