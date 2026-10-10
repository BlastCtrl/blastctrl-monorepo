import { config } from "@blastctrl/eslint-config/base";

export default [
  ...config,
  {
    ignores: [
      "test-results/**",
      "playwright-report/**",
      "blob-report/**",
      "playwright/.cache/**",
      "bfnaelmomeimhlpmgjnjophhpkkoljpa/**",
      "BFNAELMOMEIMHLPMGJNJOPHHPKKOLJPA*/**",
    ],
  },
];
