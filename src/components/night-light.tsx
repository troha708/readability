"use client";

/**
 * Night light — a warmth filter over the whole app, at runtime.
 *
 * The colours the app is BUILT from are never touched. A palette shifted at
 * source was tried and reverted (0aa5e350 / e63b5f41): a warm palette baked
 * into the files reads as an orange page, because under a real night-light
 * filter your eyes adapt to the entire screen shifting, and they do not adapt
 * to one warm document. Doing it at runtime keeps that adaptation intact — the
 * whole viewport warms together — and the setting is one tap from off.
 *
 * The mechanism is a fixed overlay in `mix-blend-mode: multiply`. Multiply is
 * per-channel `base x blend / 255` on gamma-encoded values, which is exactly
 * what a GPU gamma ramp does, so painting the overlay in the redshift
 * whitepoint colour for a temperature reproduces the filter rather than
 * approximating it. It also avoids `filter:` on a root element, which would
 * make that element the containing block for every `position: fixed`
 * descendant and break the sticky header, the sheets and the rails.
 */

import { useEffect, useState } from "react";
import { multiplyColor } from "@/lib/color-temperature";

const KEY = "nightLightKelvin";

/** Off, then progressively warmer. 6500K would be a no-op, so 0 means off. */
export const NIGHT_LIGHT_STEPS = [0, 5200, 4400, 3800, 3000] as const;

const EVENT = "night-light-change";

export function readNightLight(): number {
  try {
    const raw = Number(localStorage.getItem(KEY));
    return NIGHT_LIGHT_STEPS.includes(raw as (typeof NIGHT_LIGHT_STEPS)[number]) ? raw : 0;
  } catch {
    return 0;
  }
}

export function writeNightLight(kelvin: number) {
  try {
    localStorage.setItem(KEY, String(kelvin));
  } catch {
    // private mode — the setting just won't survive the session
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: kelvin }));
}

/** The next step in the cycle, so one control can carry the whole range. */
export function nextNightLight(kelvin: number): number {
  const i = NIGHT_LIGHT_STEPS.indexOf(kelvin as (typeof NIGHT_LIGHT_STEPS)[number]);
  return NIGHT_LIGHT_STEPS[(i + 1) % NIGHT_LIGHT_STEPS.length];
}

export function nightLightLabel(kelvin: number): string {
  return kelvin === 0 ? "Off" : `${kelvin}K`;
}

export function NightLight() {
  const [kelvin, setKelvin] = useState(0);
  const [dark, setDark] = useState(true);

  // Read on mount rather than during render: the server has no localStorage,
  // and painting the overlay before hydration would flash it on every load.
  useEffect(() => {
    setKelvin(readNightLight());
    const onChange = (e: Event) => setKelvin((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, onChange);
    // Another tab changing it should not leave this one out of step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setKelvin(readNightLight());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // The reader's own toggle writes the theme class straight onto <html>, so
  // follow the element rather than a prop — this component sits in the root
  // layout and never re-renders when the reader's state changes.
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Dark Reader, only where it has something to do: a LIGHT page at night is
  // bright before it is cold, and warmth alone doesn't fix that. On the app's
  // own dark theme it has nothing to add — the ground is already near-black —
  // and running it there would rebuild a hand-tuned palette for no gain.
  // Imported on demand so its ~300KB stays out of the initial bundle.
  //
  // Measured on Mark 1 at 4400K, scripture body against the page:
  //   app dark theme, night light off    #d3d7da on #100e0d   13.30:1
  //   app dark theme + night light       #d3b99d on #100c09   10.39:1
  //   light theme + night light (here)   #b7987a on #221f1b    6.11:1
  // So this path is the weakest of the three — Dark Reader's inversion lands
  // on a washed brown ground where the app's own dark theme is near-black. It
  // still clears AA, and it is what a light-theme reader gets for asking for
  // night light without changing theme; but switching to the dark theme is
  // strictly better, and if this is ever cut, warmth-only is the fallback.
  useEffect(() => {
    let cancelled = false;
    const wanted = kelvin > 0 && !dark;

    (async () => {
      const dr = await import("darkreader");
      if (cancelled) return;
      if (wanted) {
        dr.enable({ brightness: 100, contrast: 90, sepia: 0 });
      } else {
        dr.disable();
      }
    })().catch(() => {
      // Blocked or failed to load: the multiply overlay below still applies,
      // so night light degrades to warmth-only rather than to nothing.
    });

    return () => {
      cancelled = true;
    };
  }, [kelvin, dark]);

  if (kelvin === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        // Above everything the app paints, so the warmth covers the sheets and
        // menus too rather than sitting under them.
        zIndex: 2147483646,
        mixBlendMode: "multiply",
        backgroundColor: multiplyColor(kelvin),
      }}
    />
  );
}
