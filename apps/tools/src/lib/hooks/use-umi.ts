/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { mergeClusterApiUrl } from "../solana/common";
import type { Umi } from "@metaplex-foundation/umi";

const useUmi = (): Umi => {
  const wallet = useWallet();
  const { network } = useNetworkConfigurationStore();
  const endpoint = useMemo(() => mergeClusterApiUrl(network), [network]);

  const umi = useMemo(
    () =>
      createUmi(endpoint)
        .use(walletAdapterIdentity(wallet))
        .use(mplCandyMachine())
        .use(mplTokenMetadata()),
    [wallet, endpoint],
  );

  return umi;
};

export default useUmi;
