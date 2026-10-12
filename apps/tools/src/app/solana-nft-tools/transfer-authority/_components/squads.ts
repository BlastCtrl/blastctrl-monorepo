import { isPublicKey } from "@/lib/solana/common";
import { useConnection } from "@solana/wallet-adapter-react";
import type {
  AccountInfo,
  Connection,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { useQuery } from "@tanstack/react-query";
import type { Batch } from "./transactions";

const { Permission, Permissions } = multisig.types;

/** Squads v4, the program behind app.squads.so. */
export const SQUADS_PROGRAM_ID = multisig.PROGRAM_ID;

/**
 * Squads executes each transaction in a proposal inside one instruction of
 * its own, which gets the default 200,000 compute units unless whoever
 * executes it asks for more. Members may execute from the Squads app, which
 * may not ask for more, so batch transactions stay within the default.
 *
 * On devnet, 5 verifications took 118,305 units and 10 ran out.
 */
export const MAX_VERIFICATIONS_PER_SQUADS_TRANSACTION = 5;

/**
 * Two transfers took about 98,000 units on devnet, roughly 40,000 each over
 * Squads' own overhead. Transfers that change creators already stop at 2 by
 * size (adding them to the batch takes about 1,014 bytes); this caps the
 * smaller ones that leave creators alone.
 */
export const MAX_TRANSFERS_PER_SQUADS_TRANSACTION = 3;

/** Asked for when this tool executes, for headroom over the default. */
const EXECUTE_COMPUTE_UNITS = 400_000;

/**
 * A multisig's vault, the address that holds its assets and signs for it.
 * The multisig account itself can never sign, so anything handed to it
 * instead of the vault is stuck for good.
 */
export function squadsVault(multisigPda: PublicKey, index = 0) {
  return multisig.getVaultPda({ multisigPda, index })[0];
}

export function isSquadsMultisig(
  account: Pick<AccountInfo<Buffer>, "owner" | "data"> | null,
) {
  return (
    !!account &&
    account.owner.equals(SQUADS_PROGRAM_ID) &&
    multisig.accounts.multisigDiscriminator.every(
      (byte, i) => account.data[i] === byte,
    )
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
      const multisigPda = new PublicKey(address);
      const account = await connection.getAccountInfo(multisigPda);
      return isSquadsMultisig(account)
        ? { vault: squadsVault(multisigPda).toBase58() }
        : null;
    },
    enabled: isPublicKey(address),
    staleTime: Infinity,
  });
}

export type SquadsMember = {
  address: string;
  initiate: boolean;
  vote: boolean;
  execute: boolean;
};

export type SquadsMultisig = {
  address: string;
  vault: string;
  threshold: number;
  timeLock: number;
  members: SquadsMember[];
  /** The index the next transaction or batch gets is one past this. */
  transactionIndex: bigint;
};

/** A multisig's settings, or null when the address isn't a multisig. */
export async function fetchSquadsMultisig(
  connection: Connection,
  address: string,
): Promise<SquadsMultisig | null> {
  const multisigPda = new PublicKey(address);
  const account = await connection.getAccountInfo(multisigPda, "confirmed");
  if (!account || !isSquadsMultisig(account)) return null;
  const [info] = multisig.accounts.Multisig.fromAccountInfo(account);
  return {
    address,
    vault: squadsVault(multisigPda).toBase58(),
    threshold: info.threshold,
    timeLock: info.timeLock,
    members: info.members.map(({ key, permissions }) => ({
      address: key.toBase58(),
      initiate: Permissions.has(permissions, Permission.Initiate),
      vote: Permissions.has(permissions, Permission.Vote),
      execute: Permissions.has(permissions, Permission.Execute),
    })),
    transactionIndex: BigInt(info.transactionIndex.toString()),
  };
}

export type BatchProposal = {
  index: bigint;
  status:
    | "Draft"
    | "Active"
    | "Rejected"
    | "Approved"
    | "Executing"
    | "Executed"
    | "Cancelled";
  approved: string[];
  /** How many transactions the batch holds so far. */
  size: number;
  /** How many of them have run. */
  executed: number;
};

