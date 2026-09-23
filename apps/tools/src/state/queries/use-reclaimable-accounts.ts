import type {
  MintLookup,
  ReclaimableAccount,
} from "@/app/spl-token-tools/reclaim-rent/_components/types";
import { compress } from "@/lib/solana/common";
import { chunk } from "@/lib/utils";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import type { AccountInfo, Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDasApi } from "./das";
import type { DasAsset, HeliusResponse } from "./types";
import { assetDataQueryKey } from "./use-asset-data";

export const reclaimableAccountsKey = (owner: string, network: string) =>
  ["reclaimable-accounts", owner, network] as const;

type ParsedTokenAccountInfo = {
  mint: string;
  owner: string;
  isNative: boolean;
  state: string;
  tokenAmount: { amount: string; uiAmountString: string };
};

/**
 * Token accounts (both token programs) of a wallet, plus the mints of those
 * tokens that the wallet is the mint authority of. Each comes with what it
 * holds and the rent-exempt minimum for its size; excess is the difference.
 *
 * Mints are found among the wallet's own tokens because there is no cheap
 * way to search the chain by mint authority. Others can be added by address.
 */
export function useReclaimableAccounts(owner: string) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const { network, url } = useDasApi();

  return useQuery<ReclaimableAccount[]>({
    queryKey: reclaimableAccountsKey(owner, network),
    enabled: false,
    queryFn: async () => {
      if (!owner) throw Error("No address provided");

      const tokenAccounts = await fetchTokenAccounts(connection, owner);
      const mints = await fetchControlledMints(connection, owner, [
        ...new Set(tokenAccounts.map((a) => a.mint)),
      ]);
      const accounts = [...tokenAccounts, ...mints];
      const assets = await fetchAssets(
        url,
        accounts.map((a) => a.mint),
      );

      for (const asset of assets.values()) {
        queryClient.setQueryData<DasAsset>(
          assetDataQueryKey(asset.id, network),
          asset,
        );
      }

      return accounts.map((a) => withAssetInfo(a, assets.get(a.mint)));
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/** Checks a single mint address for the paste box on the Mints tab. */
export async function lookupMint(
  connection: Connection,
  dasUrl: string | null,
  address: string,
  owner: string,
): Promise<MintLookup> {
  const info = await connection.getAccountInfo(new PublicKey(address));
  if (!info) return { status: "not-found" };

  const result = classifyMint(address, info, owner);
  if (result.status === "not-a-mint") return result;

  const assets = await fetchAssets(dasUrl, [address]);
  const asset = assets.get(address);
  if (result.status !== "ok") {
    return { ...result, name: displayName(address, asset) };
  }

  const minimum = await connection.getMinimumBalanceForRentExemption(
    info.data.length,
  );
  return {
    status: "ok",
    account: withAssetInfo({ ...result.account, minimum }, asset),
  };
}

type Unnamed = Omit<ReclaimableAccount, "name" | "symbol" | "image">;

async function fetchTokenAccounts(connection: Connection, owner: string) {
  const ownerKey = new PublicKey(owner);
  const programs = [
    { id: TOKEN_PROGRAM_ID, program: "token" as const },
    { id: TOKEN_2022_PROGRAM_ID, program: "token-2022" as const },
  ];

  const results = await Promise.all(
    programs.map(async ({ id, program }) => {
      const { value } = await connection.getParsedTokenAccountsByOwner(
        ownerKey,
        { programId: id },
      );
      return value.map(({ pubkey, account }) => {
        const info = account.data.parsed.info as ParsedTokenAccountInfo;
        return {
          id: pubkey.toBase58(),
          kind: "token-account" as const,
          address: pubkey.toBase58(),
          mint: info.mint,
          program,
          tokenBalance: info.tokenAmount.uiAmountString,
          isEmpty: info.tokenAmount.amount === "0",
          dataLength: account.data.space,
          lamports: account.lamports,
          blockedReason: info.isNative
            ? "Wrapped SOL accounts aren't supported"
            : undefined,
        };
      });
    }),
  );

  return withMinimums(connection, results.flat());
}

async function fetchControlledMints(
  connection: Connection,
  owner: string,
  mints: string[],
) {
  const infos = (
    await Promise.all(
      chunk(mints, 100).map((batch) =>
        connection.getMultipleAccountsInfo(batch.map((m) => new PublicKey(m))),
      ),
    )
  ).flat();

  const controlled: Omit<Unnamed, "minimum">[] = [];
  infos.forEach((info, i) => {
    if (!info) return;
    const result = classifyMint(mints[i]!, info, owner);
    if (result.status === "ok") controlled.push(result.account);
  });

  return withMinimums(connection, controlled);
}

/** One rent lookup per distinct account size covers everything. */
async function withMinimums<T extends { dataLength: number }>(
  connection: Connection,
  accounts: T[],
) {
  const sizes = [...new Set(accounts.map((a) => a.dataLength))];
  const minimums = new Map(
    await Promise.all(
      sizes.map(
        async (size) =>
          [
            size,
            await connection.getMinimumBalanceForRentExemption(size),
          ] as const,
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
  address: string,
  info: AccountInfo<Buffer>,
  owner: string,
):
  | { status: "ok"; account: Omit<Unnamed, "minimum"> }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" } {
  const program = info.owner.equals(TOKEN_PROGRAM_ID)
    ? ("token" as const)
    : info.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? ("token-2022" as const)
      : null;
  if (!program) return { status: "not-a-mint" };

  let authority: PublicKey | null;
  try {
    authority = unpackMint(
      new PublicKey(address),
      info,
      info.owner,
    ).mintAuthority;
  } catch {
    return { status: "not-a-mint" };
  }

  if (!authority) return { status: "no-authority", name: "" };
  if (authority.toBase58() !== owner) {
    return {
      status: "other-authority",
      name: "",
      authority: authority.toBase58(),
    };
  }

  return {
    status: "ok",
    account: {
      id: `mint-${address}`,
      kind: "mint",
      address,
      mint: address,
      program,
      tokenBalance: "",
      isEmpty: false,
      dataLength: info.data.length,
      lamports: info.lamports,
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

/** Names and images for display. Failing here must not fail the scan. */
export async function fetchAssets(url: string | null, mints: string[]) {
  const assets = new Map<string, DasAsset>();
  if (!url || mints.length === 0) return assets;

  try {
    // getAssetBatch takes at most 1000 ids per call.
    const batches = await Promise.all(
      chunk([...new Set(mints)], 1000).map(async (ids) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "reclaimable-accounts",
            method: "getAssetBatch",
            params: { ids },
          }),
        });
        if (!response.ok) {
          throw Error(`getAssetBatch failed: ${response.status}`);
        }
        const data = (await response.json()) as HeliusResponse<
          (DasAsset | null)[]
        >;
        return data.result;
      }),
    );
    for (const asset of batches.flat()) {
      if (asset) assets.set(asset.id, asset);
    }
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
  }
  return assets;
}
