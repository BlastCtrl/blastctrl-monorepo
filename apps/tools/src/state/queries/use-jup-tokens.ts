import { useAppRpc, type AppRpc } from "@/connector/app-rpc";
import { useQuery, queryOptions } from "@tanstack/react-query";

type TokensResponse = {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  icon?: string;
  tags: string[];
  extensions: {
    [key: string]: string;
  };
};

const ignoreList = ["SOL"];

export function jupTokensQuery(
  rpc: AppRpc | null,
  wallet = "",
  useUnknownTokens: boolean,
) {
  return queryOptions<Array<TokensResponse>, Error>({
    queryKey: ["jup-tokens", wallet || "none", useUnknownTokens],
    queryFn: async () => {
      const jupFetch = fetch(
        `https://lite-api.jup.ag/tokens/v2/tag?query=verified`,
        {
          headers: { origin: "https://tools.blastctrl.com" },
        },
      );

      if (!wallet) {
        const jupResponse = await jupFetch;
        if (!jupResponse.ok) {
          throw new Error("Network response was not ok");
        }

        return jupResponse.json();
      }

      if (!rpc) throw new Error("RPC not available");
      const [jupResponse, userAssets] = await Promise.all([
        jupFetch,
        rpc
          .searchAssets({ ownerAddress: wallet, tokenType: "fungible" })
          .send(),
      ]);

      if (!jupResponse.ok) {
        if (jupResponse.status === 429) {
          throw new Error("Rate limit exceeded");
        }
        throw new Error("Network response was not ok");
      }

      const jupTokens = (await jupResponse.json()) as TokensResponse[];

      const set = new Set(userAssets.items.map((asset) => asset.id));
      const intersectionTokens = jupTokens
        .filter((token) => set.has(token.id))
        .reverse();

      return intersectionTokens;
    },
    select: (data) =>
      data.filter((token) => !ignoreList.includes(token.symbol)),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 300_000,
  });
}

/**
 * Get JUP tokens owned by a wallet
 * @param wallet
 * @returns
 */
export function useJupTokens(wallet = "", useUnknownTokens: boolean) {
  const { rpc } = useAppRpc();
  return useQuery(jupTokensQuery(rpc, wallet, useUnknownTokens));
}
