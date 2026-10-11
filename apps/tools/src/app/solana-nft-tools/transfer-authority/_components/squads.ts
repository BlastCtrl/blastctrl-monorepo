import { isPublicKey } from "@/lib/solana/common";
import { useConnection } from "@solana/wallet-adapter-react";
import type { AccountInfo } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import bs58 from "bs58";
import type { Batch } from "./transactions";
import { buildTransaction } from "./transactions";

/** Squads v4, the program behind app.squads.so. */
export const SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);

/**
 * Squads executes a proposal's instructions inside one instruction of its
 * own, which gets the default 200,000 compute units. On devnet, 5
 * verifications took 118,305 of them and 10 ran out.
 */
export const MAX_NFTS_PER_SQUADS_TRANSACTION = 5;

/** Anchor's discriminator for Squads v4's `Multisig` account. */
const MULTISIG_DISCRIMINATOR = [224, 116, 121, 186, 68, 161, 79, 236];

/**
 * A multisig's vault, the address that holds its assets and signs for it.
 * The multisig account itself can never sign, so anything handed to it
 * instead of the vault is stuck for good.
 */
export function squadsVault(multisig: PublicKey, index = 0) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("multisig"),
      multisig.toBuffer(),
      Buffer.from("vault"),
      Buffer.from([index]),
    ],
    SQUADS_PROGRAM_ID,
  )[0];
}

export function isSquadsMultisig(
  account: Pick<AccountInfo<Buffer>, "owner" | "data"> | null,
) {
  return (
    !!account &&
    account.owner.equals(SQUADS_PROGRAM_ID) &&
    MULTISIG_DISCRIMINATOR.every((byte, i) => account.data[i] === byte)
  );
}

/**
 * Whether an address is a Squads multisig account rather than a vault, and
 * if so, the address of its first vault.
 */
export function useSquadsMultisig(address: string) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["squads-multisig", connection.rpcEndpoint, address],
    queryFn: async () => {
      const multisig = new PublicKey(address);
      const account = await connection.getAccountInfo(multisig);
      return isSquadsMultisig(account)
        ? { vault: squadsVault(multisig).toBase58() }
        : null;
    },
    enabled: isPublicKey(address),
    staleTime: Infinity,
  });
}

/**
 * An unsigned transaction with the vault as fee payer and signer, in the
 * base58 form the Squads transaction builder imports. Squads keeps only its
 * instructions and runs them from the vault once the proposal is approved.
 */
export function serializeForSquads(
  batch: Batch,
  vault: PublicKey,
  lifetime: { blockhash: string; lastValidBlockHeight: number },
) {
  return bs58.encode(
    buildTransaction(batch, vault, lifetime).serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
  );
}
