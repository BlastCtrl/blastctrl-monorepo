import type {
  MintLookup,
  ParsedTokenState,
  ReclaimableAccount,
} from "@/app/spl-token-tools/reclaim-rent/_components/types";
import { keepOpenReason } from "@/app/spl-token-tools/reclaim-rent/_components/types";
import { useAppRpc, type AppRpc } from "@/connector/app-rpc";
import { compress } from "@/lib/solana/common";
import {
  isMintAccountData,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@/lib/solana/token-2022";
import { chunk } from "@/lib/utils";
import { decodeMint, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  unwrapOption,
  type Address,
  type EncodedAccount,
} from "@solana/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DasAsset } from "./types";
import { assetDataQueryKey, fetchAssets } from "./use-asset-data";

const reclaimableAccountsKey = (owner: string, network: string) =>
  ["reclaimable-accounts", owner, network] as const;

/**
 * Token accounts (both token programs) of a wallet, plus the mints of those
 * tokens that the wallet is the mint authority of. Each comes with what it
 * holds and the rent-exempt minimum for its size; excess is the difference.
 *
 * Mints are found among the wallet's own tokens because there is no cheap
 * way to search the chain by mint authority. Others can be added by address.
 * Reads through the cluster's RPC, so any address can be scanned without a
 * wallet; the scan runs on `refetch()` only.
 */
export function useReclaimableAccounts(owner: string) {
  const queryClient = useQueryClient();
  const { rpc, dasAvailable, network } = useAppRpc();

  return useQuery<ReclaimableAccount[]>({
    queryKey: reclaimableAccountsKey(owner, network),
    enabled: false,
    queryFn: async () => {
      if (!owner) throw Error("No address provided");
      if (!rpc) throw Error("RPC not available");

      const { accounts, assets } = await fetchReclaimableAccounts(
        rpc,
        dasAvailable,
        owner,
      );

      for (const asset of assets.values()) {
        queryClient.setQueryData<DasAsset>(
          assetDataQueryKey(asset.id, network),
          asset,
        );
      }

      return accounts;
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/**
 * The scan behind {@link useReclaimableAccounts}, outside React: the
 * wallet's token accounts and controlled mints, named from DAS when the
 * cluster has it. Returns the DAS assets too, for the hook to cache.
 */
async function fetchReclaimableAccounts(
  rpc: AppRpc,
  dasAvailable: boolean,
  owner: string,
): Promise<{ accounts: ReclaimableAccount[]; assets: Map<string, DasAsset> }> {
  const tokenAccounts = await fetchTokenAccounts(rpc, address(owner));
  const mints = await fetchControlledMints(rpc, owner, [
    ...new Set(tokenAccounts.map((a) => a.mint)),
  ]);
  const accounts = [...tokenAccounts, ...mints];
  const assets = await fetchAssets(
    dasAvailable ? rpc : null,
    accounts.map((a) => a.mint),
  );

  return {
    accounts: accounts.map((a) => withAssetInfo(a, assets.get(a.mint))),
    assets,
  };
}

/** Checks a single mint address for the paste box on the Mints tab. */
export async function lookupMint(
  rpc: AppRpc,
  dasAvailable: boolean,
  mint: string,
  owner: string,
): Promise<MintLookup> {
  const account = await fetchEncodedAccount(rpc, address(mint));
  if (!account.exists) return { status: "not-found" };

  const result = classifyMint(account, owner);
  if (result.status === "not-a-mint") return result;

  const assets = await fetchAssets(dasAvailable ? rpc : null, [mint]);
  const asset = assets.get(mint);
  if (result.status !== "ok") {
    return { ...result, name: displayName(mint, asset) };
  }

  const minimum = await minimumBalance(rpc, account.data.length);
  return {
    status: "ok",
    account: withAssetInfo({ ...result.account, minimum }, asset),
  };
}

type Unnamed = Omit<ReclaimableAccount, "name" | "symbol" | "image">;

async function fetchTokenAccounts(rpc: AppRpc, owner: Address) {
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
        .send();
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

  return withMinimums(rpc, results.flat());
}

async function fetchControlledMints(
  rpc: AppRpc,
  owner: string,
  mints: string[],
) {
  const accounts = (
    await Promise.all(
      chunk(mints, 100).map((batch) =>
        fetchEncodedAccounts(
          rpc,
          batch.map((m) => address(m)),
        ),
      ),
    )
  ).flat();

  const controlled: Omit<Unnamed, "minimum">[] = [];
  for (const account of accounts) {
    if (!account.exists) continue;
    const result = classifyMint(account, owner);
    if (result.status === "ok") controlled.push(result.account);
  }

  return withMinimums(rpc, controlled);
}

const minimumBalance = async (rpc: AppRpc, size: number) =>
  Number(await rpc.getMinimumBalanceForRentExemption(BigInt(size)).send());

/** One rent lookup per distinct account size covers everything. */
async function withMinimums<T extends { dataLength: number }>(
  rpc: AppRpc,
  accounts: T[],
) {
  const sizes = [...new Set(accounts.map((a) => a.dataLength))];
  const minimums = new Map(
    await Promise.all(
      sizes.map(
        async (size) => [size, await minimumBalance(rpc, size)] as const,
      ),
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
  owner: string,
):
  | { status: "ok"; account: Omit<Unnamed, "minimum"> }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
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

  if (!authority) return { status: "no-authority", name: "" };
  if (authority !== owner) {
    return { status: "other-authority", name: "", authority };
  }

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

function withAssetInfo(
  account: Unnamed,
  asset: DasAsset | undefined,
): ReclaimableAccount {
  return {
    ...account,
    name: displayName(account.mint, asset),
    symbol:
      asset?.token_info?.symbol ||
      asset?.content?.metadata?.symbol ||
      account.mint.slice(0, 3),
    image: asset?.content?.links?.image,
  };
}

function displayName(mint: string, asset: DasAsset | undefined): string {
  return asset?.content?.metadata?.name || compress(mint, 4);
}
