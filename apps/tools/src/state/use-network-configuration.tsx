import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface NetworkConfigurationStore {
  network: WalletAdapterNetwork;
  setNetwork: (network: WalletAdapterNetwork) => void;
}

export const useNetworkConfigurationStore = create<NetworkConfigurationStore>()(
  persist(
    (set) => ({
      network: WalletAdapterNetwork.Mainnet,
      setNetwork: (network) => set({ network: network }),
    }),
    {
      name: "network",
    },
  ),
);
