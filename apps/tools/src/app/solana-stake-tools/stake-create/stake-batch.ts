import { transactionErrorMessage } from "@/connector/transaction-error";
import type { KitClient } from "@/connector/use-kit-client";
import { STAKE_ACCOUNT_SIZE } from "@/lib/solana/stake-account";
import {
  getAuthorizeInstruction,
  getDelegateStakeInstruction,
  getInitializeInstruction,
  getSetLockupInstruction,
  STAKE_PROGRAM_ADDRESS,
  StakeAuthorize,
} from "@solana-program/stake";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  address,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
  estimateAndSetResourceLimitsFactory,
  estimateResourceLimitsFactory,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  isSolanaError,
  isTransactionModifyingSigner,
  lamports,
  partiallySignTransaction,
  sendAndConfirmTransactionFactory,
  setTransactionMessageLifetimeUsingBlockhash,
  SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
  type Instruction,
  type KeyPairSigner,
  type Lamports,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import type { CSVRow } from "./csv-rows";

export { STAKE_ACCOUNT_SIZE };
/** Rows signed per wallet prompt when the wallet supports multi-transaction signing. */
export const BATCH_SIZE = 10;

export type RowUpdate =
  | { status: "processing" }
  | { status: "confirmed"; signature: Signature }
  | { status: "failed"; error: string };

export type StakeRow = { id: string; row: CSVRow };

/**
 * One stake account per row, built as a single transaction: create and
 * initialize with the owner as every authority and as custodian, delegate
 * while the owner is still the staker, hand off the authorities, then move
 * the custodian.
 */
export function buildStakeAccountInstructions(
  owner: TransactionSigner,
  stake: KeyPairSigner,
  row: CSVRow,
  rentReserve: Lamports,
): Instruction[] {
  // The CSV amount is what gets delegated; the rent reserve is funded on top.
  const accountLamports = lamports(BigInt(row.stake_amount) + rentReserve);

  const instructions: Instruction[] = [
    getCreateAccountInstruction({
      payer: owner,
      newAccount: stake,
      lamports: accountLamports,
      space: BigInt(STAKE_ACCOUNT_SIZE),
      programAddress: STAKE_PROGRAM_ADDRESS,
    }),
    getInitializeInstruction({
      stake: stake.address,
      arg0: { staker: owner.address, withdrawer: owner.address },
      arg1: {
        unixTimestamp: row.unlock_date
          ? Math.floor(Date.parse(row.unlock_date) / 1000)
          : 0,
        epoch: 0,
        custodian: owner.address,
      },
    }),
  ];

  if (row.validator) {
    instructions.push(
      getDelegateStakeInstruction({
        stake: stake.address,
        vote: address(row.validator),
        stakeAuthority: owner,
      }),
    );
  }
  if (row.stake_authority) {
    instructions.push(
      getAuthorizeInstruction({
        stake: stake.address,
        authority: owner,
        arg0: address(row.stake_authority),
        arg1: StakeAuthorize.Staker,
      }),
    );
  }
  if (row.withdraw_authority) {
    instructions.push(
      getAuthorizeInstruction({
        stake: stake.address,
        authority: owner,
        lockupAuthority: owner,
        arg0: address(row.withdraw_authority),
        arg1: StakeAuthorize.Withdrawer,
      }),
    );
  }
  if (row.lockup_custodian) {
    instructions.push(
      getSetLockupInstruction({
        stake: stake.address,
        authority: owner,
        unixTimestamp: null,
        epoch: null,
        custodian: address(row.lockup_custodian),
      }),
    );
  }

  return instructions;
}

/** Whether the client's wallet signer can sign several transactions in one prompt. */
export const supportsBatchSigning = (client: KitClient) =>
  isTransactionModifyingSigner(client.payer);

/** Creates one stake account through the client's executor (one wallet prompt per row). */
export async function sendStakeRow(
  client: KitClient,
  row: CSVRow,
  rentReserve: Lamports,
): Promise<Signature> {
  const stake = await generateKeyPairSigner();
  const result = await client.sendTransaction(
    buildStakeAccountInstructions(client.payer, stake, row, rentReserve),
  );
  return result.context.signature;
}

