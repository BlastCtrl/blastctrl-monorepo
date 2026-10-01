"use client";

import { ReclaimRent } from "./_components/reclaim-rent";
import { TestAccountsPanel } from "./_components/test-accounts-panel";

export default function ReclaimRentPage() {
  return (
    <>
      <ReclaimRent />
      {process.env.NODE_ENV === "development" && <TestAccountsPanel />}
    </>
  );
}
