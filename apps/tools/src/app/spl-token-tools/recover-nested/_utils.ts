import type { AppRpc } from "@/connector/app-rpc";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-2022";
import { sleep } from "@/lib/utils";
import {
  decodeToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getRecoverNestedAssociatedTokenInstruction,
  TOKEN_PROGRAM_ADDRESS,
  type Token,
} from "@solana-program/token";
import {
  parseBase64RpcAccount,
  type Account,
  type Address,
  type TransactionSigner,
} from "@solana/kit";

export type TokenAccount = Account<Token>;

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
  rpc: AppRpc,
  owner: Address,
): Promise<TokenAccount[]> {
  const results = await Promise.all(
    [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS].map((programId) =>
      rpc
        .getTokenAccountsByOwner(owner, { programId }, { encoding: "base64" })
        .send(),
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

/**
 * Looks for token accounts owned by each of the wallet's ATAs. One RPC call
 * per ATA, paced to stay under the rate limit.
 */
export async function findNestedAta({
  rpc,
  walletAccounts,
  onProgress,
}: {
  rpc: AppRpc;
  walletAccounts: TokenAccount[];
  onProgress?: (index: number) => void;
}): Promise<NestedPair[]> {
  const result: NestedPair[] = [];

  for (const [i, parent] of walletAccounts.entries()) {
    const nestedAccounts = await fetchTokenAccountsByOwner(rpc, parent.address);
    for (const nested of nestedAccounts) {
      result.push({
        parent,
        nested,
        recoverable:
          nested.programAddress === parent.programAddress &&
          (await isAssociatedTokenAccount(nested, parent.address)),
      });
    }
    onProgress?.(i);
    await sleep(800);
  }
  return result;
}

/**
 * Instructions that recover `nested` into the wallet's ATA for its mint: create
 * that ATA if it doesn't exist yet, then let the ATA program move the tokens
 * and close the nested account, sending its rent to the wallet.
 */
export async function recoverNestedInstructions(
  wallet: TransactionSigner,
  parent: TokenAccount,
  nested: TokenAccount,
) {
  const tokenProgram = nested.programAddress;
  const [destination] = await findAssociatedTokenPda({
    owner: wallet.address,
    mint: nested.data.mint,
    tokenProgram,
  });

  return [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: wallet,
      ata: destination,
      owner: wallet.address,
      mint: nested.data.mint,
      tokenProgram,
    }),
    getRecoverNestedAssociatedTokenInstruction({
      nestedAssociatedAccountAddress: nested.address,
      nestedTokenMintAddress: nested.data.mint,
      destinationAssociatedAccountAddress: destination,
      ownerAssociatedAccountAddress: parent.address,
      ownerTokenMintAddress: parent.data.mint,
      walletAddress: wallet,
      tokenProgram,
    }),
  ];
}
