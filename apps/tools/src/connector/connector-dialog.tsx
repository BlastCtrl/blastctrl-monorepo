"use client";

import SolanaLogo from "@/../public/solanaLogoMark.svg";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import {
  CloseButton,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  useConnector,
  useConnectorClient,
  useWalletConnectUri,
  type WalletConnectorId,
  type WalletConnectorMetadata,
} from "@solana/connector/react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { createContext, use, useEffect, useState } from "react";

const WALLETS_URL = "https://solana.com/wallets?category=consumer";
const RECENT_KEY = "recentlyConnectedConnectorId";
const SLIDE = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const };

/** WalletConnect registers itself as a Wallet Standard wallet, so match on its name. */
const isWalletConnect = (c: WalletConnectorMetadata) =>
  c.id === "walletconnect" || c.name.toLowerCase() === "walletconnect";

/**
 * Abort an in-flight WalletConnect pairing.
 *
 * `disconnectWallet()` is not enough: while a connect is still pending there is
 * no connected wallet, so the kit wallet plugin just flips its own status to
 * disconnected and never reaches the WalletConnect transport. The pairing
 * request then stays alive, the next `connect()` reuses it (no new
 * `display_uri` event), and the QR view waits forever. Calling the wallet's
 * `standard:disconnect` feature directly cancels the pairing, which also
 * rejects the pending connect and clears the URI.
 */
const cancelWalletConnectPairing = async (
  client: ReturnType<typeof useConnectorClient>,
  connectorId: WalletConnectorId,
) => {
  const wallet = client?.getConnector(connectorId) as
    | { features?: Record<string, { disconnect?: () => Promise<void> }> }
    | undefined;
  await wallet?.features?.["standard:disconnect"]?.disconnect?.();
};

export const ConnectorDialogContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const useConnectorDialog = () => use(ConnectorDialogContext);

type View = "list" | "qr";

/**
 * "Connect a wallet" dialog. The list view shows wallets detected in the
 * browser (or an empty state) plus a WalletConnect entry; the QR view shows
 * the WalletConnect pairing code and link.
 */
