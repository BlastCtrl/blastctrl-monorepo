import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { compress } from "@/lib/solana";
import { cn } from "@blastctrl/ui";
import { RadioGroup } from "@headlessui/react";
import { ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  WalletConnectButton,
  WalletModalButton,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

export const MobileWallet = () => {
  const { network, setNetwork } = useNetworkConfigurationStore();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { publicKey, wallet, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);
  const wallet58 = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const openModal = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const writeToClipboard = async () => {
    if (!navigator?.clipboard) {
      console.warn("Clipboard not supported");
      return;
    }
    await navigator.clipboard.writeText(wallet58);
    setCopied(true);
    setTimeout(() => setCopied(false), 400);
  };

  if (!wallet) {
    return (
      <div className="border-t border-white px-4 pb-3 pt-4">
        <WalletModalButton />
      </div>
    );
  }
  if (!publicKey) {
    return (
      <div className="border-t border-white px-4 pb-3 pt-4">
        <WalletConnectButton />
      </div>
    );
  }

  return (
    <div className="border-t border-white pb-3 pt-4">
      <div className="flex items-center justify-between gap-x-3 px-4">
        <div className="inline-flex items-center gap-x-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <Image
              src={wallet.adapter.icon}
              height={26}
              width={26}
              className="size-[26px]"
              alt="wallet icon"
            />
          </div>

          <div className="cursor-default truncate text-base font-medium tracking-wider text-white">
            {compress(wallet58, 4)}
          </div>
          <button
            type="button"
            className="flex items-center"
            onClick={writeToClipboard}
          >
            {copied ? (
              <span className="text-sm text-white">Copied!</span>
            ) : (
              <ClipboardDocumentIcon className="mr-2 h-5 w-5 text-white hover:text-red-200" />
            )}
          </button>
        </div>
      </div>
      <div className="mt-3 px-2">
        <div>
          <RadioGroup
            className="my-2 flex items-center gap-x-4 px-3 text-white"
            value={network}
            onChange={setNetwork}
          >
            <RadioGroup.Option value="mainnet-beta">
              {({ checked }) => (
                <button
                  className={cn(
                    "rounded-md border border-gray-300 px-3 py-2 font-sans tracking-wide text-gray-100 shadow transition-colors hover:cursor-pointer",
                    "focus:outline-none focus:ring-2",
                    checked
                      ? "border-secondary bg-secondary text-secondary-content hover:bg-secondary-focus focus:ring-secondary"
                      : "hover:bg-primary-focus border-gray-300 focus:ring-gray-300",
                  )}
                >
                  Mainnet
                </button>
              )}
            </RadioGroup.Option>
            <RadioGroup.Option value="testnet">
              {({ checked }) => (
                <button
                  type="button"
                  className={cn(
                    "rounded-md border border-gray-300 px-3 py-2 font-sans tracking-wide text-gray-100 shadow transition-colors hover:cursor-pointer",
                    "focus:outline-none focus:ring-2",
                    checked
                      ? "border-secondary bg-secondary text-secondary-content hover:bg-secondary-focus focus:ring-secondary"
                      : "hover:bg-primary-focus border-gray-300 focus:ring-gray-300",
                  )}
                >
                  Testnet
                </button>
              )}
            </RadioGroup.Option>
            <RadioGroup.Option value="devnet">
              {({ checked }) => (
                <button
                  type="button"
                  className={cn(
                    "rounded-md border border-gray-300 px-3 py-2 font-sans tracking-wide text-gray-100 shadow transition-colors hover:cursor-pointer",
                    "focus:outline-none focus:ring-2",
                    checked
                      ? "border-secondary bg-secondary text-secondary-content hover:bg-secondary-focus focus:ring-secondary"
                      : "hover:bg-primary-focus border-gray-300 focus:ring-gray-300",
                  )}
                >
                  Devnet
                </button>
              )}
            </RadioGroup.Option>
          </RadioGroup>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="hover:bg-primary-focus block w-full rounded-md px-3 py-2 text-left text-base font-medium text-gray-50 hover:text-white"
        >
          Change wallet
        </button>
        <button
          onClick={() => disconnect()}
          className=" hover:bg-primary-focus block w-full rounded-md px-3 py-2 text-left text-base font-medium text-gray-50 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};
