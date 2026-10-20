import { useAppRpc } from "@/connector/app-rpc";
import { getMintExtensionTypes } from "@/lib/solana/token-2022";
import { decodeMint, type Mint } from "@solana-program/token";
import {
  address,
  fetchEncodedAccount,
  isAddress,
  type Account,
  type Address,
} from "@solana/kit";
import { useQuery } from "@tanstack/react-query";

export const mintQueryKey = (mint: string, network: string) =>
  ["mint", mint, network] as const;

export type MintAccount = {
  address: Address;
  /** The token program that owns the mint (Token or Token-2022). */
  programAddress: Address;
  decimals: number;
  supply: bigint;
  /** Token-2022 extension type ids on the mint; empty for classic Token mints. */
  extensions: number[];
};

/** The mint account behind a token: decimals, owning program and extensions. */
export function useMintAccount(mint: string) {
  const { rpc, network } = useAppRpc();

  return useQuery<MintAccount>({
    enabled: isAddress(mint) && !!rpc,
    queryKey: mintQueryKey(mint, network),
    queryFn: async ({ signal }) => {
      if (!rpc) throw new Error("RPC not available");
      const encoded = await fetchEncodedAccount(rpc, address(mint), {
        abortSignal: signal,
      });
      if (!encoded.exists) throw new Error(`No account found at ${mint}`);

      // The fixed-size decoder reads the 82-byte base; extensions follow it.
      let decoded: Account<Mint>;
      try {
        decoded = decodeMint(encoded);
      } catch {
        throw new Error(`${mint} is not a token mint`);
      }

      return {
        address: encoded.address,
        programAddress: encoded.programAddress,
        decimals: decoded.data.decimals,
        supply: decoded.data.supply,
        extensions: getMintExtensionTypes(encoded.data),
      };
    },
    staleTime: Infinity,
  });
}
