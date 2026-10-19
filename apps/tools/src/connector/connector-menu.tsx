import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@blastctrl/ui";
import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverPanel,
  type PopoverButtonProps,
} from "@headlessui/react";
import {
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { getClusterType } from "@solana/connector/headless";
import {
  useCluster,
  useConnector,
  type WalletConnectorMetadata,
} from "@solana/connector/react";
import { use, useEffect, useState, type ReactNode } from "react";
import { ConnectorDialogContext } from "./connector-dialog";
import { longShortAddress, NETWORKS } from "./network";

type ConnectorMenuProps = {
  /** The trigger. Receives the popover's open state so the button can mirror it. */
  children: (bag: { open: boolean }) => ReactNode;
  /** Props forwarded to the Headless UI trigger. */
  buttonProps?: Omit<PopoverButtonProps, "children" | "as">;
};

/**
 * Wallet menu shown from the connected topbar button.
 *
 * Built on Popover rather than Menu: the panel is a card with a segmented
 * network control and action buttons, not a list of menu items. From the `sm`
 * breakpoint up it is anchored under the button; below it is a bottom sheet
 * behind a backdrop.
 */
export const ConnectorMenu = ({
  children,
  buttonProps,
}: ConnectorMenuProps) => {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton {...buttonProps}>{children({ open })}</PopoverButton>
          <PopoverBackdrop
            transition
            className="fixed inset-0 z-40 bg-zinc-950/50 transition duration-[240ms] data-closed:opacity-0 sm:hidden"
          />
          <PopoverPanel
            transition
            // Anchoring also portals the panel; on mobile we portal explicitly
            // so the fixed sheet escapes any transformed ancestor.
            anchor={isDesktop ? "bottom end" : undefined}
            portal={!isDesktop}
            className={cn(
              "z-50 bg-white focus:outline-hidden",
              // Mobile: bottom sheet.
              "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:w-full max-sm:rounded-t-[22px] max-sm:px-3 max-sm:pt-2",
              "max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.875rem)] max-sm:shadow-[0_-12px_32px_-12px_rgba(9,9,11,.25)]",
              "max-sm:transition max-sm:duration-[340ms] max-sm:ease-[cubic-bezier(.32,.72,0,1)] max-sm:data-closed:translate-y-full",
              // Desktop: anchored card.
              "sm:w-[344px] sm:origin-top-right sm:rounded-2xl sm:p-2 sm:[--anchor-gap:8px]",
              "sm:shadow-[0_0_0_1px_rgba(9,9,11,.06),0_24px_48px_-16px_rgba(9,9,11,.3)]",
              "sm:transition sm:duration-200 sm:ease-[cubic-bezier(.2,.8,.2,1)]",
              "sm:data-closed:-translate-y-1.5 sm:data-closed:scale-[.97] sm:data-closed:opacity-0",
            )}
          >
            <div
              aria-hidden
              className="mx-auto mb-3 h-[5px] w-9 rounded-[3px] bg-zinc-300 sm:hidden"
            />
            <MenuContent close={close} />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
};

const MenuContent = ({ close }: { close: () => void }) => {
  const { account, connector, disconnectWallet } = useConnector();
  const { cluster, type: clusterType } = useCluster();
  const { setOpen: openDialog } = use(ConnectorDialogContext);

  const network = NETWORKS[clusterType ?? "custom"];

  if (!account) return null;

  return (
    <>
      {/* Hero card */}
      <div className="flex flex-col gap-4 rounded-[14px] bg-secondary p-4 text-secondary-content sm:gap-3.5 sm:rounded-[11px] sm:pt-3.5 sm:pr-3.5 sm:pb-4 sm:pl-4">
        <div className="flex items-center gap-2.5">
          <WalletTile connector={connector} />
          <span className="flex-1 truncate text-[15px] font-medium sm:text-sm">
            {connector?.name ?? "Wallet"}
          </span>
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-xs font-medium sm:h-6 sm:px-[9px]">
            <span
              aria-hidden
              className={cn("size-[7px] rounded-full", network.dot)}
            />
            {cluster?.label ?? network.label}
          </span>
        </div>
        <AddressRow address={account} />
      </div>

      {/* Network */}
      <div className="flex flex-col gap-2 px-1 pt-[18px] pb-1.5 sm:px-2 sm:pt-3.5 sm:pb-1">
        <div className="text-xs font-semibold tracking-[.06em] text-zinc-500 uppercase">
          Network
        </div>
        <NetworkPicker />
      </div>

      <div className="mx-1 mt-2 border-t border-zinc-100 sm:mx-2" />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5 pt-3.5 sm:gap-2 sm:px-2 sm:pt-3">
        <button
          type="button"
          onClick={() => {
            close();
            openDialog(true);
          }}
          className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[15px] font-medium text-zinc-800 transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden sm:h-[38px] sm:rounded-[9px] sm:text-sm"
        >
          <ArrowsRightLeftIcon
            className="size-[18px] text-zinc-500 sm:size-4"
            strokeWidth={1.7}
          />
          Change wallet
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            void disconnectWallet();
          }}
          className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 text-[15px] font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-hidden sm:h-[38px] sm:rounded-[9px] sm:text-sm"
        >
          <ArrowRightStartOnRectangleIcon
            className="size-[18px] sm:size-4"
            strokeWidth={1.7}
          />
          Disconnect
        </button>
      </div>
    </>
  );
};

