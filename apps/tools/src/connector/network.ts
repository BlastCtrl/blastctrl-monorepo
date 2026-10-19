import type { ClusterType } from "@solana/connector/react";

export type NetworkStyle = {
  label: string;
  /** Status dot (button + menu chip) */
  dot: string;
  /** Off-mainnet pill on the connected button */
  pill: string;
};

export const NETWORKS: Record<ClusterType, NetworkStyle> = {
  mainnet: {
    label: "Mainnet",
    dot: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-900",
  },
  testnet: {
    label: "Testnet",
    dot: "bg-cyan-500",
    pill: "bg-cyan-100 text-cyan-900",
  },
  devnet: {
    label: "Devnet",
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-900",
  },
  localnet: {
    label: "Localnet",
    dot: "bg-indigo-400",
    pill: "bg-indigo-100 text-indigo-900",
  },
  custom: {
    label: "Custom",
    dot: "bg-indigo-400",
    pill: "bg-indigo-100 text-indigo-900",
  },
};

/** `7xKX…gAsU` */
export const shortAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

/** `7xKXtg…JosgAsU` */
export const longShortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-6)}`;
