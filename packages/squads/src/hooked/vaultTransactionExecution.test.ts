import {
  AccountRole,
  address,
  type Address,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import {
  findEphemeralSignerPda,
  findTransactionPda,
  findVaultPda,
} from "../generated";
import {
  isSignerIndex,
  isStaticWritableIndex,
  vaultTransactionExecutionAccounts,
  type VaultTransactionMessageLike,
} from "./vaultTransactionExecution";

const MULTISIG = address("Bf48pLxRT9urwqwnnDtTqaCTNHTi8oQGoVN6mBdqctVx");
const MEMBER = address("HJ8iBFuu3Eo8ux6aNHyoAmCB1CLqZMBd1dSgQ7ibsfvG");
const A = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const B = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
const PROGRAM = address("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TABLE = address("AddressLookupTab1e1111111111111111111111111");
const T0 = address("So11111111111111111111111111111111111111112");
const T1 = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const T2 = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** An RPC whose `getMultipleAccounts` serves jsonParsed lookup tables. */
function fakeRpc(tables: Record<Address, Address[]>) {
  const getMultipleAccounts = vi.fn((addresses: Address[]) => ({
    send: () =>
      Promise.resolve({
        context: { slot: 1n },
        value: addresses.map((key) =>
          tables[key]
            ? {
                data: {
                  parsed: {
                    info: { addresses: tables[key] },
                    type: "lookupTable",
                  },
                  program: "address-lookup-table",
                  space: 56n + 32n * BigInt(tables[key].length),
                },
                executable: false,
                lamports: 1n,
                owner: "AddressLookupTab1e1111111111111111111111111",
                rentEpoch: 0n,
                space: 56n + 32n * BigInt(tables[key].length),
              }
            : null,
        ),
      }),
  }));
  const rpc = { getMultipleAccounts } as unknown as Rpc<GetMultipleAccountsApi>;
  return { rpc, getMultipleAccounts };
}

async function setup() {
  const [vault] = await findVaultPda({ multisig: MULTISIG, index: 0 });
  const [transaction] = await findTransactionPda({
    multisig: MULTISIG,
    index: 8,
  });
  const [ephemeral] = await findEphemeralSignerPda({ transaction, index: 0 });
  return { vault, transaction, ephemeral };
}

describe("vault transaction execution accounts", () => {
  it("classifies static indices as the SDK does", () => {
    // [ws ws rs | wn rn rn]
    const message = {
      numSigners: 3,
      numWritableSigners: 2,
      numWritableNonSigners: 1,
      accountKeys: [0, 1, 2, 3, 4, 5],
    };
    expect(
      [0, 1, 2, 3, 4, 5, 6].map((i) => isStaticWritableIndex(message, i)),
    ).toEqual([true, true, false, true, false, false, false]);
    expect([0, 1, 2, 3].map((i) => isSignerIndex(message, i))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("marks signers except the vault and ephemeral signers; no lookups, no RPC", async () => {
    const { vault, transaction, ephemeral } = await setup();
    const message: VaultTransactionMessageLike = {
      numSigners: 3,
      numWritableSigners: 2,
      numWritableNonSigners: 1,
      accountKeys: [vault, ephemeral, MEMBER, A, B, PROGRAM],
      addressTableLookups: [],
    };
    const { rpc, getMultipleAccounts } = fakeRpc({});
    const metas = await vaultTransactionExecutionAccounts(rpc, {
      message,
      ephemeralSignerBumps: new Uint8Array([254]),
      vault,
      transaction,
    });
    expect(getMultipleAccounts).not.toHaveBeenCalled();
    expect(metas).toEqual([
      { address: vault, role: AccountRole.WRITABLE },
      { address: ephemeral, role: AccountRole.WRITABLE },
      { address: MEMBER, role: AccountRole.READONLY_SIGNER },
      { address: A, role: AccountRole.WRITABLE },
      { address: B, role: AccountRole.READONLY },
      { address: PROGRAM, role: AccountRole.READONLY },
    ]);
  });

  it("puts lookup tables first and their loaded accounts last", async () => {
    const { vault, transaction } = await setup();
    const message: VaultTransactionMessageLike = {
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 0,
      accountKeys: [vault, PROGRAM],
      addressTableLookups: [
        {
          accountKey: TABLE,
          writableIndexes: new Uint8Array([2]),
          readonlyIndexes: new Uint8Array([0, 1]),
        },
      ],
    };
    const { rpc, getMultipleAccounts } = fakeRpc({ [TABLE]: [T0, T1, T2] });
    const metas = await vaultTransactionExecutionAccounts(rpc, {
      message,
      ephemeralSignerBumps: [],
      vault,
      transaction,
    });
    expect(getMultipleAccounts).toHaveBeenCalledTimes(1);
    expect(getMultipleAccounts.mock.calls[0]?.[0]).toEqual([TABLE]);
    expect(metas).toEqual([
      { address: TABLE, role: AccountRole.READONLY },
      { address: vault, role: AccountRole.WRITABLE },
      { address: PROGRAM, role: AccountRole.READONLY },
      { address: T2, role: AccountRole.WRITABLE },
      { address: T0, role: AccountRole.READONLY },
      { address: T1, role: AccountRole.READONLY },
    ]);
  });

  it("fails on a missing table or index", async () => {
    const { vault, transaction } = await setup();
    const lookup = (index: number) => ({
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 0,
      accountKeys: [vault],
      addressTableLookups: [
        {
          accountKey: TABLE,
          writableIndexes: new Uint8Array([index]),
          readonlyIndexes: new Uint8Array(),
        },
      ],
    });
    const input = { ephemeralSignerBumps: [], vault, transaction };
    await expect(
      vaultTransactionExecutionAccounts(fakeRpc({}).rpc, {
        ...input,
        message: lookup(0),
      }),
    ).rejects.toThrow(`Address lookup table account ${TABLE} not found`);
    await expect(
      vaultTransactionExecutionAccounts(fakeRpc({ [TABLE]: [T0] }).rpc, {
        ...input,
        message: lookup(3),
      }),
    ).rejects.toThrow("does not contain address at index 3");
  });
});
