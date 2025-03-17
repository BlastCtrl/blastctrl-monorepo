import "dotenv/config";
import { loadWallet } from "./solana-lib.js";
import { PublicKey } from "@solana/web3.js";

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
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const swapper = loadWallet(SWAPPER_PRIVATE_KEY);
const funder = loadWallet(FUNDER_PRIVATE_KEY);

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
  usdcMint: new PublicKey(USDC_MINT),
};
