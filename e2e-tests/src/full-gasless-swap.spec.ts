import { test, expect } from "./fixtures.js";
import CONFIG from "./config.js";
import { cleanWallet, sendTokensToWallet, sleep } from "./solana-lib.js";
import { Page } from "@playwright/test";
import { runJupiterUltraSwap } from "./jup-ultra-swap.js";

// CI commands
// pnpm install
// channel chromium -> (skip installing headless shell or something?)
// npx playwright install --with-deps --no-shell chromium
// uninstall browsers

// TODO: package from playwright chrome
// How to capture the error message from the test
// How to send a message to a Discord channel
// Create a format for the report messages in Discord
//   - metadata for the test: pre balance for funder wallet, test wallet, post balance for funder wallet, test wallet
//   - did swap succeed, duration it took, swap amount
//
// Full test logic
//   - set up phantom wallet, load up keypair of test wallet
//   - transfer tokens from funder to swapper, wait until balance is available
//   - go to gasless-swap, execute swap, check for success toast
//   - handle errors: read content of the error toast, save it, if possible read console logs
//   - cleanup:
//      - send all tokens from swapper to funder and close account, transferring the rent to funder
//      - swap SOL back to the original token
//      - return any leftover SOL to the funder wallet
//
//

test.beforeAll(async () => {
  console.log("Transfer the tokens to be swapped to swapper wallet");
  const amountToSend = 3e6;
  const fundTxid = await sendTokensToWallet(CONFIG.funder, CONFIG.swapper, amountToSend);
  console.log(`Funding succesful ${fundTxid}`);
});

test.afterAll(async () => {
  await sleep(5000);
  const { signature, solBalance, tokenBalance } = await cleanWallet(CONFIG.swapper, CONFIG.funder);

  console.log({ signature, solBalance, tokenBalance: tokenBalance.toString() });
  const executeResponse = await runJupiterUltraSwap(Number(tokenBalance));
  console.log({ executeResponse });
});

test("test swap", async ({ page, extensionId }) => {
  const context = page.context();
  const newPagePromise = context.waitForEvent("page");
  await page.goto("https://tools.blastctrl.com/gasless-swap");

  // The extension should open a new tab automatically. Wait for it:
  const extensionSetupPage = await newPagePromise;
  await phantomOnboarding(extensionSetupPage);

  await page.reload();
  await page.bringToFront();

  // FUUUUUUUUCKKKKK
  // This closes the Phantom sidepanel. Thank god for this thread
  // https://github.com/microsoft/playwright/issues/26693
  const sidePanelPage: Page = page
    .context()
    .pages()
    .find((value) => value.url().match(extensionId))!;
  await sidePanelPage?.close({});

  await page.pause();

  await page
    .getByRole("button")
    .filter({ hasText: /Connect your wallet/i })
    .click();

  const connectPromise = context.waitForEvent("page");

  await page.getByRole("dialog").locator("button", { hasText: "Phantom" }).click();
  const phantomConnectWindow = await connectPromise;

  await phantomConnectWindow.getByTestId("primary-button").filter({ hasText: "Connect" }).click();

  const expectedElement = page.locator("a[href='https://station.jup.ag/docs']");
  await expect(expectedElement).toBeVisible();

  await page.getByTestId("token-selector-popover-trigger").click();
  await page.getByRole("button").filter({ hasText: "USDC" }).locator("img").click();

  await page.getByPlaceholder("0.00").fill("4");

  const confirmPromise = context.waitForEvent("page");
  await page.getByRole("button").filter({ hasText: "Submit" }).click();
  const phantomConfirmWindow = await confirmPromise;

  const confirmButton = phantomConfirmWindow.getByTestId("primary-button");
  const unsafeConfirmButton = phantomConfirmWindow.locator("p", {
    hasText: "Confirm anyway",
  });
  await confirmButton.or(unsafeConfirmButton).first().click();

  await expect(page.getByTestId("swap-success-toast")).toBeVisible({
    timeout: 60000,
  });

  await page.close();

  // Success!
});

async function phantomOnboarding(extensionPage: Page) {
  await extensionPage.getByRole("button", { name: /I already have a wallet/i }).click();

  await extensionPage
    .getByRole("button")
    .filter({ hasText: /Import Private Key/i })
    .click();

  await extensionPage.getByPlaceholder("Name").fill("swaptest");
  await extensionPage.getByPlaceholder("Private key").fill(CONFIG.swapperPrivateKey);
  await extensionPage.getByTestId("onboarding-form-submit-button").click();

  const password = "aaaaaaaa";
  await extensionPage.getByTestId("onboarding-form-password-input").fill(password); // Password
  await extensionPage.getByTestId("onboarding-form-confirm-password-input").fill(password); // Confirm password
  await extensionPage.getByTestId("onboarding-form-terms-of-service-checkbox").click(); // Check the checkbox
  await extensionPage.getByTestId("onboarding-form-submit-button").click(); // Submit
  await extensionPage
    .getByTestId("onboarding-form-submit-button")
    .filter({ hasText: /Get Started/i })
    .click(); // Get Started
  await extensionPage.close();
}
