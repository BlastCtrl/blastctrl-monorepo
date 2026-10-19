import { createContext, use, useEffect, useState } from "react";
import {
  CloseButton,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { cn } from "@blastctrl/ui";
import {
  useConnector,
  WalletConnectorId,
  WalletConnectorMetadata,
} from "@solana/connector/react";

export const ConnectorDialogContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const useConnectorDialog = () => {
  const context = use(ConnectorDialogContext);
  return context;
};

export const ConnectorDialog = () => {
  const { open, setOpen } = useConnectorDialog();

  const {
    walletStatus,
    isConnecting,
    connectorId,
    connectors,
    connectWallet,
    disconnectWallet,
  } = useConnector();
  const status = walletStatus.status;
  const [connectingConnectorId, setConnectingConnectorId] =
    useState<WalletConnectorId | null>(null);
  const [isOtherWalletsOpen, setIsOtherWalletsOpen] = useState(false);
  const [recentlyConnectedConnectorId, setRecentlyConnectedConnectorId] =
    useState<WalletConnectorId | null>(null);

  useEffect(() => {
    const recent = localStorage.getItem("recentlyConnectedConnectorId");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (recent) setRecentlyConnectedConnectorId(recent as WalletConnectorId);
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    if (!connectorId) return;
    localStorage.setItem("recentlyConnectedConnectorId", connectorId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentlyConnectedConnectorId(connectorId);
  }, [status, connectorId]);

  const handleSelectWallet = async (connector: WalletConnectorMetadata) => {
    setConnectingConnectorId(connector.id);
    try {
      await connectWallet(connector.id);
      localStorage.setItem("recentlyConnectedConnectorId", connector.id);
      setRecentlyConnectedConnectorId(connector.id);
      setOpen(false);
    } catch (error) {
      console.error("Failed to connect:", error);
    } finally {
      setConnectingConnectorId(null);
    }
  };

  const readyConnectors = connectors.filter((c) => c.ready);
  const primaryWallets = readyConnectors.slice(0, 3);
  // const otherWallets = readyConnectors.slice(3);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      className="relative z-50"
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className={cn("max-w-lg rounded-2xl bg-white p-4")}>
          <header className="flex justify-between gap-2">
            <DialogTitle className="font-display text-[22px] font-bold">
              Connect a wallet
            </DialogTitle>
            <CloseButton aria-label="Close wallet dialog">
              <XMarkIcon className="size-4" />
            </CloseButton>
          </header>
          <div className="space-y-4">
            {primaryWallets.map((connector) => (
              <button
                key={connector.id}
                className="flex w-full items-center justify-between rounded-2xl border p-4 hover:bg-accent"
                onClick={() => handleSelectWallet(connector)}
                disabled={isConnecting}
              >
                <span className="font-semibold">{connector.name}</span>
                <img src={connector.icon} className="size-10 rounded-full" />
              </button>
            ))}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