/** A batch and its proposal, or null when either doesn't exist. */
export async function fetchBatchProposal(
  connection: Connection,
  multisigAddress: string,
  index: bigint,
): Promise<BatchProposal | null> {
  const multisigPda = new PublicKey(multisigAddress);
  const [batchPda] = multisig.getTransactionPda({ multisigPda, index });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda,
    transactionIndex: index,
  });
  const [batchAccount, proposalAccount] =
    await connection.getMultipleAccountsInfo(
      [batchPda, proposalPda],
      "confirmed",
    );
  if (!batchAccount || !proposalAccount) return null;
  try {
    const [batch] = multisig.accounts.Batch.fromAccountInfo(batchAccount);
    const [proposal] =
      multisig.accounts.Proposal.fromAccountInfo(proposalAccount);
    return {
      index,
      status: proposal.status.__kind,
      approved: proposal.approved.map((key) => key.toBase58()),
      size: batch.size,
      executed: batch.executedTransactionIndex,
    };
  } catch {
    // Not a batch: an ordinary vault transaction or config transaction.
    return null;
  }
}

/** Each inner array is one transaction, sent in order. */
export type Steps = TransactionInstruction[][];

/**
 * The verifications as one batch under one proposal, so members approve
 * once for all of them. The batch is created as a draft, filled one
 * transaction at a time from `from` (1-based) on, then activated, and
 * approved by the creator when they can vote. Starting `from` past 1
 * finishes a draft whose filling was interrupted.
 */
export function batchProposalSteps({
  multisig: info,
  member,
  index,
  batches,
  from = 1,
}: {
  multisig: SquadsMultisig;
  member: SquadsMember;
  index: bigint;
  batches: Batch[];
  from?: number;
}): Steps {
  const multisigPda = new PublicKey(info.address);
  const memberKey = new PublicKey(member.address);
  const vault = new PublicKey(info.vault);
  const steps: Steps = [];
  if (from === 1) {
    steps.push([
      multisig.instructions.batchCreate({
        multisigPda,
        creator: memberKey,
        batchIndex: index,
        vaultIndex: 0,
      }),
      multisig.instructions.proposalCreate({
        multisigPda,
        creator: memberKey,
        transactionIndex: index,
        isDraft: true,
      }),
    ]);
  }
  batches.slice(from - 1).forEach((batch, i) => {
    steps.push([
      multisig.instructions.batchAddTransaction({
        multisigPda,
        member: memberKey,
        vaultIndex: 0,
        batchIndex: index,
        transactionIndex: from + i,
        ephemeralSigners: 0,
        transactionMessage: new TransactionMessage({
          payerKey: vault,
          // Squads stores the message without a blockhash.
          recentBlockhash: PublicKey.default.toBase58(),
          instructions: batch.instructions,
        }),
      }),
    ]);
  });
  steps.push([
    multisig.instructions.proposalActivate({
      multisigPda,
      member: memberKey,
      transactionIndex: index,
    }),
    ...(member.vote ? [approveInstruction(info, member, index)] : []),
  ]);
  return steps;
}

export function approveInstruction(
  info: SquadsMultisig,
  member: SquadsMember,
  index: bigint,
) {
  return multisig.instructions.proposalApprove({
    multisigPda: new PublicKey(info.address),
    member: new PublicKey(member.address),
    transactionIndex: index,
  });
}

/** One transaction per batch transaction that hasn't run yet, in order. */
export async function executeSteps(
  connection: Connection,
  info: SquadsMultisig,
  member: SquadsMember,
  proposal: BatchProposal,
): Promise<Steps> {
  const steps: Steps = [];
  for (let i = proposal.executed + 1; i <= proposal.size; i++) {
    const { instruction } = await multisig.instructions.batchExecuteTransaction(
      {
        connection,
        multisigPda: new PublicKey(info.address),
        member: new PublicKey(member.address),
        batchIndex: proposal.index,
        transactionIndex: i,
      },
    );
    steps.push([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: EXECUTE_COMPUTE_UNITS,
      }),
      instruction,
    ]);
  }
  return steps;
}
