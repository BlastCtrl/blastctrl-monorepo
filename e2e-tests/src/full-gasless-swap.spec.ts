// CI commands
// pnpm install
// channel chromium -> (skip installing headless shell or something?)
// npx playwright install --with-deps --no-shell chromium
// uninstall browser

import { test, expect } from "./fixtures.js";
import CONFIG from "./config.js";
import { cleanWallet, sendTokensToWallet, sleep } from "./solana-lib.js";
import type { Page } from "@playwright/test";
import { TestReporter } from "./discord/test-reporter.js";
import { runJupiterUltraSwap } from "./jup-ultra-swap.js";

// Get Discord webhook URL from environment variable
const DISCORD_WEBHOOK_URL = CONFIG.discordWebhookUrl;
const testReporter: TestReporter = new TestReporter(DISCORD_WEBHOOK_URL);

test.beforeAll(async () => {
  await testReporter.init();

  let fundingSuccess = false;
  let fundStartTime = Date.now();
  let fundTxid: string;
  let fundDuration: number;

  try {
    console.log("Transfer the tokens to be swapped to swapper wallet");
    const amountToSend = 3e6;
    fundStartTime = Date.now();
    fundTxid = await sendTokensToWallet(CONFIG.funder, CONFIG.swapper, amountToSend);
    fundDuration = (Date.now() - fundStartTime) / 1000;
    console.log(`Funding successful ${fundTxid}`);
    fundingSuccess = true;
  } catch (error) {
    console.error("Funding failed:", error);
    fundTxid = "";
    fundDuration = (Date.now() - (fundStartTime || Date.now())) / 1000;

    // Report failure and exit early - we can't continue without funds
    testReporter.recordFundingStatus(false, {
      transactionId: "",
      amount: 3,
      duration: fundDuration,
      errorReason: error instanceof Error ? error.message : "Unknown error",
    });

    await testReporter.reportTestCompletion(false);
    throw error;
  }

  // Record successful funding
  testReporter.recordFundingStatus(fundingSuccess, {
    transactionId: fundTxid,
    amount: 3, // USDC
    duration: fundDuration,
  });
});

test.afterAll(async () => {
  let cleanupSuccess = false;
  let transferTxid: string | undefined;
  let transferErrorReason: string | undefined;
  let swapTxid: string | undefined;
  let swapErrorReason: string | undefined;
  let solToTransfer = 0;
  let tokenToTransfer = 0;

  console.log("Cleanup for swapper wallet starting...");

  await sleep(5000);
  let cleanWalletResult;
  try {
    cleanWalletResult = await cleanWallet(CONFIG.swapper, CONFIG.funder);
    console.log(`Tokens transfer success: ${cleanWalletResult.signature}`);
    transferTxid = cleanWalletResult.signature;
    solToTransfer = cleanWalletResult.lamports / 1e9;
    tokenToTransfer = cleanWalletResult.tokens / 1e6;
  } catch (error) {
    transferErrorReason = error instanceof Error ? error.message : JSON.stringify(error);
  }

  if (cleanWalletResult?.lamports && cleanWalletResult.lamports > 0) {
    const executeResponse = await runJupiterUltraSwap(cleanWalletResult.lamports);
    if (executeResponse.status === "Success") {
      console.log(`Swap success: ${executeResponse.signature}`);
      swapTxid = executeResponse.signature;
      cleanupSuccess = true;
    } else {
      console.log(`Swap failure: ${executeResponse.error}`);
      swapTxid = executeResponse?.signature;
      swapErrorReason = executeResponse.error;
    }
  }

  testReporter.recordCleanupStatus(cleanupSuccess, {
    solToReturn: solToTransfer,
    tokensToReturn: tokenToTransfer,
    transferTxid,
    transferErrorReason,
    swapTxid,
    swapErrorReason,
  });

  // Always report the test completion, regardless of success/failure.
  // The overall success depends on the swap success, not the cleanup.
  // We'll get this from the test status.
  const overallSuccess = testReporter.swapStatus?.success || false;
  await testReporter.reportTestCompletion(overallSuccess);
});

