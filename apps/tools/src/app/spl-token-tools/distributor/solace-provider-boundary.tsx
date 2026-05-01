"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const SolaceProviderNoSsr = dynamic(
  () => import("./solace-provider").then((mod) => mod.SolaceProvider),
  {
    ssr: false,
  },
);

export function SolaceProviderBoundary({ children }: { children: ReactNode }) {
  return <SolaceProviderNoSsr>{children}</SolaceProviderNoSsr>;
}
