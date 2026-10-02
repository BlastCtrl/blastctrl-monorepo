"use client";

import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { useSyncExternalStore } from "react";
import { ReclaimRent } from "./_components/reclaim-rent";
import { showsTestAccountsPanel } from "./_components/test-accounts";
import { TestAccountsPanel } from "./_components/test-accounts-panel";

const noop = () => () => {};

/** False on the server and the hydrating render, true after. */
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

export default function ReclaimRentPage() {
  const network = useNetworkConfigurationStore((state) => state.network);
  // The network is persisted in localStorage, which the server can't see:
  // keep the first client render matching the server's.
  const hydrated = useHydrated();

  return (
    <>
      <ReclaimRent />
      {hydrated && showsTestAccountsPanel(network) && <TestAccountsPanel />}
    </>
  );
}
