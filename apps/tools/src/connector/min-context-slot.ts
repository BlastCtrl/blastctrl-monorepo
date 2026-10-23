import { sleep } from "@/lib/utils";
import {
  isSolanaError,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED,
} from "@solana/kit";

/**
 * Runs a request that names a minimum context slot, again while the RPC
 * node answering hasn't reached that slot. A load-balanced endpoint confirms
 * a transaction from one node and may answer the next request from another
 * a slot or two behind; with the slot named, that node refuses instead of
 * answering from its older state. Any other failure is thrown as it is.
 */
export async function retryWhileBehind<T>(
  request: () => Promise<T>,
  { attempts = 8, delayMs = 250 } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (err) {
      if (attempt >= attempts || !isBehind(err)) throw err;
      await sleep(delayMs);
    }
  }
}

/** The RPC node hasn't reached the minimum context slot the request named. */
const isBehind = (err: unknown): boolean =>
  isSolanaError(
    err,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED,
  ) ||
  (isSolanaError(err) && isBehind(err.cause));
