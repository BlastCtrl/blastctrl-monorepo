import { chunk } from "@/lib/utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import demoMints from "./demo-mints.json";

/**
 * For the dev-only test panel: real mainnet mints, half on Token and half on
 * Token-2022 with a spread of extensions, so the accounts made for them come
 * in several sizes.
 */
export const DEMO_MINTS = demoMints.map((m) => ({
  name: m.name,
  mint: new PublicKey(m.id),
  program: new PublicKey(m.tokenProgram),
}));

/**
 * Each mint costs 91 bytes (its account and the mint as keys, the create
 * and the transfer). 10 would fit, at 1,172 of 1,232 bytes, but leave a
 * wallet no room to add its own priority fee instructions.
 */
export const MINTS_PER_TRANSACTION = 8;

type Lifetime = { blockhash: string; lastValidBlockHeight: number };

/**
 * Gives the wallet a token account for every mint, then sends each one
 * `excess` lamports on top of its rent. Creating is idempotent, so running
 * it again only adds the excess to accounts that are still there.
 */
export function buildTestAccountTransactions(
  mints: typeof DEMO_MINTS,
  wallet: PublicKey,
  lifetime: Lifetime,
  excess: number,
) {
  return chunk(mints, MINTS_PER_TRANSACTION).map((batch) => {
    const tx = new Transaction({ feePayer: wallet, ...lifetime });
    for (const { mint, program } of batch) {
      const account = getAssociatedTokenAddressSync(
        mint,
        wallet,
        false,
        program,
      );
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet,
          account,
          wallet,
          mint,
          program,
        ),
        SystemProgram.transfer({
          fromPubkey: wallet,
          toPubkey: account,
          lamports: excess,
        }),
      );
    }
    return tx;
  });
}
