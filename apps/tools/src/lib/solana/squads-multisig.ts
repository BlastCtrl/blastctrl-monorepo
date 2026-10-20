import {
  AccountRole,
  address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  isSignerRole,
  isWritableRole,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

/**
 * This is the only module that touches the Squads SDK, which is built on
 * web3.js: it takes `PublicKey`s and a web3 `TransactionMessage` for the
 * transactions a vault will run, and hands back web3 instructions. Reads go
 * through the kit RPC and the SDK's own account decoders; instructions are
 * mapped to kit at the boundary, so the kit client signs and sends them.
 * Executing is the one step that still needs a web3 `Connection`, because
 * the SDK reads the stored transaction through it.
 */

const { Permission, Permissions } = multisig.types;

/** Squads v4, the program behind app.squads.so. */
export const SQUADS_PROGRAM_ADDRESS = address(multisig.PROGRAM_ID.toBase58());

const toPublicKey = (account: Address) => new PublicKey(account);
const toAddress = (key: PublicKey): Address => address(key.toBase58());

/** A web3 instruction as kit's `{ programAddress, accounts, data }`. */
function toKitInstruction(instruction: TransactionInstruction): Instruction {
  return {
    programAddress: toAddress(instruction.programId),
    accounts: instruction.keys.map((key) => ({
      address: toAddress(key.pubkey),
      role: key.isSigner
        ? key.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : key.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: new Uint8Array(instruction.data),
  };
}

/** A kit instruction as web3's, for the message a vault will run. */
function toWeb3Instruction(instruction: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: toPublicKey(instruction.programAddress),
    keys: (instruction.accounts ?? []).map((account) => ({
      pubkey: toPublicKey(account.address),
      isSigner: isSignerRole(account.role),
      isWritable: isWritableRole(account.role),
    })),
    data: Buffer.from(instruction.data ?? new Uint8Array()),
  });
}

/**
 * A multisig's vault, the address that holds its assets and signs for it.
 * The multisig account itself can never sign, so anything handed to it
 * instead of the vault is stuck for good.
 */
export function squadsVault(multisigAddress: Address, index = 0): Address {
  return toAddress(
    multisig.getVaultPda({
      multisigPda: toPublicKey(multisigAddress),
      index,
    })[0],
  );
}

/** Whether an account is a Squads multisig, by its owner and discriminator. */
export function isSquadsMultisigAccount(
  account: { programAddress: Address; data: ReadonlyUint8Array } | null,
) {
  return (
    !!account &&
    account.programAddress === SQUADS_PROGRAM_ADDRESS &&
    multisig.accounts.multisigDiscriminator.every(
      (byte, i) => account.data[i] === byte,
    )
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
  const [info] = multisig.accounts.Multisig.deserialize(
    Buffer.from(account.data),
  );
  return {
    address: multisigAddress,
    vault: squadsVault(multisigAddress),
    threshold: info.threshold,
    timeLock: info.timeLock,
    members: info.members.map(({ key, permissions }) => ({
      address: toAddress(key),
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
  approved: Address[];
  /** How many transactions the batch holds so far. */
  size: number;
  /** How many of them have run. */
  executed: number;
};

/** A batch and its proposal, or null when either doesn't exist. */
export async function fetchBatchProposal(
  rpc: Rpc<GetMultipleAccountsApi>,
  multisigAddress: Address,
  index: bigint,
): Promise<BatchProposal | null> {
  const multisigPda = toPublicKey(multisigAddress);
  const [batchPda] = multisig.getTransactionPda({ multisigPda, index });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda,
    transactionIndex: index,
  });
  const [batchAccount, proposalAccount] = await fetchEncodedAccounts(
    rpc,
    [toAddress(batchPda), toAddress(proposalPda)],
    { commitment: "confirmed" },
  );
  if (!batchAccount?.exists || !proposalAccount?.exists) return null;
  try {
    const [batch] = multisig.accounts.Batch.deserialize(
      Buffer.from(batchAccount.data),
    );
    const [proposal] = multisig.accounts.Proposal.deserialize(
      Buffer.from(proposalAccount.data),
    );
    return {
      index,
      status: proposal.status.__kind,
      approved: proposal.approved.map(toAddress),
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
 * kit instructions; the member signs and pays for every step.
 */
export function batchProposalSteps({
  multisig: info,
  member,
  index,
  transactions,
  from = 1,
}: {
  multisig: SquadsMultisig;
  member: SquadsMember;
  index: bigint;
  transactions: Instruction[][];
  from?: number;
}): Steps {
  const multisigPda = toPublicKey(info.address);
  const memberKey = toPublicKey(member.address);
  const vault = toPublicKey(info.vault);
  const steps: Steps = [];
  if (from === 1) {
    steps.push([
      toKitInstruction(
        multisig.instructions.batchCreate({
          multisigPda,
          creator: memberKey,
          batchIndex: index,
          vaultIndex: 0,
        }),
      ),
      toKitInstruction(
        multisig.instructions.proposalCreate({
          multisigPda,
          creator: memberKey,
          transactionIndex: index,
          isDraft: true,
        }),
      ),
    ]);
  }
  transactions.slice(from - 1).forEach((instructions, i) => {
    steps.push([
      toKitInstruction(
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
            instructions: instructions.map(toWeb3Instruction),
          }),
        }),
      ),
    ]);
  });
  steps.push([
    toKitInstruction(
      multisig.instructions.proposalActivate({
        multisigPda,
        member: memberKey,
        transactionIndex: index,
      }),
    ),
    ...(member.vote
      ? [approveInstruction(info.address, member.address, index)]
      : []),
  ]);
  return steps;
}

export function approveInstruction(
  multisigAddress: Address,
  member: Address,
  index: bigint,
): Instruction {
  return toKitInstruction(
    multisig.instructions.proposalApprove({
      multisigPda: toPublicKey(multisigAddress),
      member: toPublicKey(member),
      transactionIndex: index,
    }),
  );
}

/**
 * One transaction per batch transaction that hasn't run yet, in order. The
 * SDK reads each stored transaction for the accounts its execution touches,
 * through a web3 `Connection` on `rpcUrl`.
 */
export async function executeSteps(
  rpcUrl: string,
  info: SquadsMultisig,
  member: SquadsMember,
  proposal: BatchProposal,
): Promise<Steps> {
  const connection = new Connection(rpcUrl, "confirmed");
  const steps: Steps = [];
  for (let i = proposal.executed + 1; i <= proposal.size; i++) {
    const { instruction } = await multisig.instructions.batchExecuteTransaction(
      {
        connection,
        multisigPda: toPublicKey(info.address),
        member: toPublicKey(member.address),
        batchIndex: proposal.index,
        transactionIndex: i,
      },
    );
    steps.push([toKitInstruction(instruction)]);
  }
  return steps;
}
