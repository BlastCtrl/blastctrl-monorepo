import type { Config } from "tailwindcss";
import { screens } from "tailwindcss/defaultTheme";
import animate from "tailwindcss-animate";
import forms from "@tailwindcss/forms";

import base from "./base";

export default {
  content: base.content,
  presets: [base],
  theme: {
    screens: {
      xs: "475px",
      ...screens,
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      zIndex: {
        dialog: "30",
        toast: "40",
        tooltip: "50",
      },
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
    },
  },
  plugins: [
    animate,
    forms({
      strategy: "class",
    }),
  ],
} satisfies Config;
