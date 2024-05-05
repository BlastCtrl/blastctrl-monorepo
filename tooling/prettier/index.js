import { fileURLToPath } from "url";

/** @typedef {import("prettier").Config} PrettierConfig */
/** @typedef {import("prettier-plugin-tailwindcss").PluginOptions} TailwindConfig */

/** @type { PrettierConfig | TailwindConfig } */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindConfig: fileURLToPath(
    new URL("../../tooling/tailwind/web.ts", import.meta.url),
  ),
  tailwindFunctions: ["cn", "cva", "clsx"],
};

export default config;
