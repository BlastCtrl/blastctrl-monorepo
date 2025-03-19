// downloadExtension.js
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import unzipper from "unzipper";

const chromeURLPattern =
  /^https?:\/\/chrome\.google\.com\/webstore\/.+?\/([a-z]{32})(?=[\/#?]|$)/;
const microsoftURLPattern =
  /^https?:\/\/microsoftedge\.microsoft\.com\/addons\/detail\/.+?\/([a-z]{32})(?=[\/#?]|$)/;
const chromeNewURLPattern =
  /^https?:\/\/chromewebstore\.google\.com\/detail\/.+?\/([a-z]{32})(?=[\/#?]|$)/;

function extractExtensionId(input: string) {
  let match =
    chromeURLPattern.exec(input) ||
    chromeNewURLPattern.exec(input) ||
    microsoftURLPattern.exec(input);
  if (match && match[1]) {
    return match[1];
  }
  // If not a URL, assume it's an extension ID (must be 32 lowercase letters)
  if (/^[a-z]{32}$/.test(input)) {
    return input;
  }
  throw new Error("Invalid extension ID or URL provided.");
}

function getChromeVersion() {
  return "134.0.6998.35"; // Adjust if needed.
}

function getNaclArch() {
  if (process.arch === "x64") return "x86-64";
  if (process.arch === "ia32") return "x86-32";
  return "arm";
}

/**
 * Given an ArrayBuffer (from a downloaded CRX file), extracts the ZIP portion as a Buffer.
 */
function extractZipBufferFromCrx(arrayBuffer: ArrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  let publicKeyLength, signatureLength, header, zipStartOffset;
  if (buf[4] === 2) {
    header = 16;
    publicKeyLength =
      // @ts-ignore
      buf[8] + (buf[9] << 8) + (buf[10] << 16) + (buf[11] << 24);
    signatureLength =
      // @ts-ignore
      buf[12] + (buf[13] << 8) + (buf[14] << 16) + (buf[15] << 24);
    zipStartOffset = header + publicKeyLength + signatureLength;
  } else {
    publicKeyLength =
      // @ts-ignore
      buf[8] + (buf[9] << 8) + (buf[10] << 16) + (buf[11] << 24);
    zipStartOffset = 12 + publicKeyLength;
  }
  // Create a Buffer from the zip portion of the CRX.
  return Buffer.from(buf.subarray(zipStartOffset));
}

/**
 * Downloads the extension CRX in zip mode, transforms it to a valid .zip,
 * writes it to disk, and extracts it to the given output folder.
 *
 * @param {string} extensionInput - Either the extension ID or a Chrome Web Store URL.
 * @param {string} outputFolder - The folder where the extension will be unzipped.
 */
export async function downloadAndExtractExtension(
  extensionInput: string,
  outputFolder = "extension",
) {
  const extensionId = extractExtensionId(extensionInput);
  const version = getChromeVersion();
  const nacl_arch = getNaclArch();

  // Build the download URL for ZIP format.
  const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${version}&x=id%3D${extensionId}%26installsource%3Dondemand%26uc&nacl_arch=${nacl_arch}&acceptformat=crx3`;
  console.log(`Downloading extension ${extensionId} from: ${downloadUrl}`);

  // Download the CRX file as an ArrayBuffer (Node v20 has a global fetch)
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download extension: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  // Extract the ZIP portion from the CRX.
  const zipBuffer = extractZipBufferFromCrx(arrayBuffer);

  // Write the zipBuffer to disk.
  const zipPath = path.join(process.cwd(), "extension.zip");
  await fs.writeFile(zipPath, zipBuffer);
  console.log(`Saved ZIP file to ${zipPath}`);

  // Ensure the output folder exists.
  await fs.mkdir(outputFolder, { recursive: true });

  // Unzip the file using the 'unzipper' package.
  await new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outputFolder }))
      .on("close", resolve)
      .on("error", reject);
  });
  console.log(`Extracted extension into folder: ${outputFolder}`);
}
