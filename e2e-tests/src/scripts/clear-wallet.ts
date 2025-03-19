import CONFIG from "../config.js";
import { cleanWallet } from "../solana-lib.js";

const txid = await cleanWallet(CONFIG.swapper, CONFIG.funder);

console.log(txid);
