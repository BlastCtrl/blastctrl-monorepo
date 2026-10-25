import {
  decodeBatch,
  decodeMultisig,
  decodeProposal,
  decodeVaultBatchTransaction,
  encodeVaultTransactionMessage,
  findBatchTransactionPda,
  findProposalPda,
  findTransactionPda,
  findVaultPda,
  getBatchAddTransactionInstruction,
  getBatchCreateInstruction,
  getBatchExecuteTransactionInstruction,
  getProposalActivateInstruction,
  getProposalApproveInstruction,
  getProposalCreateInstruction,
  hasPermission,
  MULTISIG_DISCRIMINATOR,
  Permission,
  SQUADS_MULTISIG_PROGRAM_ADDRESS,
  vaultTransactionExecutionAccounts,
} from "@blastctrl/squads";
import {
  containsBytes,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type ReadonlyUint8Array,
  type Rpc,
  type Slot,
  type TransactionSigner,
} from "@solana/kit";

/**
 * Squads v4 batch proposals on the kit program client `@blastctrl/squads`
 * (Codama-generated from the program's IDL, with the Squads message format
 * and execution-account logic ported into its hooked helpers). Reads go
 * through the kit RPC and the generated decoders; PDAs are derived with kit,
 * so everything here is async.
 *
 * The member is passed as a `TransactionSigner`, the kit client's wallet
 * signer, so the instructions carry the signer the client signs with (kit
 * refuses two different signers for one address). A vault never signs
 * client-side: the instructions it will run are compiled into the stored
 * message, and the program signs for it when the batch executes.
 */

/** Squads v4, the program behind app.squads.so. */
export const SQUADS_PROGRAM_ADDRESS: Address = SQUADS_MULTISIG_PROGRAM_ADDRESS;

/**
 * A multisig's vault, the address that holds its assets and signs for it.
 * The multisig account itself can never sign, so anything handed to it
 * instead of the vault is stuck for good.
 */
export async function squadsVault(
  multisigAddress: Address,
  index = 0,
): Promise<Address> {
  const [vault] = await findVaultPda({ multisig: multisigAddress, index });
  return vault;
}

/** The account of a multisig's transaction or batch at `index`. */
const transactionAddress = async (multisigAddress: Address, index: bigint) =>
  (await findTransactionPda({ multisig: multisigAddress, index }))[0];

/** The proposal that goes with the transaction or batch at `index`. */
const proposalAddress = async (multisigAddress: Address, index: bigint) =>
  (
    await findProposalPda({
      multisig: multisigAddress,
      transactionIndex: index,
    })
  )[0];

/** Transaction `transactionIndex` (1-based) of the batch at `batchIndex`. */
const batchTransactionAddress = async (
  multisigAddress: Address,
  batchIndex: bigint,
  transactionIndex: number,
) =>
  (
    await findBatchTransactionPda({
      multisig: multisigAddress,
      batchIndex,
      transactionIndex,
    })
  )[0];

/** Whether an account is a Squads multisig, by its owner and discriminator. */
export function isSquadsMultisigAccount(
  account: { programAddress: Address; data: ReadonlyUint8Array } | null,
) {
  return (
    !!account &&
    account.programAddress === SQUADS_PROGRAM_ADDRESS &&
    containsBytes(account.data, MULTISIG_DISCRIMINATOR, 0)
  );
}

export type SquadsMember = {
  address: Address;
  initiate: boolean;
  vote: boolean;
  execute: boolean;
};

export type SquadsMultisig = {
  address: Address;
  vault: Address;
  threshold: number;
  timeLock: number;
  members: SquadsMember[];
  /** The index the next transaction or batch gets is one past this. */
  transactionIndex: bigint;
};

