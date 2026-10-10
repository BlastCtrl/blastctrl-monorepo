import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/out/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // Preserve the existing policy for SDK and wallet adapter boundaries.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  eslintConfigPrettier,
];