// @ts-expect-error not installed
test("test swap", async ({ page, extensionId }) => {
  let swapSuccess = false;
  let swapStartTime = Date.now();
  let swapDuration: number;
  let phantomFlagged = false;

  try {
    const context = page.context();
    const newPagePromise = context.waitForEvent("page");
    await page.goto("https://tools.blastctrl.com/gasless-swap");

    // The extension should open a new tab automatically. Wait for it:
    const extensionSetupPage = await newPagePromise;
    await phantomOnboarding(extensionSetupPage);

    await page.reload();
    await page.bringToFront();

    // Close the Phantom sidepanel
    const sidePanelPage: Page = page
      .context()
      .pages()
      // @ts-expect-error not installed
      .find((value) => value.url().match(extensionId))!;
    await sidePanelPage?.close({});

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

    const swapAmount = 3;
    await page.getByPlaceholder("0.00").fill(swapAmount.toString());

    // Start timer for the swap
    swapStartTime = Date.now();

    const confirmPromise = context.waitForEvent("page");
    await page.getByRole("button").filter({ hasText: "Submit" }).click();
    const phantomConfirmWindow = await confirmPromise;
    phantomFlagged = await approveInPhantom(phantomConfirmWindow);

    const successToast = page.getByTestId("swap-success-toast");
    await expect(successToast).toBeVisible({
      timeout: 60000,
    });
    // in the success toast, there is an <a> tag that links to the transaction on the blockchain explorer. extract the href, and then  the txid from it
    const txLink = await successToast.locator("a").getAttribute("href");
    const transactionId = txLink?.split("/").pop() || "";

    swapDuration = (Date.now() - swapStartTime) / 1000;
    swapSuccess = true;

    await page.close();

    // Record swap status
    testReporter.recordSwapStatus(true, {
      swapAmount: swapAmount,
      duration: swapDuration,
      transactionId,
      phantomFlagged,
    });
  } catch (error) {
    console.error("Swap failed:", error);
    swapDuration = (Date.now() - swapStartTime) / 1000;

    // Record swap failure
    testReporter.recordSwapStatus(false, {
      swapAmount: 4, // Default swap amount
      duration: swapDuration,
      errorReason: error instanceof Error ? error.message : "Unknown error",
      phantomFlagged,
    });

    throw error;
  }
});

// Phantom can show extra screens before it signs. When it flags the dApp as
// possibly malicious, it shows "Request blocked" (Proceed anyway), then the
// transaction (Confirm (unsafe)), then "Are you sure?" with a checkbox and
// "Yes, confirm (unsafe)". On each screen, log the buttons and use the first
// control we know, until Phantom signs and closes the window.
// Only enabled buttons count: Phantom disables a confirm while it simulates
// the transaction, and until the checkbox is ticked.
// Returns whether Phantom flagged the request, so the report can say so.
async function approveInPhantom(phantomWindow: Page): Promise<boolean> {
  const proceed = phantomWindow.getByRole("button", { name: /Proceed anyway/i, disabled: false });
  // "Confirm" or "Confirm (unsafe)"
  const confirm = phantomWindow.getByRole("button", { name: /confirm/i, disabled: false });
  // Some confirms are text, not buttons: "Yes, confirm (unsafe)" after the
  // checkbox, and "Confirm anyway" in older versions.
  const confirmText = phantomWindow.getByText(/^(Yes, confirm|Confirm anyway)/i);
  // The checkbox is covered by its label, so click the label, as a person
  // would. Its aria-checked may not update, so tick it only once.
  const acknowledge = phantomWindow
    .locator("label")
    .filter({ has: phantomWindow.getByRole("checkbox") });
  const buttons = async () => (await phantomWindow.getByRole("button").allInnerTexts()).join(" | ");

  let acknowledged = false;
  let flagged = false;
  for (let screen = 1; screen <= 8; screen++) {
    const controls = [
      // Tick the checkbox first: the confirm text next to it can't be
      // disabled, it just doesn't work until the box is ticked.
      ...(acknowledged ? [] : [{ kind: "acknowledge", locator: acknowledge }]),
      { kind: "proceed", locator: proceed },
      { kind: "confirm", locator: confirm },
      { kind: "confirm", locator: confirmText },
    ].map((control) => ({ ...control, locator: control.locator.first() }));

    try {
      const anyControl = controls.map((control) => control.locator).reduce((a, b) => a.or(b));
      await anyControl.first().waitFor({ timeout: 10_000 });
    } catch {
      if (phantomWindow.isClosed()) return flagged;
      throw new Error(`No known control on Phantom screen ${screen}: ${await buttons()}`);
    }
    console.log(`Phantom screen ${screen}: ${await buttons()}`);

    for (const control of controls) {
      if (await control.locator.isVisible()) {
        await control.locator.click();
        if (control.kind !== "confirm") flagged = true;
        if (control.kind === "acknowledge") {
          acknowledged = true;
        } else {
          // Let the screen change, or the window close.
          await control.locator.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
        }
        break;
      }
    }
    if (phantomWindow.isClosed()) return flagged;
  }
  throw new Error("Phantom kept showing screens without signing");
}

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
