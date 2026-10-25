import { estimateAndSetResourceLimitsWithBuffer } from "@/connector/resource-limits";
import type { KitClient } from "@/connector/use-kit-client";
import type { GetAirdrop200 } from "@blastctrl/solace-sdk";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import type { TransactionPlannerConfig } from "@solana/connector/kit";
import {
  address,
  compileTransaction,
  getBase64EncodedWireTransaction,
  isSolanaError,
  isTransactionModifyingSigner,
  lamports,
  setTransactionMessageLifetimeUsingBlockhash,
  SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
  type Instruction,
  type MicroLamports,
  type Transaction,
  type TransactionSigner,
} from "@solana/kit";

export const TRANSACTION_CONFIG = {
  version: 0,
  microLamportsPerComputeUnit: 10_000n as MicroLamports,
} as const satisfies TransactionPlannerConfig;

export type AirdropBatch = GetAirdrop200["transactions"][number];
type AirdropInfo = Pick<
  GetAirdrop200,
  "mintAddress" | "decimals" | "tokenProgram"
>;

/** One signed batch, with the lifetime the backend needs to send and confirm it. */
export type SignedBatch = {
  batchId: number;
  blockhash: string;
  lastValidBlockHeight: number;
  minContextSlot: number;
  txBase64: string;
};

/**
 * Transfers for one batch: SOL straight from the wallet, or tokens from the
 * wallet's ATA to each recipient's ATA, creating the latter when missing. The
 * token program is the one stored with the airdrop, which the backend also
 * validates each transaction against.
 */
export async function batchInstructions(
  airdrop: AirdropInfo,
  batch: AirdropBatch,
  payer: TransactionSigner,
): Promise<Instruction[]> {
  if (!airdrop.mintAddress) {
    return batch.recipients.map((r) =>
      getTransferSolInstruction({
        source: payer,
        destination: address(r.address),
        amount: lamports(BigInt(r.atomicAmount)),
      }),
    );
  }

  const mint = address(airdrop.mintAddress);
  const tokenProgram = address(airdrop.tokenProgram);
  const [source] = await findAssociatedTokenPda({
    owner: payer.address,
    mint,
    tokenProgram,
  });
  const perRecipient = await Promise.all(
    batch.recipients.map(async (r) => {
      const owner = address(r.address);
      const [destination] = await findAssociatedTokenPda({
        owner,
        mint,
        tokenProgram,
      });
      return [
        getCreateAssociatedTokenIdempotentInstruction({
          payer,
          ata: destination,
          owner,
          mint,
          tokenProgram,
        }),
        getTransferCheckedInstruction(
          {
            source,
            mint,
            destination,
            authority: payer,
            amount: BigInt(r.atomicAmount),
            decimals: airdrop.decimals,
          },
          { programAddress: tokenProgram },
        ),
      ];
    }),
  );
  return perRecipient.flat();
}

/**
 * Builds, plans and signs one transaction per batch without sending: the
 * backend submits and confirms them. All batches share one blockhash, which is
 * returned along with the slot it was fetched at. The wallet is asked once for
 * the whole set when it supports multi-transaction signing.
 */
export async function signBatches(
  client: KitClient,
  airdrop: AirdropInfo,
  batches: AirdropBatch[],
): Promise<SignedBatch[]> {
  const { context, value: latestBlockhash } = await client.rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const estimateAndSetResourceLimits = estimateAndSetResourceLimitsWithBuffer(
    client.rpc,
  );

  const transactions = await Promise.all(
    batches.map(async (batch) => {
      const instructions = await batchInstructions(
        airdrop,
        batch,
        client.payer,
      );
      const planned = await client.planTransaction(instructions, {
        maxInstructionsPerTransaction: instructions.length + 2,
      });
      const message = await estimateAndSetResourceLimits(
        setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, planned),
      );
      return compileTransaction(message);
    }),
  );

  const signed = await signWithWallet(client.payer, transactions);
  return signed.map((transaction, i) => ({
    batchId: batches[i]!.id,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight),
    minContextSlot: Number(context.slot),
    txBase64: getBase64EncodedWireTransaction(transaction),
  }));
}

type CompiledTransaction = ReturnType<typeof compileTransaction>;

/** One wallet prompt for all transactions where supported, otherwise one each. */
async function signWithWallet(
  signer: TransactionSigner,
  transactions: CompiledTransaction[],
): Promise<readonly Transaction[]> {
  if (!isTransactionModifyingSigner(signer)) {
    throw new Error(
      "The connected wallet cannot sign transactions without sending them",
    );
  }
  try {
    return await signer.modifyAndSignTransactions(transactions);
  } catch (error) {
    if (
      !isSolanaError(
        error,
        SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
      )
    ) {
      throw error;
    }
    const result: Transaction[] = [];
    for (const transaction of transactions) {
      result.push(...(await signer.modifyAndSignTransactions([transaction])));
    }
    return result;
  }
}