/** 28px wallet avatar used in the hero card. */
const WalletTile = ({
  connector,
}: {
  connector: WalletConnectorMetadata | null;
}) => (
  <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-indigo-600 text-[13px] font-bold text-white ring-2 ring-white/[.18] sm:size-7 sm:rounded-lg sm:text-xs">
    {connector?.icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={connector.icon} alt="" className="size-full object-cover" />
    ) : (
      (connector?.name?.[0] ?? "?").toUpperCase()
    )}
  </span>
);

const AddressRow = ({ address }: { address: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-xs text-white/65">
          {copied ? "Copied to clipboard" : "Connected address"}
        </div>
        <div className="font-mono text-[21px] font-medium tracking-[-.01em] text-white sm:text-xl">
          {longShortAddress(address)}
        </div>
      </div>
      <button
        type="button"
        title="Copy address"
        aria-label="Copy address"
        onClick={copy}
        className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-hidden sm:size-9 sm:rounded-[9px]"
      >
        {copied ? (
          <CheckIcon className="size-5 sm:size-[18px]" strokeWidth={1.7} />
        ) : (
          <DocumentDuplicateIcon
            className="size-5 sm:size-[18px]"
            strokeWidth={1.7}
          />
        )}
      </button>
    </div>
  );
};

const NetworkPicker = () => {
  const { cluster, clusters, setCluster } = useCluster();

  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className="grid gap-[3px] rounded-xl bg-zinc-100 p-[3px] sm:rounded-[10px]"
      style={{
        gridTemplateColumns: `repeat(${clusters.length}, minmax(0, 1fr))`,
      }}
    >
      {clusters.map((c) => {
        const active = cluster?.id === c.id;
        const style = NETWORKS[getClusterType(c)];
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => void setCluster(c.id)}
            className={cn(
              "inline-flex h-[42px] items-center justify-center gap-[7px] rounded-[9px] text-[15px] font-medium transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden sm:h-8 sm:rounded-lg sm:text-[13px]",
              active
                ? "bg-white text-zinc-900 shadow-[0_0_0_1px_rgba(9,9,11,.06),0_1px_3px_rgba(9,9,11,.12)]"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            <span
              aria-hidden
              className={cn("size-2 rounded-full sm:size-[7px]", style.dot)}
            />
            {c.label}
          </button>
        );
      })}
    </div>
  );
};
