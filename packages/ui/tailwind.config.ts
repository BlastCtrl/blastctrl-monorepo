/*
 * This file is not used for any compilation purpose, it is only used
 * for Tailwind Intellisense & Autocompletion in the source files
 */
import type { Config } from "tailwindcss";

import baseConfig from "@blastctrl/tailwind-config/web";

const config: Config = {
  content: ["./src/**/*.tsx"],
  presets: [baseConfig],
};

export default config;
