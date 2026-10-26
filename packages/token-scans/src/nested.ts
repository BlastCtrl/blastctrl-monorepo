import { TOKEN_2022_PROGRAM_ADDRESS } from "@blastctrl/kit-extensions";
import {
  decodeToken,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  type Token,
} from "@solana-program/token";
import {
  parseBase64RpcAccount,
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
 * Looks for token accounts owned by each of the wallet's ATAs. One RPC call
 * per ATA and token program. By default one ATA at a time with a pause after
 * each, to stay under a public RPC's rate limit; a server with its own RPC
 * can check several at once without the pause.
 */
export async function findNestedAta({
  rpc,
  walletAccounts,
  onProgress,
  concurrency = 1,
  delayMs = 800,
  abortSignal,
}: {
  rpc: NestedScanRpc;
  walletAccounts: TokenAccount[];
  /** Called with each ATA's index once it has been checked, in order. */
  onProgress?: (index: number) => void;
  /** How many ATAs to check at once. */
  concurrency?: number;
  /** Pause after each group of `concurrency` ATAs. */
  delayMs?: number;
  abortSignal?: AbortSignal;
}): Promise<NestedPair[]> {
  const result: NestedPair[] = [];

  for (let start = 0; start < walletAccounts.length; start += concurrency) {
    const group = walletAccounts.slice(start, start + concurrency);
    const found = await Promise.all(
      group.map(async (parent) => {
        const nestedAccounts = await fetchTokenAccountsByOwner(
          rpc,
          parent.address,
          { abortSignal },
        );
        return Promise.all(
          nestedAccounts.map(async (nested) => ({
            parent,
            nested,
            recoverable:
              nested.programAddress === parent.programAddress &&
              (await isAssociatedTokenAccount(nested, parent.address)),
          })),
        );
      }),
    );
    for (const [offset, pairs] of found.entries()) {
      result.push(...pairs);
      onProgress?.(start + offset);
    }
    if (delayMs > 0) await sleep(delayMs, abortSignal);
  }
  return result;
}
