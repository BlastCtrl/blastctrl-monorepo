import { test as base, chromium } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import path from "path";
import fs from "fs";
import { downloadAndExtractExtension } from "./extension-downloader.js";

const PHANTOM_EXTENSION_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const SOLFLARE_EXTENSION_ID = "bhhhlbepdkbapadjdnnojkbgioiodbic";

const pathToExtension = path.join(import.meta.dirname, "..", PHANTOM_EXTENSION_ID);

if (!fs.existsSync(pathToExtension)) {
  await downloadAndExtractExtension(PHANTOM_EXTENSION_ID, PHANTOM_EXTENSION_ID);
}

process.env.PW_CHROMIUM_ATTACH_TO_OTHER = "1";

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      channel: "chrome",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // for manifest v3:
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");

    const extensionId = background.url().split("/")[2]!;
    await use(extensionId);
  },
});
export const expect = test.expect;
