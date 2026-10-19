import { cn } from "@blastctrl/ui";
import {
  Popover,
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
 * network control and action buttons, not a list of menu items.
 */
export const ConnectorMenu = ({
  children,
  buttonProps,
}: ConnectorMenuProps) => (
  <Popover className="relative">
    {({ open, close }) => (
      <>
        <PopoverButton {...buttonProps}>{children({ open })}</PopoverButton>
        <PopoverPanel
          transition
          anchor="bottom end"
          className={cn(
            "z-50 w-[344px] max-w-[calc(100vw-16px)] origin-top-right rounded-2xl bg-white p-2 [--anchor-gap:8px]",
            "shadow-[0_0_0_1px_rgba(9,9,11,.06),0_24px_48px_-16px_rgba(9,9,11,.3)]",
            "transition duration-200 ease-[cubic-bezier(.2,.8,.2,1)] focus:outline-hidden",
            "data-closed:-translate-y-1.5 data-closed:scale-[.97] data-closed:opacity-0",
          )}
        >
          <MenuContent close={close} />
        </PopoverPanel>
      </>
    )}
  </Popover>
);

const MenuContent = ({ close }: { close: () => void }) => {
  const { account, connector, disconnectWallet } = useConnector();
  const { cluster, type: clusterType } = useCluster();
  const { setOpen: openDialog } = use(ConnectorDialogContext);

  const network = NETWORKS[clusterType ?? "custom"];

  if (!account) return null;

  return (
    <>
      {/* Hero card */}
      <div className="flex flex-col gap-3.5 rounded-[11px] bg-secondary pt-3.5 pr-3.5 pb-4 pl-4 text-secondary-content">
        <div className="flex items-center gap-2.5">
          <WalletTile connector={connector} />
          <span className="flex-1 truncate text-sm font-medium">
            {connector?.name ?? "Wallet"}
          </span>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/10 px-[9px] text-xs font-medium">
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
      <div className="flex flex-col gap-2 px-2 pt-3.5 pb-1">
        <div className="text-xs font-semibold tracking-[.06em] text-zinc-500 uppercase">
          Network
        </div>
        <NetworkPicker />
      </div>

      <div className="mx-2 mt-2 border-t border-zinc-100" />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 px-2 pt-3">
        <button
          type="button"
          onClick={() => {
            close();
            openDialog(true);
          }}
          className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[9px] border border-zinc-200 bg-white text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden"
        >
          <ArrowsRightLeftIcon
            className="size-4 text-zinc-500"
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
          className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[9px] border border-red-100 bg-red-50 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-hidden"
        >
          <ArrowRightStartOnRectangleIcon
            className="size-4"
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
  <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-indigo-600 text-xs font-bold text-white ring-2 ring-white/[.18]">
    {connector?.icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={connector.icon} alt="" className="size-7 object-cover" />
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
        <div className="font-mono text-xl font-medium tracking-[-.01em] text-white">
          {longShortAddress(address)}
        </div>
      </div>
      <button
        type="button"
        title="Copy address"
        aria-label="Copy address"
        onClick={copy}
        className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-hidden"
      >
        {copied ? (
          <CheckIcon className="size-[18px]" strokeWidth={1.7} />
        ) : (
          <DocumentDuplicateIcon className="size-[18px]" strokeWidth={1.7} />
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
      className="grid gap-[3px] rounded-[10px] bg-zinc-100 p-[3px]"
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
              "inline-flex h-8 items-center justify-center gap-[7px] rounded-lg text-[13px] font-medium transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden",
              active
                ? "bg-white text-zinc-900 shadow-[0_0_0_1px_rgba(9,9,11,.06),0_1px_3px_rgba(9,9,11,.12)]"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            <span
              aria-hidden
              className={cn("size-[7px] rounded-full", style.dot)}
            />
            {c.label}
          </button>
        );
      })}
    </div>
  );
};
