"use client";

import SolanaLogo from "@/../public/solanaLogoMark.svg";
import { Button } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { SpinnerIcon, cn } from "@blastctrl/ui";
import {
  useCluster,
  useConnector,
  type WalletConnectorMetadata,
} from "@solana/connector/react";
import { motion } from "motion/react";
import Image from "next/image";
import { use, type ReactNode } from "react";
import { ConnectorDialogContext } from "./connector-dialog";
import { ConnectorMenu } from "./connector-menu";
import { NETWORKS, shortAddress } from "./network";

const EASE = [0.2, 0.8, 0.2, 1] as const;

const BASE =
  "relative inline-flex h-9 min-w-10 shrink-0 items-center justify-center rounded-lg border-0 text-sm whitespace-nowrap select-none transition-[background-color,filter,box-shadow] duration-150 focus:outline-hidden data-focus:ring-2 data-focus:ring-white/70 data-focus:ring-offset-2 data-focus:ring-offset-primary";

type MobileVariant = "compact" | "icon";

type ConnectorButtonProps = {
  className?: string;
  mobile?: MobileVariant;
};

/**
 * Topbar wallet button.
 *
 * - unconnected → white "Select wallet" with the Solana mark; opens the dialog
 * - pending     → muted white, wallet tile + spinner; disabled
 * - connected   → primary-focus, wallet tile with a network status dot,
 *                 short address, a network pill when off mainnet, chevron;
 *                 opens the wallet menu
 */
export const ConnectorButton = ({
  className,
  mobile = "compact",
}: ConnectorButtonProps) => {
  const { setOpen } = use(ConnectorDialogContext);
  const {
    isConnected,
    isConnecting,
    account,
    connector,
    connectors,
    walletStatus,
  } = useConnector();
  const { type: clusterType } = useCluster();

  const icon = mobile === "icon";

  if (isConnecting) {
    const pendingConnector =
      walletStatus.status === "connecting"
        ? (connectors.find((c) => c.id === walletStatus.connectorId) ?? null)
        : null;

    return (
      <Button
        type="button"
        disabled
        aria-label="Connecting wallet"
        className={cn(
          BASE,
          "bg-white/90 font-semibold text-zinc-600 sm:gap-2 sm:pr-3 sm:pl-1.5 sm:text-zinc-700",
          icon ? "w-10 px-0 sm:w-auto" : "gap-[7px] pr-2.5 pl-1.5",
          className,
        )}
      >
        <WalletTile
          connector={pendingConnector}
          className={icon ? "hidden sm:grid" : undefined}
        />
        <span className="hidden sm:inline">Connecting</span>
        <SpinnerIcon className="size-4" />
      </Button>
    );
  }

  if (isConnected && account) {
    const network = NETWORKS[clusterType ?? "custom"];
    const offMainnet = clusterType !== null && clusterType !== "mainnet";

    return (
      <ConnectorMenu
        buttonProps={{
          className: (bag) =>
            cn(
              BASE,
              "bg-primary-focus font-medium text-white data-hover:brightness-[.94] sm:gap-[9px] sm:pr-2.5 sm:pl-1.5",
              icon ? "w-10 px-0 sm:w-auto" : "gap-2 pr-2.5 pl-1.5",
              bag.open
                ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,.5)]"
                : "shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]",
              className,
            ),
        }}
      >
        {({ open }) => (
          <>
            <WalletTile connector={connector}>
              <span
                aria-hidden
                className={cn(
                  "absolute -right-[3px] -bottom-[3px] size-2.5 rounded-full ring-2 ring-primary-focus transition-colors duration-200",
                  network.dot,
                )}
              />
            </WalletTile>
            <span
              className={cn(
                "font-mono text-[13px]",
                icon && "hidden sm:inline",
              )}
            >
              {shortAddress(account)}
            </span>
            {offMainnet && (
              <span
                className={cn(
                  "hidden rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold tracking-[.04em] uppercase sm:inline-block",
                  network.pill,
                )}
              >
                {network.label}
              </span>
            )}
            <motion.span
              aria-hidden
              className="hidden sm:inline-flex"
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              <ChevronDownIcon
                className="size-[15px] opacity-75"
                strokeWidth={2}
              />
            </motion.span>
            <span className="sr-only">
              Wallet menu, connected to {network.label}
            </span>
          </>
        )}
      </ConnectorMenu>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Select wallet"
      className={cn(
        BASE,
        "bg-white font-semibold text-zinc-900 data-hover:bg-accent sm:gap-2 sm:pr-4 sm:pl-[13px] sm:shadow-[0_1px_2px_rgba(9,9,11,.14)]",
        icon ? "w-10 px-0 sm:w-auto" : "gap-1.5 px-3",
        className,
      )}
    >
      <Image
        src={SolanaLogo}
        alt=""
        width={17}
        height={15}
        className={cn(
          "sm:h-[15px] sm:w-[17px]",
          icon ? "h-4 w-[18px]" : "h-3.5 w-4",
        )}
      />
      <span className={cn(icon && "hidden sm:inline")}>Select wallet</span>
    </Button>
  );
};

/** 24px wallet avatar tile. Falls back to the wallet's initial when there is no icon. */
const WalletTile = ({
  connector,
  className,
  children,
}: {
  connector: WalletConnectorMetadata | null;
  className?: string;
  children?: ReactNode;
}) => (
  <span
    className={cn(
      "relative grid size-6 shrink-0 place-items-center rounded-[7px] bg-indigo-600 text-[11px] font-bold text-white",
      className,
    )}
  >
    {connector?.icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={connector.icon}
        alt=""
        className="size-6 rounded-[7px] object-cover"
      />
    ) : (
      (connector?.name?.[0] ?? "?").toUpperCase()
    )}
    {children}
  </span>
);
