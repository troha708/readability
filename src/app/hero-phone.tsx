"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's device shot: a silent screen recording of the reader running
 * inside a phone frame at roughly life size — someone's actual phone, reading.
 *
 * The recording is made from the built app at a 390x844 phone viewport (see
 * scripts/record-hero.mjs), so the screen here carries that exact aspect and
 * nothing is stretched. Frame geometry follows the conventional device-mockup
 * proportions — 14px bezel, 2.5rem body radius, 2rem screen radius, notch,
 * side buttons — the same ones Flowbite's MIT-licensed device mockup uses.
 */
export function HeroPhone() {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Autoplay is a motion preference, not a browser capability. Where motion is
  // unwelcome the phone holds on its first frame instead of looping.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (mq.matches) {
        v.pause();
        v.currentTime = 0;
      } else {
        // Rejects when the browser declines to autoplay; the poster stands in.
        void v.play().catch(() => {});
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="mx-auto w-[304px] max-w-full">
      {/* No notch and no side buttons: the notch sat over the app's own
          header, and at this size the extra hardware detail only got in the
          way of the thing being shown. An even bezel around a plain
          rectangular screen reads as a phone without any of that. */}
      <div className="rounded-[2rem] border-[12px] border-neutral-900 bg-neutral-900 shadow-2xl ring-1 ring-neutral-700/60">
        <video
          ref={videoRef}
          className="block w-full rounded-[1.25rem] bg-neutral-925"
          style={{ aspectRatio: "390 / 844" }}
          src="/hero/reader.webm"
          poster="/hero/reader-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="The reader on a phone: scrolling John 1, tapping a verse, and reading its study notes"
        />
      </div>
    </div>
  );
}
