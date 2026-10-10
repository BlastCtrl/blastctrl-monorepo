import {
  findMetadataPda,
  updateV1,
  verifyCreatorV1,
} from "@metaplex-foundation/mpl-token-metadata";
import type { Context, Instruction } from "@metaplex-foundation/umi";
import {
  createNoopSigner,
  none,
  publicKey,
  some,
} from "@metaplex-foundation/umi";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { TransferPlan, VerifyPlan } from "./plan";
import { trimNulls } from "./plan";

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

type UmiContext = Pick<Context, "eddsa" | "identity" | "payer" | "programs">;

export type ReadyTransfer = Extract<TransferPlan, { status: "ready" }>;
export type ReadyVerify = Extract<VerifyPlan, { status: "ready" }>;

/** Step 1: one `UpdateV1` signed and paid for by the current authority. */
export function transferInstruction(
  umi: UmiContext,
  plan: ReadyTransfer,
  wallet: string,
  newAuthority: string,
) {
  const signer = createNoopSigner(publicKey(wallet));
  const { metadata, creators } = plan;
  const [instruction] = updateV1(umi, {
    mint: publicKey(plan.mint),
    metadata: metadata.publicKey,
    authority: signer,
    payer: signer,
    newUpdateAuthority: some(publicKey(newAuthority)),
    // `data` is all or nothing, so changing the creators means sending the
    // rest of it unchanged.
    data: creators
      ? some({
          name: trimNulls(metadata.name),
          symbol: trimNulls(metadata.symbol),
          uri: trimNulls(metadata.uri),
          sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
          creators: some(creators),
        })
      : none(),
  }).getInstructions();
  return toWeb3(instruction!);
}

/** Step 2: one `VerifyCreatorV1` signed by the creator. */
export function verifyInstruction(
  umi: UmiContext,
  plan: ReadyVerify,
  wallet: string,
) {
  const [instruction] = verifyCreatorV1(umi, {
    metadata: findMetadataPda(umi, { mint: publicKey(plan.mint) }),
    authority: createNoopSigner(publicKey(wallet)),
  }).getInstructions();
  return toWeb3(instruction!);
}

function toWeb3(instruction: Instruction) {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.keys.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data),
  });
}

export type Batch = {
  index: number;
  mints: string[];
  instructions: TransactionInstruction[];
};

/** Stands in for the blockhash while measuring; any 32 bytes do. */
const PLACEHOLDER_BLOCKHASH = PublicKey.default.toBase58();

export function transactionSize(
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
) {
  return new Transaction({
    feePayer,
    blockhash: PLACEHOLDER_BLOCKHASH,
    lastValidBlockHeight: 0,
  })
    .add(...instructions)
    .serialize({ requireAllSignatures: false, verifySignatures: false }).length;
}

/**
 * Packs one instruction per NFT into as few transactions as fit under
 * `maxBytes` and `maxPerTransaction`. An instruction too big to share a
 * transaction gets one to itself.
 */
export function packBatches(
  items: { mint: string; instruction: TransactionInstruction }[],
  feePayer: PublicKey,
  {
    maxBytes = MAX_TRANSACTION_BYTES,
    maxPerTransaction = MAX_NFTS_PER_TRANSACTION,
  } = {},
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

export function buildTransaction(
  batch: Batch,
  feePayer: PublicKey,
  lifetime: { blockhash: string; lastValidBlockHeight: number },
) {
  return new Transaction({ feePayer, ...lifetime }).add(...batch.instructions);
}
