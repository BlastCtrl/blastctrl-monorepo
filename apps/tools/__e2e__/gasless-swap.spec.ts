import { test, expect } from "@playwright/test";

test("gasless swap flow", async ({ page }) => {
  await page.goto("https://tools.blastctrl.com/gasless-swap");

  const expectedElement = page.locator("a[href='https://station.jup.ag/docs']");
  await expect(expectedElement).toBeVisible();

  await page.getByTestId("token-selector-popover-trigger").click();
  await page.keyboard.press("Escape");

  await page.getByPlaceholder("0.00").fill("150");

  await page.close();
});
