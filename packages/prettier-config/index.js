import { fileURLToPath } from "node:url";

/** @typedef {import("prettier").Config} PrettierConfig */
/** @typedef {import("prettier-plugin-tailwindcss").PluginOptions} TailwindConfig */

/** @type { PrettierConfig | TailwindConfig } */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: fileURLToPath(
    import.meta.resolve("@blastctrl/tailwind-config"),
  ),
  tailwindFunctions: ["cn", "cva", "clsx"],
};

export default config;
