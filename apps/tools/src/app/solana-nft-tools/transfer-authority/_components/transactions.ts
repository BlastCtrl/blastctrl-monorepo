import {
  updateNftInstructions,
  verifyCreatorInstructions,
} from "@/lib/solana/metaplex-token-metadata";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  fillTransactionMessageProvisoryResourceLimits,
  getTransactionSize,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { TransferPlan, VerifyPlan } from "./plan";

/**
 * Leaves room for what wallets add before signing (Phantom's Lighthouse
 * assertions, priority fees) under the 1232 byte limit.
 */
export const MAX_TRANSACTION_BYTES = 900;

/**
 * Phantom only adds its Lighthouse assertions when they fit for every
 * account a transaction changes, and warns about the dApp otherwise. Each
 * NFT changes one metadata account; see reclaim-rent's
 * `ACCOUNTS_PER_TRANSACTION`, where 12 accounts still got them.
 */
export const MAX_NFTS_PER_TRANSACTION = 10;

export type ReadyTransfer = Extract<TransferPlan, { status: "ready" }>;
export type ReadyVerify = Extract<VerifyPlan, { status: "ready" }>;

/**
 * Step 1: one `UpdateV1` signed and paid for by the current authority: the
 * wallet's signer, or a noop signer for a Squads vault, which signs through
 * the proposal.
 */
export async function transferInstruction(
  plan: ReadyTransfer,
  authority: TransactionSigner,
  newAuthority: Address,
): Promise<Instruction> {
  const { metadata, creators } = plan;
  const [instruction] = await updateNftInstructions(authority, plan.mint, {
    newUpdateAuthority: newAuthority,
    // `data` is all or nothing, so changing the creators means sending the
    // rest of it unchanged.
    data: creators
      ? {
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
          sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
          creators,
        }
      : undefined,
  });
  return instruction!;
}

/** Step 2: one `VerifyCreatorV1` signed by the creator. */
export async function verifyInstruction(
  plan: ReadyVerify,
  creator: TransactionSigner,
): Promise<Instruction> {
  const [instruction] = await verifyCreatorInstructions(creator, plan.mint);
  return instruction!;
}

export type Batch = {
  index: number;
  mints: Address[];
  instructions: Instruction[];
};

/** Stands in for the blockhash while measuring; any 32 bytes do. */
const PLACEHOLDER_LIFETIME = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 0n,
};

/**
 * Bytes on the wire as the kit client sends it: one signature slot, and the
 * compute-limit instruction the client adds.
 */
export function transactionSize(
  instructions: Instruction[],
  feePayer: Address,
) {
  return getTransactionSize(
    compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(feePayer, m),
        (m) =>
          setTransactionMessageLifetimeUsingBlockhash(PLACEHOLDER_LIFETIME, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
        fillTransactionMessageProvisoryResourceLimits,
      ),
    ),
  );
}

export type PackOptions = { maxBytes?: number; maxPerTransaction?: number };

/**
 * Packs one instruction per NFT into as few transactions as fit under
 * `maxBytes` and `maxPerTransaction`. An instruction too big to share a
 * transaction gets one to itself.
 */
export function packBatches(
  items: { mint: Address; instruction: Instruction }[],
  feePayer: Address,
  {
    maxBytes = MAX_TRANSACTION_BYTES,
    maxPerTransaction = MAX_NFTS_PER_TRANSACTION,
  }: PackOptions = {},
): Batch[] {
  const batches: Batch[] = [];
  let current: Batch | null = null;
  for (const { mint, instruction } of items) {
    if (
      current &&
      current.instructions.length < maxPerTransaction &&
      transactionSize([...current.instructions, instruction], feePayer) <=
        maxBytes
    ) {
      current.mints.push(mint);
      current.instructions.push(instruction);
      continue;
    }
    current = {
      index: batches.length,
      mints: [mint],
      instructions: [instruction],
    };
    batches.push(current);
  }
  return batches;
}

/** Step 1 for every ready NFT, packed with {@link packBatches}. */
export async function transferBatches(
  plans: ReadyTransfer[],
  authority: TransactionSigner,
  newAuthority: Address,
  options?: PackOptions,
): Promise<Batch[]> {
  const items = await Promise.all(
    plans.map(async (plan) => ({
      mint: plan.mint,
      instruction: await transferInstruction(plan, authority, newAuthority),
    })),
  );
  return packBatches(items, authority.address, options);
}

/** Step 2 for every ready NFT, packed with {@link packBatches}. */
export async function verifyBatches(
  plans: ReadyVerify[],
  creator: TransactionSigner,
  options?: PackOptions,
): Promise<Batch[]> {
  const items = await Promise.all(
    plans.map(async (plan) => ({
      mint: plan.mint,
      instruction: await verifyInstruction(plan, creator),
    })),
  );
  return packBatches(items, creator.address, options);
}
