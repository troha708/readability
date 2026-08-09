"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * The pictures beside the "What's in it" list: one per bullet, in the same
 * order, so a tile and its sentence read as a pair.
 *
 * Each is a capture of the real component rather than an illustration of it —
 * scripts/shoot-features.mjs drives the app and shoots them, and re-running it
 * is how they stay current. The sizes below are each crop's own, and they no
 * longer agree: a tile ends where its content ends — the last of the book
 * introduction's fields, the foot of a paragraph, the end of a word's entry —
 * rather than at a shape decided in advance, which cut every one of them
 * mid-sentence. Re-run the script and copy the sizes it prints.
 */
const TILES = [
  {
    src: "/landing/verse-tools.png",
    w: 1344,
    h: 1121,
    alt: "The verse sheet open on John 1:1: highlight colours, Note and Copy, collapsed study notes and cross-references, and the Greek and English as two aligned lines with one word tapped — its partner highlighted in the other line and its transliteration, parsing, Strong's number and definition shown underneath",
  },
  {
    src: "/landing/overview.png",
    w: 1344,
    h: 1205,
    alt: "The introduction to John, giving its purpose, author, date and setting, and opening on why the Gospel was written",
  },
  {
    src: "/landing/dictionary.png",
    w: 1568,
    h: 1208,
    alt: "The dictionary article on Bethlehem, its prose linked through to the people and places it names",
  },
  {
    src: "/landing/chapter-map.png",
    w: 1344,
    h: 1092,
    alt: "The map for Acts 2, reaching from Rome to Mesopotamia: the countries the crowd at Pentecost had come from — Pontus, Cappadocia, Phrygia, Asia, Pamphylia, Egypt and Cyrene — marked around the Mediterranean, with Jerusalem and Galilee at its eastern end",
  },
  {
    src: "/landing/search.png",
    w: 1024,
    h: 703,
    alt: "A search for “living water” returning fourteen verses with the words highlighted",
  },
  {
    src: "/landing/quiz.png",
    w: 1416,
    h: 926,
    alt: "A comprehension question on the opening of John's Gospel with four answers to choose from",
  },
];

export function FeatureMontage({ className = "" }: { className?: string }) {
  // Which tile is open full size, by index. The tiles are small enough on the
  // page to say what a feature is and not to show it, so each one opens.
  const [open, setOpen] = useState<number | null>(null);
  // The tile that was clicked, so focus goes back to it on close rather than
  // to the top of the document.
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open == null) return;
    closeRef.current?.focus();
    // The page behind must not scroll under the overlay — on a phone a scroll
    // that starts on the image otherwise moves the landing page instead.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return setOpen(null);
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Six pictures behind one opening: stepping between them beats closing
      // and re-aiming at a 282px target each time.
      e.preventDefault();
      setOpen((i) =>
        i == null ? i : (i + (e.key === "ArrowRight" ? 1 : TILES.length - 1)) % TILES.length,
      );
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const shown = open == null ? null : TILES[open];

  return (
    <>
      {/* items-start: the tiles no longer share a shape, since each stops at a
          boundary in its own content. Stretched, a short tile would be pulled
          to its neighbour's height and its picture distorted with it. */}
      <div className={`grid grid-cols-2 items-start gap-3 ${className}`}>
        {TILES.map((t, i) => (
          <button
            key={t.src}
            type="button"
            onClick={() => setOpen(i)}
            ref={(node) => {
              triggers.current[i] = node;
            }}
            aria-label={`Open larger: ${t.alt}`}
            className="group block cursor-zoom-in overflow-hidden rounded-[3px] border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-600 focus-visible:border-amber-400 focus-visible:outline-none"
          >
            <Image
              src={t.src}
              alt={t.alt}
              width={t.w}
              height={t.h}
              // Two columns of a 36rem block on desktop, two columns of the
              // viewport below it — never more than ~282px either way, so the
              // browser is told that rather than left to assume full width.
              sizes="(min-width: 40rem) 282px, 45vw"
              className="w-full"
            />
          </button>
        ))}
      </div>

      {shown && (
        // Click anywhere to close: the backdrop and the image sit in one
        // button-like surface, since "click the picture again" is what people
        // try first and a dead centre of the screen reads as broken.
        <div
          role="dialog"
          aria-modal="true"
          aria-label={shown.alt}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8"
        >
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={() => setOpen(null)}
            className="absolute right-3 top-3 rounded-md px-2 py-1 text-2xl leading-none text-neutral-400 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none"
          >
            ×
          </button>
          <Image
            src={shown.src}
            alt={shown.alt}
            width={shown.w}
            height={shown.h}
            // Never past its own pixels: these are 1344px crops, and blown up
            // on a wide display they would be softer than the tile that was
            // clicked to see them better.
            sizes="90vw"
            className="max-h-full w-auto max-w-full rounded-[3px] border border-neutral-700 object-contain"
            style={{ maxWidth: `${shown.w / 2}px` }}
          />
        </div>
      )}
    </>
  );
}
