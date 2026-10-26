import {
  isMintAccountData,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@blastctrl/kit-extensions";
import { decodeMint, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  unwrapOption,
  type Address,
  type EncodedAccount,
  type GetAccountInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetMultipleAccountsApi,
  type GetTokenAccountsByOwnerApi,
  type Rpc,
} from "@solana/kit";
import type { DiscoveredAccount, ParsedTokenState } from "./accounts";
import { keepOpenReason } from "./accounts";

/** The RPC methods a scan reads through. */
export type ScanRpc = Rpc<
  GetAccountInfoApi &
    GetMinimumBalanceForRentExemptionApi &
    GetMultipleAccountsApi &
    GetTokenAccountsByOwnerApi
>;

export type ScanOptions = {
  /** Fail with {@link ScanLimitError} past this many token accounts. */
  maxAccounts?: number;
  /** Passed to every RPC request of the scan. */
  abortSignal?: AbortSignal;
};

export class ScanLimitError extends Error {
  constructor() {
    super(
      "This address has too many token accounts for one scan. No estimate was returned.",
    );
    this.name = "ScanLimitError";
  }
}

/**
 * Token accounts (both token programs) of a wallet, plus the mints of those
 * tokens that the wallet is the mint authority of. Each comes with what it
 * holds and the rent-exempt minimum for its size; excess is the difference.
 *
 * Mints are found among the wallet's own tokens because there is no cheap
 * way to search the chain by mint authority, so this does not find every
 * controlled mint; {@link lookupReclaimableMint} checks one by address.
 */
export async function discoverReclaimableAccounts(
  rpc: ScanRpc,
  owner: Address,
  { maxAccounts = Infinity, abortSignal }: ScanOptions = {},
): Promise<DiscoveredAccount[]> {
  const tokenAccounts = await fetchTokenAccounts(rpc, owner, abortSignal);
  if (tokenAccounts.length > maxAccounts) throw new ScanLimitError();
  const mints = await fetchControlledMints(
    rpc,
    owner,
    [...new Set(tokenAccounts.map((a) => a.mint))],
    abortSignal,
  );
  return withMinimums(rpc, [...tokenAccounts, ...mints], abortSignal);
}

export type DiscoveredMintLookup =
  | { status: "ok"; account: DiscoveredAccount }
  | { status: "other-authority"; authority: Address }
  | { status: "no-authority" }
  | { status: "not-a-mint" }
  | { status: "not-found" };

/** Checks one mint by address with the same authority rule as a scan. */
export async function lookupReclaimableMint(
  rpc: ScanRpc,
  mint: Address,
  owner: Address,
  { abortSignal }: Pick<ScanOptions, "abortSignal"> = {},
): Promise<DiscoveredMintLookup> {
  const account = await fetchEncodedAccount(rpc, mint, { abortSignal });
  if (!account.exists) return { status: "not-found" };

  const result = classifyMint(account, owner);
  if (result.status !== "ok") return result;

  const [withMinimum] = await withMinimums(rpc, [result.account], abortSignal);
  return { status: "ok", account: withMinimum! };
}

type WithoutMinimum = Omit<DiscoveredAccount, "minimum">;

async function fetchTokenAccounts(
  rpc: ScanRpc,
  owner: Address,
  abortSignal: AbortSignal | undefined,
): Promise<WithoutMinimum[]> {
  const programs = [
    { id: TOKEN_PROGRAM_ADDRESS, program: "token" as const },
    { id: TOKEN_2022_PROGRAM_ADDRESS, program: "token-2022" as const },
  ];

  const results = await Promise.all(
    programs.map(async ({ id, program }) => {
      const { value } = await rpc
        .getTokenAccountsByOwner(
          owner,
          { programId: id },
          { encoding: "jsonParsed" },
        )
        .send({ abortSignal });
      return value.map(({ pubkey, account }) => {
        const info = account.data.parsed.info;
        return {
          id: pubkey as string,
          kind: "token-account" as const,
          address: pubkey as string,
          mint: info.mint as string,
          program,
          tokenBalance: info.tokenAmount.uiAmountString,
          isEmpty: info.tokenAmount.amount === "0",
          dataLength: Number(account.data.space),
          lamports: Number(account.lamports),
          blockedReason: info.isNative
            ? "Wrapped SOL accounts aren't supported"
            : undefined,
          keepOpenReason: keepOpenReason(
            {
              state: info.state,
              closeAuthority: info.closeAuthority,
              extensions: info.extensions as ParsedTokenState["extensions"],
            },
            owner,
          ),
        };
      });
    }),
  );

  return results.flat();
}

async function fetchControlledMints(
  rpc: ScanRpc,
  owner: Address,
  mints: string[],
  abortSignal: AbortSignal | undefined,
) {
  const accounts = (
    await mapConcurrent(chunk(mints, 100), (batch) =>
      fetchEncodedAccounts(
        rpc,
        batch.map((m) => address(m)),
        { abortSignal },
      ),
    )
  ).flat();

  const controlled: WithoutMinimum[] = [];
  for (const account of accounts) {
    if (!account.exists) continue;
    const result = classifyMint(account, owner);
    if (result.status === "ok") controlled.push(result.account);
  }
  return controlled;
}

/** One rent lookup per distinct account size covers everything. */
async function withMinimums(
  rpc: ScanRpc,
  accounts: WithoutMinimum[],
  abortSignal: AbortSignal | undefined,
): Promise<DiscoveredAccount[]> {
  const sizes = [...new Set(accounts.map((a) => a.dataLength))];
  const minimums = new Map(
    await mapConcurrent(
      sizes,
      async (size) =>
        [
          size,
          Number(
            await rpc
              .getMinimumBalanceForRentExemption(BigInt(size))
              .send({ abortSignal }),
          ),
        ] as const,
    ),
  );
  return accounts.map((a) => ({ ...a, minimum: minimums.get(a.dataLength)! }));
}

/**
 * Decides whether a mint's excess can be withdrawn by `owner`. The minimum is
 * filled in by the caller. Returns `not-a-mint` for anything that isn't a
 * token program mint, e.g. a token account or a wallet.
 */
function classifyMint(
  account: EncodedAccount,
  owner: Address,
):
  | { status: "ok"; account: WithoutMinimum }
  | { status: "other-authority"; authority: Address }
  | { status: "no-authority" }
  | { status: "not-a-mint" } {
  const program =
    account.programAddress === TOKEN_PROGRAM_ADDRESS
      ? ("token" as const)
      : account.programAddress === TOKEN_2022_PROGRAM_ADDRESS
        ? ("token-2022" as const)
        : null;
  if (!program || !isMintAccountData(account.data)) {
    return { status: "not-a-mint" };
  }

  let authority: Address | null;
  try {
    authority = unwrapOption(decodeMint(account).data.mintAuthority);
  } catch {
    return { status: "not-a-mint" };
  }

  if (!authority) return { status: "no-authority" };
  if (authority !== owner) return { status: "other-authority", authority };

  return {
    status: "ok",
    account: {
      id: `mint-${account.address}`,
      kind: "mint",
      address: account.address,
      mint: account.address,
      program,
      tokenBalance: "",
      isEmpty: false,
      dataLength: account.data.length,
      lamports: Number(account.lamports),
    },
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** At most four requests in flight, results in the order of `items`. */
async function mapConcurrent<T, R>(
  items: T[],
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}