export const ConnectorDialog = () => {
  const { open, setOpen } = useConnectorDialog();
  const client = useConnectorClient();
  const {
    walletStatus,
    connectorId,
    connectors,
    connectWallet,
    disconnectWallet,
  } = useConnector();
  const { uri: walletConnectUri, clearUri: clearWalletConnectUri } =
    useWalletConnectUri();

  const [view, setView] = useState<View>("list");
  const [recentId, setRecentId] = useState<WalletConnectorId | null>(null);

  // The connector owns the pending state; deriving it here means a cancelled
  // WalletConnect pairing (whose connect promise never settles) can't leave
  // the dialog stuck.
  const pendingId =
    walletStatus.status === "connecting" ? walletStatus.connectorId : null;

  useEffect(() => {
    const recent = localStorage.getItem(RECENT_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (recent) setRecentId(recent as WalletConnectorId);
  }, []);

  useEffect(() => {
    if (walletStatus.status !== "connected" || !connectorId) return;
    localStorage.setItem(RECENT_KEY, connectorId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentId(connectorId);
  }, [walletStatus.status, connectorId]);

  /** Close, then reset to the list once the exit transition has finished. */
  const closeDialog = () => {
    setOpen(false);
    setTimeout(() => setView("list"), 300);
  };

  const select = async (connector: WalletConnectorMetadata) => {
    if (pendingId) return;
    try {
      await connectWallet(connector.id);
      closeDialog();
    } catch (error) {
      // Our own cancel path rejects the pending connect; that's not a failure.
      if (error instanceof Error && error.message.includes("cancelled")) return;
      console.error("Failed to connect:", error);
    } finally {
      clearWalletConnectUri();
    }
  };

  const wallets = connectors.filter((c) => c.ready && !isWalletConnect(c));
  const walletConnect = connectors.find(isWalletConnect) ?? null;
  const detected = wallets.length > 0;
  const wcPending = walletConnect !== null && pendingId === walletConnect.id;

  const openQr = () => {
    if (!walletConnect) return;
    setView("qr");
    if (!wcPending) void select(walletConnect);
  };

  /** Abandon the WalletConnect pairing so the connector leaves its connecting state. */
  const cancelWalletConnect = () => {
    if (!wcPending || !walletConnect) return;
    clearWalletConnectUri();
    void cancelWalletConnectPairing(client, walletConnect.id)
      .then(() => disconnectWallet())
      .catch((error) =>
        console.error("Failed to cancel WalletConnect:", error),
      );
  };

  const back = () => {
    cancelWalletConnect();
    setView("list");
  };

  const close = () => {
    // A browser-wallet approval is in flight: keep the dialog up.
    if (pendingId && !wcPending) return;
    cancelWalletConnect();
    closeDialog();
  };

  return (
    <Dialog open={open} onClose={close} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/50 transition duration-200 ease-out data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel
          transition
          className={cn(
            "flex w-full max-w-[420px] flex-col overflow-hidden rounded-[18px] bg-white",
            "shadow-[0_32px_64px_-16px_rgba(9,9,11,.45)]",
            "transition duration-260 ease-[cubic-bezier(.2,.8,.2,1)] data-closed:translate-y-2 data-closed:scale-[.97] data-closed:opacity-0",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {view === "list" ? (
              <motion.div
                key="list"
                className="flex flex-col"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={SLIDE}
              >
                <header className="flex items-start gap-3 pt-[22px] pr-4 pb-[18px] pl-6">
                  <div className="flex flex-1 flex-col gap-1">
                    <DialogTitle className="font-display text-[22px] leading-[1.2] font-semibold text-zinc-900">
                      Connect a wallet
                    </DialogTitle>
                    <p className="text-sm text-zinc-500">
                      {detected
                        ? "Choose a wallet detected in this browser."
                        : "We couldn’t find a wallet in this browser."}
                    </p>
                  </div>
                  <IconButton as={CloseButton} label="Close" muted>
                    <XMarkIcon className="size-5" strokeWidth={1.8} />
                  </IconButton>
                </header>

                <div className="flex flex-col px-4">
                  {detected ? (
                    <ul className="flex flex-col overflow-hidden rounded-[14px] border border-zinc-200">
                      {wallets.map((connector) => (
                        <li
                          key={connector.id}
                          className="border-t border-zinc-100 first:border-t-0"
                        >
                          <WalletRow
                            connector={connector}
                            pending={pendingId === connector.id}
                            lastUsed={!pendingId && recentId === connector.id}
                            disabled={
                              pendingId !== null && pendingId !== connector.id
                            }
                            onSelect={() => void select(connector)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <NoWallets />
                  )}

                  {walletConnect && (
                    <>
                      <div className="px-2 pt-[18px] pb-2 text-xs font-semibold tracking-[.06em] text-zinc-400 uppercase">
                        Use another device
                      </div>
                      <button
                        type="button"
                        onClick={openQr}
                        disabled={pendingId !== null && !wcPending}
                        className="flex items-center gap-3.5 rounded-[14px] border border-blue-100 bg-blue-50 py-3 pr-4 pl-3 text-left transition-colors duration-150 hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden disabled:opacity-60 disabled:hover:bg-blue-50"
                      >
                        <WcMark
                          icon={walletConnect.icon}
                          className="size-9 rounded-[10px]"
                        />
                        <span className="flex flex-1 flex-col gap-px">
                          <span className="text-[15px] font-medium text-zinc-900">
                            WalletConnect
                          </span>
                          <span className="text-[13px] text-zinc-600">
                            Scan a QR code with a mobile wallet
                          </span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden
                          className="size-4 text-blue-500"
                          strokeWidth={2}
                        />
                      </button>
                    </>
                  )}
                </div>

                {detected ? (
                  <footer className="mt-5 border-t border-zinc-100 bg-zinc-50 px-6 py-3.5 text-[13px] text-zinc-500">
                    New to Solana?{" "}
                    <a
                      href={WALLETS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-700 hover:underline"
                    >
                      Get a wallet ↗
                    </a>
                  </footer>
                ) : (
                  <div className="h-5" />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="qr"
                className="flex flex-col"
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 24, opacity: 0 }}
                transition={SLIDE}
              >
                <header className="flex items-center gap-1.5 pt-4.5 pr-4 pb-3.5 pl-3.5">
                  <IconButton as="button" label="Back" onClick={back}>
                    <ChevronLeftIcon className="size-5" strokeWidth={1.8} />
                  </IconButton>
                  <DialogTitle className="flex-1 font-display text-[22px] font-semibold text-zinc-900">
                    WalletConnect
                  </DialogTitle>
                  <IconButton as={CloseButton} label="Close" muted>
                    <XMarkIcon className="size-5" strokeWidth={1.8} />
                  </IconButton>
                </header>
                <WalletConnectPanel
                  uri={walletConnectUri}
                  icon={walletConnect?.icon ?? null}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

const WalletConnectPanel = ({
  uri,
  icon,
}: {
  uri: string | null;
  icon: string | null;
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!uri || !navigator?.clipboard) return;
    await navigator.clipboard.writeText(uri);
    setCopied(true);
  };

  return (
    <div className="flex flex-col gap-[18px] px-4 pb-5">
      <div className="flex flex-col items-center gap-3.5 rounded-2xl bg-zinc-50 px-5 pt-5.5 pb-4.5">
        <div className="relative rounded-[14px] bg-white p-3 shadow-[0_0_0_1px_rgba(9,9,11,.06),0_6px_16px_-6px_rgba(9,9,11,.16)]">
          {uri ? (
            <QRCodeSVG
              value={uri}
              size={204}
              level="H"
              marginSize={0}
              fgColor="#18181b"
              className="block"
              aria-label="WalletConnect QR code"
            />
          ) : (
            <div className="grid size-[204px] place-items-center">
              <SpinnerIcon className="size-6 text-zinc-400" />
            </div>
          )}
          {uri && (
            <WcMark
              icon={icon}
              className="absolute top-1/2 left-1/2 size-10 -translate-1/2 rounded-[11px] ring-[5px] ring-white"
            />
          )}
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-base font-semibold text-zinc-900">
            Scan this QR code with your phone
          </div>
          <div className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500">
            <SpinnerIcon className="size-3" />
            {uri ? "Waiting for approval" : "Preparing connection"}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-1">
        <div className="text-[13px] font-medium text-zinc-600">
          Or copy the connection link
        </div>
        <div className="flex h-[42px] items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 pr-1 pl-3">
          <div className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600">
            {uri ?? "…"}
          </div>
          <button
            type="button"
            onClick={copy}
            disabled={!uri}
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-white px-2.5 text-[13px] font-medium text-zinc-800 shadow-[0_0_0_1px_rgba(9,9,11,.1),0_1px_2px_rgba(9,9,11,.06)] transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden disabled:opacity-50"
          >
            {copied ? (
              <CheckIcon className="size-[15px]" strokeWidth={1.7} />
            ) : (
              <DocumentDuplicateIcon
                className="size-[15px]"
                strokeWidth={1.7}
              />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * WalletConnect tile for the list row and the QR overlay. Uses the icon the
 * connector ships on its metadata; falls back to a plain "WC" mark.
 */
const WcMark = ({
  icon,
  className,
}: {
  icon: string | null;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      "grid shrink-0 place-items-center overflow-hidden bg-blue-500 text-xs font-bold text-white",
      className,
    )}
  >
    {icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" className="size-full object-cover" />
    ) : (
      "WC"
    )}
  </span>
);

const IconButton = ({
  as: Component,
  label,
  muted,
  className,
  ...props
}: {
  as: typeof CloseButton | "button";
  label: string;
  muted?: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <Component
    type="button"
    aria-label={label}
    className={cn(
      "grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-hidden",
      muted ? "text-zinc-400 hover:text-zinc-700" : "text-zinc-600",
      className,
    )}
    {...props}
  />
);

const WalletRow = ({
  connector,
  pending,
  lastUsed,
  disabled,
  onSelect,
}: {
  connector: WalletConnectorMetadata;
  pending: boolean;
  lastUsed: boolean;
  disabled: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={disabled || pending}
    className={cn(
      "flex h-15 w-full items-center gap-3.5 pr-4 pl-3 text-left transition-colors duration-150",
      "focus-visible:bg-zinc-50 focus-visible:outline-hidden",
      pending ? "bg-zinc-50" : "bg-white hover:bg-zinc-50",
      disabled && "opacity-60",
    )}
  >
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-indigo-600 text-[15px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(9,9,11,.08)]">
      {connector.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={connector.icon} alt="" className="size-9 object-cover" />
      ) : (
        connector.name[0]?.toUpperCase()
      )}
    </span>
    <span className="flex-1 truncate text-[15px] font-medium text-zinc-900">
      {connector.name}
    </span>
    {pending ? (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500">
        <SpinnerIcon className="size-4" />
        Approve in {connector.name}
      </span>
    ) : (
      <>
        {lastUsed && (
          <span className="inline-flex items-center rounded-md bg-zinc-600/10 px-1.5 py-0.5 text-xs/5 font-medium text-zinc-700">
            Last used
          </span>
        )}
        <ChevronRightIcon
          aria-hidden
          className="size-4 text-zinc-300"
          strokeWidth={2}
        />
      </>
    )}
  </button>
);

const NoWallets = () => (
  <div className="flex flex-col items-center gap-1.5 rounded-[14px] border border-dashed border-zinc-300 bg-zinc-50 px-6 pt-7 pb-6 text-center">
    <div aria-hidden className="relative mb-2.5 h-12 w-[104px]">
      <span className="absolute top-1.5 left-1.5 size-10 rotate-[-10deg] rounded-[11px] border border-dashed border-zinc-300 bg-white" />
      <span className="absolute top-1.5 right-1.5 size-10 rotate-10 rounded-[11px] border border-dashed border-zinc-300 bg-white" />
      <span className="absolute top-0 left-[30px] grid size-11 place-items-center rounded-xl bg-white shadow-[0_0_0_1px_rgba(9,9,11,.08),0_4px_10px_-2px_rgba(9,9,11,.12)]">
        <Image
          src={SolanaLogo}
          alt=""
          width={20}
          height={18}
          className="h-4.5 w-5"
        />
      </span>
    </div>
    <div className="text-[15px] font-semibold text-zinc-900">
      No wallets detected
    </div>
    <p className="max-w-[280px] text-sm text-pretty text-zinc-600">
      Install a Solana wallet extension, then refresh this page.
    </p>
    <div className="mt-2.5">
      <Button outline href={WALLETS_URL} target="_blank" rel="noreferrer">
        Browse Solana wallets ↗
      </Button>
    </div>
  </div>
);
