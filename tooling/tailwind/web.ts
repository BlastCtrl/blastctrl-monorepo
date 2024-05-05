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
  },
  plugins: [animate, forms],
} satisfies Config;
