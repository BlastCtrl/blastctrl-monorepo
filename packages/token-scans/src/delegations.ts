import { TOKEN_2022_PROGRAM_ADDRESS } from "@blastctrl/kit-extensions";
import {
  AccountState,
  getTokenDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  getBase64Encoder,
  isSome,
  type Address,
  type Base64EncodedBytes,
  type GetProgramAccountsApi,
  type GetTokenAccountsByOwnerApi,
  type Rpc,
} from "@solana/kit";

export type ParsedDelegatedTokenAccount = {
  token_account: string;
  mint: string;
  balance: bigint;
  isFrozen: boolean;
  token_program: string;
  delegate: string;
  delegated_amount: bigint;
};

/** The RPC methods the delegation scan reads through. */
export type DelegationScanRpc = Rpc<
  GetProgramAccountsApi & GetTokenAccountsByOwnerApi
>;

/**
 * `COption::Some` tag (`u32` 1, little-endian) of the Token account's
 * `delegate` field at offset 72, so the RPC only returns delegated accounts.
 */
const DELEGATE_SOME_TAG = "AQAAAA==" as Base64EncodedBytes;

/**
 * Token (and Token-2022) accounts owned by `owner` that have a delegate set,
 * decoded with the fixed-size token decoder. The scan the revoke-delegations
 * tool lists from.
 */
export async function fetchDelegatedTokenAccounts(
  rpc: DelegationScanRpc,
  ownerAddress: Address,
  { abortSignal }: { abortSignal?: AbortSignal } = {},
): Promise<ParsedDelegatedTokenAccount[]> {
  const [legacy, token2022] = await Promise.all([
    rpc
      .getProgramAccounts(TOKEN_PROGRAM_ADDRESS, {
        encoding: "base64",
        filters: [
          { dataSize: 165n },
          {
            memcmp: {
              offset: 32n,
              bytes: ownerAddress,
              encoding: "base58",
            },
          },
          {
            memcmp: {
              offset: 72n,
              bytes: DELEGATE_SOME_TAG,
              encoding: "base64",
            },
          },
        ],
      })
      .send({ abortSignal }),
    // Token-2022 accounts have a variable size (extensions), so they are
    // listed by owner and filtered after decoding.
    rpc
      .getTokenAccountsByOwner(
        ownerAddress,
        { programId: TOKEN_2022_PROGRAM_ADDRESS },
        { encoding: "base64" },
      )
      .send({ abortSignal }),
  ]);

  // The fixed-size decoder reads only the base layout, which is all the
  // list needs; Token-2022 extensions follow it and are ignored.
  const decoder = getTokenDecoder();
  const base64 = getBase64Encoder();
  const parsedResults: ParsedDelegatedTokenAccount[] = [];
  for (const { pubkey, account } of [...legacy, ...token2022.value]) {
    const parsed = decoder.decode(base64.encode(account.data[0]));
    if (!isSome(parsed.delegate)) continue;
    parsedResults.push({
      token_account: pubkey,
      mint: parsed.mint,
      balance: parsed.amount,
      isFrozen: parsed.state === AccountState.Frozen,
      token_program: account.owner,
      delegate: parsed.delegate.value,
      delegated_amount: parsed.delegatedAmount,
    });
  }
  return parsedResults;
}
