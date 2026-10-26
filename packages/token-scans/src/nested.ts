import { TOKEN_2022_PROGRAM_ADDRESS } from "@blastctrl/kit-extensions";
import {
  decodeToken,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  type Token,
} from "@solana-program/token";
import {
  isSolanaError,
  parseBase64RpcAccount,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  type Account,
  type Address,
  type GetTokenAccountsByOwnerApi,
  type Rpc,
} from "@solana/kit";

export type TokenAccount = Account<Token>;

/** The RPC methods the nested-account scan reads through. */
export type NestedScanRpc = Rpc<GetTokenAccountsByOwnerApi>;

export type NestedPair = {
  /** The wallet's ATA that owns `nested`. */
  parent: TokenAccount;
  /** A token account owned by `parent` instead of by a wallet. */
  nested: TokenAccount;
  /**
   * The ATA program can only recover a nested *associated* token account of
   * the same token program as its parent (the instruction names one program
   * and derives both ATAs with it).
   */
  recoverable: boolean;
};

/**
 * Decoded Token and Token-2022 accounts owned by `owner`. Token-2022
 * accounts are decoded with the fixed-size layout; their extensions follow
 * it and are not read.
 */
export async function fetchTokenAccountsByOwner(
  rpc: NestedScanRpc,
  owner: Address,
  { abortSignal }: { abortSignal?: AbortSignal } = {},
): Promise<TokenAccount[]> {
  const results = await Promise.all(
    [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS].map((programId) =>
      rpc
        .getTokenAccountsByOwner(owner, { programId }, { encoding: "base64" })
        .send({ abortSignal }),
    ),
  );
  return results.flatMap(({ value }) =>
    value.map(({ pubkey, account }) =>
      decodeToken(parseBase64RpcAccount(pubkey, account)),
    ),
  );
}

/** Whether `account` is the associated token account of `owner` for its mint. */
export async function isAssociatedTokenAccount(
  account: TokenAccount,
  owner: Address,
): Promise<boolean> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint: account.data.mint,
    tokenProgram: account.programAddress,
  });
  return ata === account.address;
}

/** Keeps the accounts that are `owner`'s own associated token accounts. */
export async function filterAssociatedTokenAccounts(
  accounts: TokenAccount[],
  owner: Address,
): Promise<TokenAccount[]> {
  const flags = await Promise.all(
    accounts.map((account) => isAssociatedTokenAccount(account, owner)),
  );
  return accounts.filter((_, i) => flags[i]);
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * How long the RPC asked us to wait, if it rate limited the request (HTTP
 * 429). Uses `Retry-After` when the response exposes it, otherwise
 * `fallbackMs`. Null for any other error.
 */
function rateLimitWait(error: unknown, fallbackMs: number): number | null {
  if (
    !isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) ||
    error.context.statusCode !== 429
  ) {
    return null;
  }
  const seconds = Number(error.context.headers?.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.max(seconds * 1000, fallbackMs)
    : fallbackMs;
}

/**
 * Settings for a public RPC that rate limits per IP (around 1,200 requests
 * per 10 s). At most 4 ATAs in flight and a new one started at most every
 * 100 ms caps the scan at 10 ATAs, or 20 requests, per second: a sixth of
 * that limit, leaving room for the page's other requests.
 */
export const PUBLIC_RPC_NESTED_SCAN = {
  concurrency: 4,
  intervalMs: 100,
} as const;

/**
 * Looks for token accounts owned by each of the wallet's ATAs. One RPC call
 * per ATA and token program. Up to `concurrency` ATAs are checked at once,
 * starting a new one at most every `intervalMs`. The defaults suit a public,
 * rate-limited RPC; a server with its own RPC can raise the concurrency and
 * drop the interval.
 *
 * A request the RPC rate limits (HTTP 429) is retried after a backoff that
 * doubles each time, up to `maxRetries`. The backoff also holds back the
 * other ATAs' next starts, so the whole scan slows down instead of piling
 * more requests onto a limit it already hit.
 */
export async function findNestedAta({
  rpc,
  walletAccounts,
  onProgress,
  concurrency = PUBLIC_RPC_NESTED_SCAN.concurrency,
  intervalMs = PUBLIC_RPC_NESTED_SCAN.intervalMs,
  maxRetries = 4,
  retryBaseMs = 1000,
  abortSignal,
}: {
  rpc: NestedScanRpc;
  walletAccounts: TokenAccount[];
  /** Called with each ATA's index once it and every ATA before it have been checked. */
  onProgress?: (index: number) => void;
  /** How many ATAs to check at once. */
  concurrency?: number;
  /** Minimum time between starting two ATA checks. */
  intervalMs?: number;
  /** How many times to retry an ATA the RPC rate limited. */
  maxRetries?: number;
  /** First backoff after a rate limit; doubles on each retry of that ATA. */
  retryBaseMs?: number;
  abortSignal?: AbortSignal;
}): Promise<NestedPair[]> {
  const found: (NestedPair[] | undefined)[] = walletAccounts.map(
    () => undefined,
  );
  let next = 0;
  let reported = 0;
  // Earliest time the next ATA check may start, shared by all workers.
  let nextStart = 0;

  async function waitTurn() {
    const now = Date.now();
    const start = Math.max(now, nextStart);
    nextStart = start + intervalMs;
    if (start > now) await sleep(start - now, abortSignal);
  }

  async function check(parent: TokenAccount): Promise<NestedPair[]> {
    for (let attempt = 0; ; attempt++) {
      await waitTurn();
      try {
        const nestedAccounts = await fetchTokenAccountsByOwner(
          rpc,
          parent.address,
          { abortSignal },
        );
        return await Promise.all(
          nestedAccounts.map(async (nested) => ({
            parent,
            nested,
            recoverable:
              nested.programAddress === parent.programAddress &&
              (await isAssociatedTokenAccount(nested, parent.address)),
          })),
        );
      } catch (error) {
        const wait = rateLimitWait(error, retryBaseMs * 2 ** attempt);
        if (wait === null || attempt >= maxRetries) throw error;
        nextStart = Math.max(nextStart, Date.now() + wait);
      }
    }
  }

  async function worker() {
    while (next < walletAccounts.length) {
      const index = next++;
      found[index] = await check(walletAccounts[index]!);
      while (reported < found.length && found[reported]) {
        onProgress?.(reported);
        reported++;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, walletAccounts.length)) },
      worker,
    ),
  );
  return found.flatMap((pairs) => pairs ?? []);
}
