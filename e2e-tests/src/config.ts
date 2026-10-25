import "dotenv/config";
import { address, createKeyPairSignerFromBytes } from "@solana/kit";

const getPrivateKeyArray = (key?: string): number[] => {
  if (!key) {
    throw new Error(`Missing key ${key} in environment variables.`);
  }

  try {
    return JSON.parse(key);
  } catch {
    throw new Error("Invalid private key format. Expected a JSON-encoded number array.");
  }
};

const SWAPPER_PRIVATE_KEY = getPrivateKeyArray(process.env.SWAPPER_PRIVATE_KEY);
const FUNDER_PRIVATE_KEY = getPrivateKeyArray(process.env.FUNDER_PRIVATE_KEY);
const RPC_URL = process.env.RPC_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_NO_LOGS = process.env.DISCORD_NO_LOGS === "true";
const USDC_MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const swapper = await createKeyPairSignerFromBytes(Uint8Array.from(SWAPPER_PRIVATE_KEY));
const funder = await createKeyPairSignerFromBytes(Uint8Array.from(FUNDER_PRIVATE_KEY));

if (!RPC_URL) {
  throw new Error("Missing RPC_URL in environment variables.");
}
if (!DISCORD_WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK_URL in environment variables.");
}

export default {
  swapperPrivateKey: process.env.SWAPPER_PRIVATE_KEY!,
  swapper,
  funder,
  rpcUrl: RPC_URL,
  discordWebhookUrl: DISCORD_WEBHOOK_URL,
  disableDiscordLogs: DISCORD_NO_LOGS,
  usdcMint: USDC_MINT,
};
