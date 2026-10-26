import type { TokenAccount } from "@blastctrl/token-scans";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getRecoverNestedAssociatedTokenInstruction,
} from "@solana-program/token";
import type { TransactionSigner } from "@solana/kit";

// The scan lives in `@blastctrl/token-scans`, shared with the MCP server.
export {
  fetchTokenAccountsByOwner,
  filterAssociatedTokenAccounts,
  findNestedAta,
  isAssociatedTokenAccount,
  type NestedPair,
  type TokenAccount,
} from "@blastctrl/token-scans";

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
