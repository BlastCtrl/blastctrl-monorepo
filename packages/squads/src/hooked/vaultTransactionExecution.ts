// Ported from the Squads v4 SDK, Squads-Protocol/v4 sdk/multisig/src/utils.ts
// (`accountsForTransactionExecute`, `isStaticWritableIndex`, `isSignerIndex`)
// (MIT, per sdk/multisig/package.json).
/**
 * The remaining accounts `vaultTransactionExecute` and
 * `batchExecuteTransaction` need (`anchorRemainingAccounts` on the generated
 * builders): every account the stored message touches, in the order the
 * program reads them.
 */
import {
  AccountRole,
  fetchJsonParsedAccounts,
  type AccountMeta,
  type Address,
  type GetMultipleAccountsApi,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";

import { findEphemeralSignerPda } from "../generated";

/** The fields of a vault transaction message the helpers below read. */
export type VaultTransactionMessageLike = {
  numSigners: number;
  numWritableSigners: number;
  numWritableNonSigners: number;
  accountKeys: readonly Address[];
  addressTableLookups: readonly {
    accountKey: Address;
    writableIndexes: ReadonlyUint8Array;
    readonlyIndexes: ReadonlyUint8Array;
  }[];
};

type MessageHeader = Pick<
  VaultTransactionMessageLike,
  "numSigners" | "numWritableSigners" | "numWritableNonSigners"
> & { accountKeys: readonly unknown[] };

/** Whether the static account at `index` is writable. */
export function isStaticWritableIndex(
  message: MessageHeader,
  index: number,
): boolean {
  if (index >= message.accountKeys.length) return false;
  if (index < message.numWritableSigners) return true;
  if (index >= message.numSigners) {
    return index - message.numSigners < message.numWritableNonSigners;
  }
  return false;
}

/** Whether the static account at `index` is a signer of the message. */
export function isSignerIndex(
  message: Pick<MessageHeader, "numSigners">,
  index: number,
): boolean {
  return index < message.numSigners;
}

function role(isWritable: boolean, isSigner: boolean): AccountRole {
  if (isSigner) {
    return isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  }
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

export type VaultTransactionExecutionAccountsInput = {
  /** The stored message (`VaultTransaction` / `VaultBatchTransaction`). */
  message: VaultTransactionMessageLike;
  /** The transaction account's `ephemeralSignerBumps`; only the count matters. */
  ephemeralSignerBumps: ArrayLike<number>;
  /** The vault the transaction executes as. */
  vault: Address;
  /** The vault transaction or batch transaction account. */
  transaction: Address;
};

/**
 * The accounts to append to an execute instruction: first the address lookup
 * tables the message uses (readonly), then its static accounts (signers
 * except the vault and the ephemeral signer PDAs, which the program signs
 * for), then the accounts each table loads, writable ones first. Reads the
 * lookup tables through `rpc` only if the message has any.
 */
export async function vaultTransactionExecutionAccounts(
  rpc: Rpc<GetMultipleAccountsApi>,
  {
    message,
    ephemeralSignerBumps,
    vault,
    transaction,
  }: VaultTransactionExecutionAccountsInput,
): Promise<AccountMeta[]> {
  const ephemeralSigners = new Set<Address>(
    await Promise.all(
      Array.from({ length: ephemeralSignerBumps.length }, async (_, index) => {
        const [pda] = await findEphemeralSignerPda({ transaction, index });
        return pda;
      }),
    ),
  );

  const tableKeys = message.addressTableLookups.map(
    ({ accountKey }) => accountKey,
  );
  const tables = new Map<Address, readonly Address[]>();
  if (tableKeys.length > 0) {
    const unique = [...new Set(tableKeys)];
    const accounts = await fetchJsonParsedAccounts<{ addresses: Address[] }[]>(
      rpc,
      unique,
    );
    for (const account of accounts) {
      if (!account.exists) {
        throw new Error(
          `Address lookup table account ${account.address} not found`,
        );
      }
      const { data } = account as { data: unknown };
      const addresses = (data as { addresses?: unknown }).addresses;
      if (!Array.isArray(addresses)) {
        throw new Error(
          `Account ${account.address} is not an address lookup table`,
        );
      }
      tables.set(account.address, addresses as Address[]);
    }
  }

  const metas: AccountMeta[] = tableKeys.map((address) => ({
    address,
    role: AccountRole.READONLY,
  }));

  message.accountKeys.forEach((address, index) => {
    const isSigner =
      isSignerIndex(message, index) &&
      address !== vault &&
      !ephemeralSigners.has(address);
    metas.push({
      address,
      role: role(isStaticWritableIndex(message, index), isSigner),
    });
  });

  for (const lookup of message.addressTableLookups) {
    const addresses = tables.get(lookup.accountKey);
    if (!addresses) {
      throw new Error(
        `Address lookup table account ${lookup.accountKey} not found`,
      );
    }
    const load = (indexes: ReadonlyUint8Array, accountRole: AccountRole) => {
      for (const index of indexes) {
        const address = addresses[index];
        if (!address) {
          throw new Error(
            `Address lookup table account ${lookup.accountKey} does not contain address at index ${index}`,
          );
        }
        metas.push({ address, role: accountRole });
      }
    };
    load(lookup.writableIndexes, AccountRole.WRITABLE);
    load(lookup.readonlyIndexes, AccountRole.READONLY);
  }

  return metas;
}
