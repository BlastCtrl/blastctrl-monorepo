import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { config as baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    // Upstream plugin declarations still reference legacy ESLint types.
    plugins: {
      "react-hooks": /** @type {import("eslint").ESLint.Plugin} */ (
        /** @type {unknown} */ (pluginReactHooks)
      ),
    },
    rules: pluginReactHooks.configs.recommended.rules,
  },
];
