import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import type { Umi } from "@metaplex-foundation/umi";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { getEndpoint } from "@/state/context/SolanaProvider";

const useUmi = (): Umi => {
  const wallet = useWallet();
  const { network } = useNetworkConfigurationStore();
  const endpoint = useMemo(() => getEndpoint(network), [network]);

  const umi = useMemo(
    () =>
      createUmi(endpoint)
        .use(walletAdapterIdentity(wallet))
        .use(mplCandyMachine())
        .use(mplTokenMetadata())
        .use(mplCore()),
    [wallet, endpoint],
  );

  return umi;
};

export default useUmi;
