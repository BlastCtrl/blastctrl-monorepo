import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Phantom may show several screens before it signs, each waiting for a
  // simulation, and the swap gets up to 60s to land.
  timeout: 120_000,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    // Don't record traces, screenshots or videos on CI: onboarding types the
    // swapper's private key, and the report is uploaded as a public artifact.
    trace: "on-first-retry",
    headless: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