/** A multisig's settings, or null when the address isn't a multisig. */
export async function fetchSquadsMultisig(
  rpc: Rpc<GetAccountInfoApi>,
  multisigAddress: Address,
): Promise<SquadsMultisig | null> {
  const account = await fetchEncodedAccount(rpc, multisigAddress, {
    commitment: "confirmed",
  });
  if (!account.exists || !isSquadsMultisigAccount(account)) return null;
  const { data: info } = decodeMultisig(account);
  return {
    address: multisigAddress,
    vault: await squadsVault(multisigAddress),
    threshold: info.threshold,
    timeLock: info.timeLock,
    members: info.members.map(({ key, permissions }) => ({
      address: key,
      initiate: hasPermission(permissions, Permission.Initiate),
      vote: hasPermission(permissions, Permission.Vote),
      execute: hasPermission(permissions, Permission.Execute),
    })),
    transactionIndex: info.transactionIndex,
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
  approved: Address[];
  /** How many transactions the batch holds so far. */
  size: number;
  /** How many of them have run. */
  executed: number;
};

/**
 * A batch and its proposal, or null when either doesn't exist. With
 * `minContextSlot`, an RPC node that hasn't reached that slot refuses to
 * answer (kit throws) rather than describing an older state.
 */
export async function fetchBatchProposal(
  rpc: Rpc<GetMultipleAccountsApi>,
  multisigAddress: Address,
  index: bigint,
  minContextSlot?: Slot,
): Promise<BatchProposal | null> {
  const [batchAccount, proposalAccount] = await fetchEncodedAccounts(
    rpc,
    [
      await transactionAddress(multisigAddress, index),
      await proposalAddress(multisigAddress, index),
    ],
    { commitment: "confirmed", minContextSlot },
  );
  if (!batchAccount?.exists || !proposalAccount?.exists) return null;
  try {
    const { data: batch } = decodeBatch(batchAccount);
    const { data: proposal } = decodeProposal(proposalAccount);
    return {
      index,
      status: proposal.status.__kind,
      approved: proposal.approved,
      size: batch.size,
      executed: batch.executedTransactionIndex,
    };
  } catch {
    // Not a batch: an ordinary vault transaction or config transaction.
    return null;
  }
}

/** Each inner array is one transaction, to send in order. */
export type Steps = Instruction[][];

/**
 * `transactions` as one batch under one proposal, so members approve once
 * for all of them. The batch is created as a draft, filled one transaction
 * at a time from `from` (1-based) on, then activated, and approved by the
 * creator when they can vote. Starting `from` past 1 finishes a draft whose
 * filling was interrupted. Each transaction is what the vault will run, as
 * kit instructions; `signer` is the member's wallet, which signs and pays
 * for every step.
 */
export async function batchProposalSteps({
  multisig: info,
  member,
  signer,
  index,
  transactions,
  from = 1,
}: {
  multisig: SquadsMultisig;
  member: SquadsMember;
  signer: TransactionSigner;
  index: bigint;
  transactions: Instruction[][];
  from?: number;
}): Promise<Steps> {
  const multisig = info.address;
  const batch = await transactionAddress(multisig, index);
  const proposal = await proposalAddress(multisig, index);
  const steps: Steps = [];
  if (from === 1) {
    steps.push([
      getBatchCreateInstruction({
        multisig,
        batch,
        creator: signer,
        vaultIndex: 0,
        memo: null,
      }),
      getProposalCreateInstruction({
        multisig,
        proposal,
        creator: signer,
        transactionIndex: index,
        draft: true,
      }),
    ]);
  }
  for (const [i, instructions] of transactions.slice(from - 1).entries()) {
    steps.push([
      getBatchAddTransactionInstruction({
        multisig,
        proposal,
        batch,
        transaction: await batchTransactionAddress(multisig, index, from + i),
        member: signer,
        ephemeralSigners: 0,
        transactionMessage: encodeVaultTransactionMessage({
          vault: info.vault,
          instructions,
        }),
      }),
    ]);
  }
  steps.push([
    getProposalActivateInstruction({ multisig, proposal, member: signer }),
    ...(member.vote ? [await approveInstruction(multisig, signer, index)] : []),
  ]);
  return steps;
}

export async function approveInstruction(
  multisigAddress: Address,
  member: TransactionSigner,
  index: bigint,
): Promise<Instruction> {
  return getProposalApproveInstruction({
    multisig: multisigAddress,
    member,
    proposal: await proposalAddress(multisigAddress, index),
    args: { memo: null },
  });
}

/**
 * One transaction per batch transaction that hasn't run yet, in order. The
 * batch and its stored transactions are read in one request, and each
 * execute instruction gets the accounts its stored transaction touches.
 */
export async function executeSteps(
  rpc: Rpc<GetMultipleAccountsApi>,
  info: SquadsMultisig,
  member: TransactionSigner,
  proposal: BatchProposal,
): Promise<Steps> {
  const multisig = info.address;
  const batch = await transactionAddress(multisig, proposal.index);
  const pending = Array.from(
    { length: proposal.size - proposal.executed },
    (_, i) => proposal.executed + 1 + i,
  );
  const [batchAccount, ...transactionAccounts] = await fetchEncodedAccounts(
    rpc,
    [
      batch,
      ...(await Promise.all(
        pending.map((i) =>
          batchTransactionAddress(multisig, proposal.index, i),
        ),
      )),
    ],
    { commitment: "confirmed" },
  );
  if (!batchAccount?.exists) {
    throw Error(`Batch ${proposal.index} of ${multisig} doesn't exist`);
  }
  const { data: batchInfo } = decodeBatch(batchAccount);
  const vault = await squadsVault(multisig, batchInfo.vaultIndex);
  const proposalPda = await proposalAddress(multisig, proposal.index);
  const steps: Steps = [];
  for (const [i, account] of transactionAccounts.entries()) {
    if (!account?.exists) {
      throw Error(
        `Transaction ${pending[i]} of batch ${proposal.index} doesn't exist`,
      );
    }
    const { data: transaction } = decodeVaultBatchTransaction(account);
    const execute = getBatchExecuteTransactionInstruction({
      multisig,
      member,
      proposal: proposalPda,
      batch,
      transaction: account.address,
    });
    // The accounts the stored transaction touches go after the fixed ones.
    steps.push([
      {
        ...execute,
        accounts: [
          ...execute.accounts,
          ...(await vaultTransactionExecutionAccounts(rpc, {
            message: transaction.message,
            ephemeralSignerBumps: transaction.ephemeralSignerBumps,
            vault,
            transaction: batch,
          })),
        ],
      },
    ]);
  }
  return steps;
}
