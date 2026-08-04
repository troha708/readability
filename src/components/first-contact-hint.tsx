"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A one-time, non-blocking coachmark for a *conditional* reading feature — one
 * that isn't on every chapter (the chapter Map button).
 *
 * It teaches on first natural contact: the first time an element matching
 * `selector` is on screen, a small amber callout points at it. It's dismissed
 * by any tap, by scrolling past, or by the ×, and never shown again
 * (`storageKey`). It does not dim the screen or block clicks, so it can't
 * interrupt reading: tapping the feature both engages it and dismisses the hint.
 */

// Only one hint shows at a time across all mounted instances (if two
// first-contact targets are in view at once, the second waits its turn).
let anyHintActive = false;

// On screen and laid out. A small top/bottom margin keeps it from latching onto
// a sliver at the very edge — but it must stay small so a control docked in the
// sticky header (the Map button) still counts as visible.
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < window.innerHeight - 8 && r.bottom > 8;
}

export function FirstContactHint({
  selector,
  title,
  description,
  storageKey,
}: {
  selector: string;
  title: string;
  description: string;
  storageKey: string;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const targetRef = useRef<Element | null>(null);
  const activeRef = useRef(false);

  const dismiss = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    anyHintActive = false;
    targetRef.current = null;
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // private mode etc. — the hint simply may show again next session
    }
    setRect(null);
  }, [storageKey]);

  useEffect(() => {
    const seen = () => {
      try {
        return !!localStorage.getItem(storageKey);
      } catch {
        return true;
      }
    };
    if (seen()) return;

    let raf = 0;

    const scan = () => {
      // Already showing: keep it anchored, or retire it once scrolled away.
      if (activeRef.current) {
        const t = targetRef.current;
        if (!t || !onScreen(t)) dismiss();
        else setRect(t.getBoundingClientRect());
        return;
      }
      if (anyHintActive || seen()) return;
      const el = Array.from(document.querySelectorAll(selector)).find(onScreen);
      if (el) {
        targetRef.current = el;
        activeRef.current = true;
        anyHintActive = true;
        setRect(el.getBoundingClientRect());
      }
    };

    const onScrollOrResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    };
    // Any pointer interaction (tapping the feature, or anywhere else) dismisses.
    // Capture phase and no preventDefault, so the underlying tap still lands.
    const onPointerDown = () => {
      if (activeRef.current) dismiss();
    };

    // A short bounded poll catches targets that mount after this effect (the Map
    // button appears only once the chapter's places have been fetched) and lets a
    // queued hint surface shortly after the previous one is dismissed — all
    // without requiring a scroll. It stops once seen or after ~22s; scrolling
    // keeps triggering scans afterward.
    let ticks = 0;
    const initial = setTimeout(scan, 300);
    const poll = setInterval(() => {
      scan();
      if (seen() || ++ticks > 24) clearInterval(poll);
    }, 900);

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      clearTimeout(initial);
      clearInterval(poll);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("pointerdown", onPointerDown, true);
      if (activeRef.current) anyHintActive = false;
    };
  }, [selector, storageKey, dismiss]);

  if (!rect) return null;

  const width = 264;
  const gap = 12;
  const below = rect.bottom + gap + 132 < window.innerHeight;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  const arrowLeft = Math.max(
    18,
    Math.min(rect.left + rect.width / 2 - left, width - 18),
  );

  const style: React.CSSProperties = below
    ? { position: "fixed", top: rect.bottom + gap, left, width }
    : { position: "fixed", bottom: window.innerHeight - rect.top + gap, left, width };

  return (
    <div style={style} className="z-[90]">
      {/* Speech-bubble tail pointing at the feature */}
      <div
        className="absolute h-3 w-3 rotate-45 border-amber-200 bg-amber-50 dark:border-amber-700/60 dark:bg-neutral-900"
        style={
          below
            ? { top: -6, left: arrowLeft - 6, borderTopWidth: 1, borderLeftWidth: 1 }
            : { bottom: -6, left: arrowLeft - 6, borderBottomWidth: 1, borderRightWidth: 1 }
        }
      />
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 shadow-xl dark:border-amber-700/60 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold leading-snug text-amber-800 dark:text-amber-300">
            {title}
          </p>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-base leading-none text-amber-400 transition-colors hover:text-amber-700 dark:text-neutral-500 dark:hover:text-amber-300"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-neutral-300">
          {description}
        </p>
      </div>
    </div>
  );
}
