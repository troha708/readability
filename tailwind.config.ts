import type { Config } from "tailwindcss";
import { nightPalette } from "./tailwind.night-palette";

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
      // Every value below is stored at 3800K — the colour temperature Windows
      // Night Light puts the display at on its default slider — so the site
      // reads the way it does through the filter without the filter being on.
      // Do not hand-edit a hex here: change it at 6500K and re-run
      // `node scripts/warm-palette.mjs --kelvin 3800`, which rewrites every
      // literal in the tree from the neutral values it keeps in
      // scripts/palette-baseline.json.
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // The ramp the reading surfaces are built from — warm rather than grey
        // now, but the same ladder (800 = dark surface, 700 = borders and
        // light-theme text, 400 = secondary, 300 = black-theme text). 925 is
        // the dark reading ground, 950 the landing and static shells. Keep 300
        // and 925 in step with --foreground and --background in globals.css.
        neutral: {
          50: "#facb99",
          100: "#f2c494",
          200: "#dcb68b",
          300: "#d3af85",
          400: "#9a8164",
          500: "#75624c",
          600: "#5e503e",
          700: "#42382b",
          800: "#28221a",
          900: "#201b14",
          925: "#100b08",
          950: "#0a0806",
        },
        // Muted reader gold for reader chrome. DEFAULT reads on light
        // surfaces, `bright` on dark, `deep` is the same hue with more ink for
        // text at scripture size. The chapter drop cap keeps the site amber.
        gold: {
          DEFAULT: "#9c6a29",
          deep: "#6b491c",
          bright: "#c98c46",
          // Solid fill for primary buttons. The landing's amber-400 (#ec9c41,
          // hsl 31.9 82% 59%) with sixteen points of saturation taken out at
          // the same hue — it keeps a button's weight without glaring off a
          // near-black page. Always pairs with neutral-950 text: 8.1:1. Never
          // white, which on this hue is about 2.5:1.
          fill: "#da974b",
          "fill-hover": "#e1a25a",
        },
        // Gold accent: `amber` is remapped to its own ramp anchored on 400,
        // the heading accent, rather than running Tailwind's stock scale.
        amber: {
          50: "#fdc990",
          100: "#f8c181",
          200: "#f3b76c",
          300: "#eca952",
          400: "#ec9c41",
          500: "#e09537",
          600: "#d38825",
          700: "#a96a13",
          800: "#744710",
          900: "#35220b",
          950: "#1a0f02",
        },
        // Tailwind's stock red / yellow / blue / emerald / pink / stone, which
        // components borrow for errors, highlight colours and the map, warmed
        // to the same temperature. Generated — see tailwind.night-palette.ts.
        ...nightPalette,
      },
    },
  },
  plugins: [],
};

export default config;
