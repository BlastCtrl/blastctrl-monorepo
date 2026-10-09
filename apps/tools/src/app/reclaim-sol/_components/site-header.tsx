"use client";

import BlastCtrlIcon from "@/../public/blastctrl_icon.svg";
import { compress } from "@/lib/solana";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Image from "next/image";
import Link from "next/link";
import { Suspense, use } from "react";
import { browser } from "react-dom";

/** BlastCtrl's mark and name, and the wallet. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6">
      <Link
        href="/"
        className="-m-1 flex items-center gap-2.5 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Image src={BlastCtrlIcon} alt="" className="size-10" priority />
        <span className="font-display text-2xl font-bold tracking-tight text-slate-800">
          BlastCtrl
        </span>
      </Link>
      <Wallet />
    </header>
  );
}

function NetworkBadge() {
  use(browser("The network is persisted in localStorage"));
  const network = useNetworkConfigurationStore((state) => state.network);
  if (network === "mainnet-beta") return null;
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 capitalize">
      {network.startsWith("http") ? "Custom RPC" : network}
    </span>
  );
}

const ITEM =
  "block w-full px-3.5 py-2 text-left text-sm text-zinc-700 data-focus:bg-zinc-100 data-focus:text-zinc-950";

/**
 * Once connected, which wallet it is, with a menu to copy the address,
 * switch wallets or disconnect. Connecting is the band's pill, so there's
 * one thing to click, not two. Off mainnet it says which network, so devnet
 * results are never mistaken for real ones.
 */
function Wallet() {
  const { publicKey, wallet, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const address = publicKey?.toBase58();

  return (
    <div className="flex items-center gap-2">
      <Suspense fallback={null}>
        <NetworkBadge />
      </Suspense>
      {address && wallet && (
        <Menu>
          <MenuButton className="flex items-center gap-2 rounded-full border border-zinc-300 bg-white py-1 pr-2.5 pl-1 text-sm font-medium text-slate-800 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800 data-open:border-zinc-400">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the wallet */}
            <img
              src={wallet.adapter.icon}
              alt=""
              className="size-6 rounded-full"
            />
            {compress(address, 4)}
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 text-zinc-400"
            />
          </MenuButton>
          <MenuItems
            anchor={{ to: "bottom end", gap: 8 }}
            transition
            className="z-10 min-w-44 origin-top-right rounded-xl bg-white py-1.5 shadow-lg ring-1 ring-zinc-900/5 transition duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus:outline-none data-closed:scale-95 data-closed:opacity-0"
          >
            <MenuItem>
              <button
                type="button"
                className={ITEM}
                onClick={() => void navigator.clipboard?.writeText(address)}
              >
                Copy address
              </button>
            </MenuItem>
            <MenuItem>
              <button
                type="button"
                className={ITEM}
                onClick={() => setVisible(true)}
              >
                Change wallet
              </button>
            </MenuItem>
            <MenuItem>
              <button
                type="button"
                className={ITEM}
                onClick={() => void disconnect()}
              >
                Disconnect
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      )}
    </div>
  );
}
