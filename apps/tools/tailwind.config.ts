import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";
import baseConfig from "@blastctrl/tailwind-config/web";

export default {
  // We need to append the path to the UI package to the content array so that
  // those classes are included correctly.
  content: [
    ...baseConfig.content,
    "./src/**/*.{tsx,jsx}",
    "../../packages/ui/**/*.{ts,tsx}",
  ],
  presets: [baseConfig],
  theme: {
    extend: {
      keyframes: {
        enter: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "100%" },
        },
        leave: {
          "0%": { transform: "scale(1)", opacity: "100%" },
          "100%": { transform: "scale(0.9)", opacity: "0" },
        },
        "slide-in": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        enter: "enter 200ms ease-out",
        "slide-in": "slide-in 1.2s cubic-bezier(.41,.73,.51,1.02)",
        leave: "leave 150ms ease-in forwards",
      },
      colors: {
        primary: "#e22424" /* Primary color */,
        "primary-focus": "#a21515" /* Primary color - focused */,

        secondary: "#083d77" /* Secondary color */,
        "secondary-focus": "#052548" /* Secondary color - focused */,
        "secondary-content":
          "#fdffff" /* Foreground content color to use on secondary color */,

        accent: "#ffe8e5" /* Accent color */,
      },
      fontFamily: {
        sans: ["var(--font-roboto)", ...fontFamily.sans],
        display: ["var(--font-roboto-slab)", ...fontFamily.serif],
        mono: fontFamily.mono,
      },
    },
  },
} satisfies Config;
