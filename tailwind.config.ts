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
        display: ["var(--font-display)", "Baskerville", "Georgia", "ui-serif", "serif"],
        // Scripture body text — a slab text serif, read at font-light with
        // generous leading.
        scripture: ["var(--font-scripture)", "Georgia", "Times New Roman", "serif"],
        // Chrome and labels — the Overview card's headings and its Purpose /
        // Author / Date labels. Serif for prose, sans for the furniture around
        // it; declaring no family here lands on the platform UI sans.
        ui: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Original-language book names on the library page. Greek and Hebrew
        // are separate families because no single free face covers both with
        // the pointing; the stack falls through to whichever the OS supplies.
        greek: ["var(--font-greek)", "Cardo", "Georgia", "serif"],
        hebrew: ["var(--font-hebrew)", "Ezra SIL", "SBL Hebrew", "David", "serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Grey ramp for the reading surfaces (800 = dark surface, 700 =
        // borders and light-theme text, 400 = secondary, 300 = black-theme
        // text). 925 is the dark reading ground, 950 the landing and static
        // shells. Keep 300 and 925 in step with --foreground and --background
        // in globals.css.
        neutral: {
          50: "#fafafa",
          100: "#f2f2f2",
          200: "#dce0e3",
          300: "#d3d7da",
          400: "#9a9fa3",
          500: "#75797d",
          600: "#5e6266",
          700: "#424547",
          800: "#282a2b",
          900: "#202121",
          925: "#100e0d",
          950: "#0a0a0a",
        },
        // Muted reader gold for reader chrome. DEFAULT reads on light
        // surfaces, `bright` on dark, `deep` is the same hue with more ink for
        // text at scripture size. The chapter drop cap keeps the site amber.
        gold: {
          DEFAULT: "#9c8343",
          deep: "#6b5a2d",
          bright: "#c9ad72",
          // Solid fill for primary buttons. The landing's amber-400 (#ecc06b,
          // hsl 39.5 77% 67%) with twenty points of saturation taken out at
          // the same hue and lightness — it keeps a button's weight without
          // glaring off a near-black page. Always pairs with neutral-950
          // text: 10.6:1. Never white, which on this hue is about 2:1.
          fill: "#daba7b",
          "fill-hover": "#e1c793",
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
