import pluginNext from "@next/eslint-plugin-next";
import { config as reactConfig } from "./react-internal.js";

/** @type {import("eslint").Linter.Config[]} */
export const nextJsConfig = [
  ...reactConfig,
  {
    // Upstream plugin declarations still reference legacy ESLint types.
    plugins: {
      "@next/next": /** @type {import("eslint").ESLint.Plugin} */ (
        /** @type {unknown} */ (pluginNext)
      ),
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
];
