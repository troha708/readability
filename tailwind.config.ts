import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        // Scripture body text — slab text serif in the manner of esv.org's
        // Sentinel (read at font-light with generous leading).
        scripture: ["var(--font-scripture)", "Georgia", "Times New Roman", "serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Grey ramp taken from esv.org's palette — their light and black
        // themes land almost slot-for-slot on Tailwind's neutral scale
        // (800 = dark surface, 700 = borders and light-theme text,
        // 400 = secondary, 300 = black-theme text). 300 carries the
        // scripture in dark mode and is the same value as --foreground in
        // globals.css — keep the two in step. 925 is the dark READING
        // GROUND: a warm near-black (owner-picked against Reddit's dark mode,
        // whose measured ground is #13120E) — pages sit on it and the cooler
        // 900/800 become the raised-surface steps above it. It has since
        // moved ~40% of the way toward 950 so the reader and the library
        // page no longer read as two different surfaces; keep it in step
        // with --background in globals.css, which the rails match exactly.
        // 950 stays stock near-black: the landing and static shells anchor
        // on it.
        neutral: {
          50: "#fafafa",
          100: "#f2f2f2",
          200: "#dce0e3",
          300: "#cdd1d4",
          400: "#9a9fa3",
          500: "#75797d",
          600: "#5e6266",
          700: "#424547",
          800: "#282a2b",
          900: "#202121",
          925: "#100e0d",
          950: "#0a0a0a",
        },
        // Muted reader gold — halfway between the site amber and ESV's golds
        // (#8f8367/#bfb391), per owner tuning. DEFAULT reads on light
        // surfaces, `bright` on dark. Reader chrome (headings, verse-sheet
        // references, Overview chip) uses this; the chapter drop cap alone
        // keeps the full site amber. `deep` is the same hue with more ink —
        // 6.4:1 on the #fafafa page (DEFAULT is 3.5:1) — for text that must
        // stay readable at scripture size, e.g. section headings. `bright`
        // came down from #d6ba7e when the ground darkened: against #100e0d
        // it was reading at 10.3:1 and pulling the eye off the scripture,
        // so it sits at 8.9:1 now — still the same hue, a shade quieter.
        gold: {
          DEFAULT: "#9c8343",
          deep: "#6b5a2d",
          bright: "#c9ad72",
        },
        // Gold accent: `amber` is remapped to a clean gold (anchored on 400,
        // the heading accent) rather than Tailwind's orange-leaning default.
        amber: {
          50: "#fdf8ec",
          100: "#f8eed3",
          200: "#f3e1b0",
          300: "#ecd086",
          400: "#ecc06b",
          500: "#e0b85a",
          600: "#d3a83c",
          700: "#a9821f",
          800: "#74571a",
          900: "#352a12",
          950: "#1a1304",
        },
      },
    },
  },
  plugins: [],
};

export default config;