/**
 * Creates stake accounts in batches signed with a single wallet prompt each.
 *
 * The client's executor signs one message at a time, so this goes one level
 * down: plan each row with the client, attach a blockhash and estimated
 * compute limits, compile, hand the whole batch to the wallet signer's
 * `modifyAndSignTransactions` (Wallet Standard multi-sign), add each stake
 * keypair's signature, then send and confirm concurrently.
 *
 * Falls back to {@link sendStakeRow} per row when the wallet refuses
 * multi-transaction signing.
 */
export async function sendStakeRowsInBatches(
  client: KitClient,
  rows: StakeRow[],
  rentReserve: Lamports,
  onUpdate: (id: string, update: RowUpdate) => void,
): Promise<void> {
  const walletSigner = client.payer;
  if (!isTransactionModifyingSigner(walletSigner)) {
    await sendRowsOneByOne(client, rows, rentReserve, onUpdate);
    return;
  }

  const estimateAndSetResourceLimits = estimateAndSetResourceLimitsFactory(
    withComputeUnitBuffer(estimateResourceLimitsFactory({ rpc: client.rpc })),
  );
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc: client.rpc,
    rpcSubscriptions: client.rpcSubscriptions,
  });

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    batch.forEach(({ id }) => onUpdate(id, { status: "processing" }));

    try {
      // Plan: fee payer and provisory compute limits, no lifetime yet.
      const { value: latestBlockhash } = await client.rpc
        .getLatestBlockhash()
        .send();
      const prepared = await Promise.all(
        batch.map(async ({ row }) => {
          const stake = await generateKeyPairSigner();
          const planned = await client.planTransaction(
            buildStakeAccountInstructions(
              walletSigner,
              stake,
              row,
              rentReserve,
            ),
          );
          const message = await estimateAndSetResourceLimits(
            setTransactionMessageLifetimeUsingBlockhash(
              latestBlockhash,
              planned,
            ),
          );
          return { stake, transaction: compileTransaction(message) };
        }),
      );

      // One wallet prompt for the whole batch. The wallet signs first because
      // it may rewrite the message; each stake keypair signs the result.
      let walletSigned;
      try {
        walletSigned = await walletSigner.modifyAndSignTransactions(
          prepared.map((p) => p.transaction),
        );
      } catch (error) {
        if (
          isSolanaError(
            error,
            SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
          )
        ) {
          await sendRowsOneByOne(
            client,
            rows.slice(start),
            rentReserve,
            onUpdate,
          );
          return;
        }
        throw error;
      }

      await Promise.all(
        walletSigned.map(async (transaction, i) => {
          const { id } = batch[i]!;
          try {
            const signed = await partiallySignTransaction(
              [prepared[i]!.stake.keyPair],
              transaction,
            );
            assertIsSendableTransaction(signed);
            assertIsTransactionWithBlockhashLifetime(signed);
            await sendAndConfirm(signed, { commitment: "confirmed" });
            onUpdate(id, {
              status: "confirmed",
              signature: getSignatureFromTransaction(signed),
            });
          } catch (error) {
            onUpdate(id, {
              status: "failed",
              error: transactionErrorMessage(error),
            });
          }
        }),
      );
    } catch (error) {
      // Planning or signing failed for the whole batch (e.g. the user rejected).
      batch.forEach(({ id }) =>
        onUpdate(id, {
          status: "failed",
          error: transactionErrorMessage(error),
        }),
      );
    }
  }
}

async function sendRowsOneByOne(
  client: KitClient,
  rows: StakeRow[],
  rentReserve: Lamports,
  onUpdate: (id: string, update: RowUpdate) => void,
) {
  for (const { id, row } of rows) {
    onUpdate(id, { status: "processing" });
    try {
      const signature = await sendStakeRow(client, row, rentReserve);
      onUpdate(id, { status: "confirmed", signature });
    } catch (error) {
      onUpdate(id, { status: "failed", error: transactionErrorMessage(error) });
    }
  }
}

/** Adds headroom to a simulated compute estimate, like the client's executor does. */
const withComputeUnitBuffer =
  (
    estimate: ReturnType<typeof estimateResourceLimitsFactory>,
  ): ReturnType<typeof estimateResourceLimitsFactory> =>
  async (message, config) => {
    const limits = await estimate(message, config);
    return {
      ...limits,
      computeUnitLimit: Math.min(
        1_400_000,
        Math.ceil(limits.computeUnitLimit * 1.1) + 300,
      ),
    };
  };
