import {
  fetchJsonParsedAccounts,
  type Address,
  type AddressesByLookupTableAddress,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";

/**
 * The addresses each of `tables` holds, keyed by table, as
 * `compressTransactionMessageUsingAddressLookupTables` takes them. Read
 * `jsonParsed`, so the node decodes the table. A table that doesn't exist is
 * left out, and an instruction that needs it then fails to compile.
 */
export async function fetchAddressesByLookupTable(
  rpc: Rpc<GetMultipleAccountsApi>,
  tables: Address[],
): Promise<AddressesByLookupTableAddress> {
  if (tables.length === 0) return {};
  const accounts = await fetchJsonParsedAccounts<{ addresses: Address[] }[]>(
    rpc,
    tables,
  );
  const result: AddressesByLookupTableAddress = {};
  for (const account of accounts) {
    if (!account.exists) continue;
    if (account.data instanceof Uint8Array) {
      throw Error(`The RPC didn't parse lookup table ${account.address}`);
    }
    result[account.address] = account.data.addresses;
  }
  return result;
}
