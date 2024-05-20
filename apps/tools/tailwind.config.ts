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
      },
    },
  },
} satisfies Config;
