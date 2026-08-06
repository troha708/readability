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
    <div className="mx-auto w-[306px] max-w-full">
      {/* No notch: it sat over the app's own header and looked broken. What
          makes this read as a device rather than a grey box is the edge —
          a bright metallic rim catching light at the top, a black bezel
          inside it, and a deep drop shadow underneath. */}
      <div className="rounded-[2.6rem] bg-gradient-to-b from-neutral-500 via-neutral-700 to-neutral-800 p-[2px] shadow-[0_28px_55px_-12px_rgba(0,0,0,0.85)]">
        <div className="rounded-[2.5rem] bg-neutral-950 p-[9px] ring-1 ring-inset ring-black/60">
          <video
            ref={videoRef}
            className="block w-full rounded-[2rem] bg-neutral-925"
            style={{ aspectRatio: "390 / 844" }}
            src="/hero/reader.webm"
            poster="/hero/reader-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="The reader on a phone: reading John 1, tapping verse 12, and opening its study notes"
          />
        </div>
      </div>
    </div>
  );
}
