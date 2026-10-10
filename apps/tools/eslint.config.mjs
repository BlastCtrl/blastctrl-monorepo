import { nextJsConfig } from "@blastctrl/eslint-config/next-js";

export default [
  ...nextJsConfig,
  { settings: { next: { rootDir: import.meta.dirname } } },
];
