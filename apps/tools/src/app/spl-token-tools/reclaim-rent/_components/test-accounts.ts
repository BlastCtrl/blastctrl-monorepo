import { chunk } from "@/lib/utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import devnetMints from "./demo-mints.devnet.json";
import mainnetMints from "./demo-mints.json";

export type DemoMint = { name: string; mint: PublicKey; program: PublicKey };

const toDemoMints = (
  list: { id: string; name: string; tokenProgram: string }[],
): DemoMint[] =>
  list.map((m) => ({
    name: m.name,
    mint: new PublicKey(m.id),
    program: new PublicKey(m.tokenProgram),
  }));

/**
 * For the dev-only test panel: real mainnet mints, half on Token and half on
 * Token-2022 with a spread of extensions, so the accounts made for them come
 * in several sizes.
 */
export const DEMO_MINTS = toDemoMints(mainnetMints);

/**
 * The devnet counterpart: mints made for the panel, with the same split and
 * a similar spread of extensions. Devnet gets reset now and then; if they
 * disappear, make a new set and replace the file.
 */
export const DEVNET_DEMO_MINTS = toDemoMints(devnetMints);

/**
 * The demo mints a network has, or null where there are none. Like the rest
 * of the app, a custom RPC url counts as mainnet.
 */
export function demoMintsFor(network: string): DemoMint[] | null {
  switch (network) {
    case "devnet":
      return DEVNET_DEMO_MINTS;
    case "testnet":
      return null;
    default:
      return DEMO_MINTS;
  }
}

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
  mints: DemoMint[],
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
