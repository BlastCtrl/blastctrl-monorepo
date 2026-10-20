import { chunk } from "@/lib/utils";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import type { ClusterType } from "@solana/connector/react";
import {
  address,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import devnetMints from "./demo-mints.devnet.json";
import mainnetMints from "./demo-mints.json";

export type DemoMint = { name: string; mint: Address; program: Address };

const toDemoMints = (
  list: { id: string; name: string; tokenProgram: string }[],
): DemoMint[] =>
  list.map((m) => ({
    name: m.name,
    mint: address(m.id),
    program: address(m.tokenProgram),
  }));

/**
 * For the test panel: real mainnet mints, half on Token and half on
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
 * The demo mints a cluster has, or null where there are none. Like the rest
 * of the app, a custom endpoint counts as mainnet.
 */
export function demoMintsFor(cluster: ClusterType | null): DemoMint[] | null {
  switch (cluster) {
    case "devnet":
      return DEVNET_DEMO_MINTS;
    case "testnet":
      return null;
    default:
      return DEMO_MINTS;
  }
}

/**
 * Whether the test accounts panel shows: always in development, and for
 * everyone on devnet, where the SOL it spends is free.
 */
export function showsTestAccountsPanel(
  cluster: ClusterType | null,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "development" || cluster === "devnet";
}

/**
 * Each mint costs 91 bytes (its account and the mint as keys, the create
 * and the transfer). 10 would fit, at 1,172 of 1,232 bytes, but leave a
 * wallet no room to add its own priority fee instructions.
 */
export const MINTS_PER_TRANSACTION = 8;

/**
 * Gives the wallet a token account for every mint, then sends each one
 * `excess` lamports on top of its rent, as one batch of instructions per
 * transaction. Creating is idempotent, so running it again only adds the
 * excess to accounts that are still there.
 */
export function buildTestAccountInstructions(
  mints: DemoMint[],
  wallet: TransactionSigner,
  excess: number,
): Promise<Instruction[][]> {
  return Promise.all(
    chunk(mints, MINTS_PER_TRANSACTION).map(async (batch) => {
      const instructions: Instruction[] = [];
      for (const { mint, program } of batch) {
        const [account] = await findAssociatedTokenPda({
          owner: wallet.address,
          tokenProgram: program,
          mint,
        });
        instructions.push(
          getCreateAssociatedTokenIdempotentInstruction({
            payer: wallet,
            ata: account,
            owner: wallet.address,
            mint,
            tokenProgram: program,
          }),
          getTransferSolInstruction({
            source: wallet,
            destination: account,
            amount: excess,
          }),
        );
      }
      return instructions;
    }),
  );
}
