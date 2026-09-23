import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import { TransactionInstruction } from "@solana/web3.js";

/**
 * Instruction index of `WithdrawExcessLamports` in both the Token program
 * (since the p-token reimplementation) and Token-2022.
 * `@solana/spl-token` has no helper for it yet.
 */
export const WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION = 38;

/**
 * Moves everything above the rent-exempt minimum out of a token program
 * account, leaving the account open with exactly the minimum.
 *
 * The same instruction works for a token account (signed by its owner), a
 * mint (signed by the mint authority, or by the mint itself when the authority
 * is revoked) and a multisig (signed by M of its signers). The program tells
 * them apart by the account's size. Wrapped SOL accounts are rejected.
 *
 * @param source       Token account, mint or multisig holding the excess
 * @param destination  Where the lamports go
 * @param authority    Owner / mint authority / multisig account
 * @param multiSigners Signers when `authority` is a multisig
 * @param programId    Token or Token-2022 program
 */
export function createWithdrawExcessLamportsInstruction(
  source: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  multiSigners: PublicKey[] = [],
  programId: PublicKey = TOKEN_PROGRAM_ID,
) {
  const keys = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    {
      pubkey: authority,
      isSigner: multiSigners.length === 0,
      isWritable: false,
    },
    ...multiSigners.map((pubkey) => ({
      pubkey,
      isSigner: true,
      isWritable: false,
    })),
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION]),
  });
}
