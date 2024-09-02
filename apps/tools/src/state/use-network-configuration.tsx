/* eslint-disable @typescript-eslint/ban-types */
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Network = "mainnet-beta" | "testnet" | "devnet" | (string & {});

interface NetworkConfigurationStore {
  network: Network;
  setNetwork: (network: Network) => void;
}

export const useNetworkConfigurationStore = create<NetworkConfigurationStore>()(
  persist(
    (set) => ({
      network: "mainnet-beta",
      setNetwork: (network) => set({ network: network }),
    }),
    {
      name: "network",
    },
  ),
);
