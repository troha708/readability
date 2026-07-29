"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_STORAGE_KEY = "bible-tutorial-complete";

export type Step = {
  target: string; // data-tutorial value or CSS selector
  title: string;
  description: string;
  findNearest?: boolean; // scroll to the nearest visible instance
};

// Reading page (chunk-reader) walkthrough. Study/Read mode now lives inside the
// Display Settings menu, so it's covered by the "settings" step rather than its
// own step — the library page introduces modes up front instead.
//
// Only ever-present controls belong here. Conditional features that aren't on
// every chapter — the chapter Map button — are taught on first natural contact
// by <FirstContactHint> instead, so the tour never spotlights an element that
// happens to be absent.
export const READING_TUTORIAL_STEPS: Step[] = [
  {
    target: "search",
    title: "Search",
    description:
      "Search for any word or phrase across the entire Bible. You can also press Ctrl+K.",
  },
  {
    target: "notes",
    title: "Your Notes",
    description:
      "All your highlights and notes in one place. Select any text to highlight it, or add personal notes to any verse.",
  },
  {
    target: "settings",
    title: "Display Settings",
    description:
      "Adjust text size, switch between Study and Read mode, change themes, turn on bionic reading, and change translation — all in here.",
  },
  {
    target: "article p",
    title: "Tap Any Verse",
    description:
      "Tap a verse to open its study tools: read it in every translation, follow cross-references, look up the original Hebrew or Greek words, read the Tyndale study notes, highlight, add a note, or copy it.",
    findNearest: true,
  },
];

// Library/roadmap walkthrough — introduces reading modes (enabled by default),
// worth pointing out before the first read.
export const LIBRARY_TUTORIAL_STEPS: Step[] = [
  {
    target: "mode",
    title: "Read vs Study Mode",
    description:
      "Read mode is reading only, and it's the default. Study mode adds a short recap quiz after each chapter. Set your default here — you can switch any time from the settings menu while reading.",
  },
];

function findTarget(step: Step): Element | null {
  // A bare word is a data-tutorial value; anything else is a CSS selector.
  const query = /[^\w-]/.test(step.target)
    ? step.target
    : `[data-tutorial="${step.target}"]`;
  const all = document.querySelectorAll(query);
  if (all.length === 0) return null;
  if (!step.findNearest || all.length === 1) return all[0];

  // Find the element closest to the center of the viewport
  const viewCenterY = window.innerHeight / 2;
  let best: Element | null = null;
  let bestDist = Infinity;
  all.forEach((el) => {
    const rect = el.getBoundingClientRect();
    // Only consider elements that are at least partially visible
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const dist = Math.abs(rect.top + rect.height / 2 - viewCenterY);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  });

  // If none are visible, scroll to the first one and use it
  if (!best) {
    all[0].scrollIntoView({ behavior: "smooth", block: "center" });
    return all[0];
  }
  return best;
}

export function Tutorial({
  steps = READING_TUTORIAL_STEPS,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  steps?: Step[];
  storageKey?: string;
} = {}) {
  const [step, setStep] = useState(-1);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (localStorage.getItem(storageKey)) return;
    const timer = setTimeout(() => setStep(0), 1200);
    return () => clearTimeout(timer);
  }, [storageKey]);

  const updatePosition = useCallback(() => {
    if (step < 0 || step >= steps.length) return;
    const target = findTarget(steps[step]);
    if (target) {
      setSpotlightRect(target.getBoundingClientRect());
    } else {
      setSpotlightRect(null);
    }
  }, [step, steps]);

  useEffect(() => {
    updatePosition();
    // Small delay for scroll-into-view to settle
    const settle = setTimeout(updatePosition, 350);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  function next() {
    if (step + 1 >= steps.length) {
      dismiss();
    } else {
      setStep(step + 1);
    }
  }

  function dismiss() {
    localStorage.setItem(storageKey, "true");
    setStep(-1);
    // Let the first-contact map hint start looking now that the basic tour is
    // done, without waiting for the next scroll.
    if (storageKey === DEFAULT_STORAGE_KEY) {
      window.dispatchEvent(new Event("bible-tutorial-done"));
    }
  }

  if (step < 0 || step >= steps.length) return null;

  const current = steps[step];
  const pad = 6;
  const tooltipWidth = 300;
  const tooltipEstimatedHeight = 140;

  // Decide tooltip placement: below if there's room, otherwise above
  let tooltipStyle: React.CSSProperties = {};
  if (spotlightRect) {
    let left = spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

    const spaceBelow = window.innerHeight - spotlightRect.bottom - pad - 12;
    const spaceAbove = spotlightRect.top - pad - 12;

    if (spaceBelow >= tooltipEstimatedHeight) {
      // Place below
      tooltipStyle = {
        position: "fixed",
        top: Math.min(
          spotlightRect.bottom + pad + 12,
          window.innerHeight - tooltipEstimatedHeight - 12,
        ),
        left,
        width: tooltipWidth,
      };
    } else if (spaceAbove >= tooltipEstimatedHeight) {
      // Place above
      tooltipStyle = {
        position: "fixed",
        bottom: Math.min(
          window.innerHeight - spotlightRect.top + pad + 12,
          window.innerHeight - 12,
        ),
        left,
        width: tooltipWidth,
      };
    } else {
      // Not enough space either way — center vertically
      tooltipStyle = {
        position: "fixed",
        top: "50%",
        left,
        transform: "translateY(-50%)",
        width: tooltipWidth,
      };
    }
  } else {
    tooltipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: tooltipWidth,
    };
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Dark overlay with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left - pad}
                y={spotlightRect.top - pad}
                width={spotlightRect.width + pad * 2}
                height={spotlightRect.height + pad * 2}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {spotlightRect && (
        <div
          className="absolute rounded-lg ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent"
          style={{
            left: spotlightRect.left - pad,
            top: spotlightRect.top - pad,
            width: spotlightRect.width + pad * 2,
            height: spotlightRect.height + pad * 2,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Click blocker */}
      <div className="absolute inset-0" onClick={dismiss} />

      {/* Tooltip */}
      <div
        style={tooltipStyle}
        className="z-[101] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
            {current.title}
          </h3>
          <span className="text-xs tabular-nums text-neutral-400">
            {step + 1}/{steps.length}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {current.description}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-xs font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Skip tutorial
          </button>
          <button
            onClick={next}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-neutral-950 transition-colors hover:bg-amber-700"
          >
            {step + 1 === steps.length ? "Got it!" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
