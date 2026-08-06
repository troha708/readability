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
    <div className="mx-auto w-[300px] max-w-full">
      {/* A phone with a rectangular screen: rounded body, square display.
          The earpiece and camera sit in a bezel band ABOVE the screen rather
          than in a notch cut into it — a notch overlapped the app's own
          header and was what made the first attempt look broken. */}
      <div className="relative rounded-[2.1rem] bg-gradient-to-b from-neutral-600 via-neutral-800 to-neutral-900 p-[2px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.85)]">
        {/* Side buttons, flush against the body */}
        <div className="absolute -left-[3px] top-[96px] h-9 w-[3px] rounded-l bg-neutral-700" />
        <div className="absolute -left-[3px] top-[142px] h-9 w-[3px] rounded-l bg-neutral-700" />
        <div className="absolute -right-[3px] top-[118px] h-14 w-[3px] rounded-r bg-neutral-700" />

        <div className="rounded-[2rem] bg-neutral-950 p-[10px]">
          {/* Earpiece slit with the camera beside it */}
          <div className="flex h-[24px] items-center justify-center gap-2">
            <div className="h-[3px] w-9 rounded-full bg-neutral-800" />
            <div className="h-[5px] w-[5px] rounded-full bg-neutral-800" />
          </div>
          <video
            ref={videoRef}
            className="block w-full rounded-[2px] bg-neutral-925"
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
          {/* Speaker grille below the screen */}
          <div className="flex h-[24px] items-center justify-center">
            <div className="h-[3px] w-12 rounded-full bg-neutral-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
