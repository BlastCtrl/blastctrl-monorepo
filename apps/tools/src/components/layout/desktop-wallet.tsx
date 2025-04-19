import SolanaLogo from "@/../public/solanaLogoMark.svg";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { compress } from "@/lib/solana";
import { Button, CopyButton, Switch, SwitchField, cn } from "@blastctrl/ui";
import {
  Field,
  Input,
  Menu,
  RadioGroup,
  Radio,
  Transition,
} from "@headlessui/react";
import { ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  WalletConnectButton,
  WalletModalButton,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import Image from "next/image";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useAutoConnect } from "@/state/context/AutoConnectProvider";
import { Label } from "@blastctrl/ui/fieldset";

export const DesktopWallet = () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { publicKey, wallet, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet58 = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const openModal = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  if (!wallet) {
    return (
      <WalletModalButton
        startIcon={
          <Image
            src={SolanaLogo}
            height={20}
            width={20}
            className="size-5"
            alt=""
          />
        }
        style={{ height: 36, lineHeight: 36 }}
      >
        Select Wallet
      </WalletModalButton>
    );
  }
  if (!publicKey) {
    return (
      <WalletConnectButton className="rounded-md border border-white py-1" />
    );
  }

  return (
    <Menu as="div" className="relative ml-4 shrink-0">
      <Menu.Button className="bg-primary-focus flex items-center gap-2 rounded-md px-4 py-1.5">
        <span className="sr-only">Open user menu</span>
        <Image
          src={wallet.adapter.icon}
          height={24}
          width={24}
          alt="wallet icon"
          className="size-6"
        />
        <span className="text-sm font-semibold text-white">
          {compress(wallet58, 4)}
        </span>
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-2 w-fit origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="border-b border-gray-300 px-3 py-2 text-sm text-gray-600">
            <div className="text-sm text-gray-600">Connected as</div>
            <CopyButton
              clipboard={wallet58}
              className="group mt-1 inline-flex items-center gap-2 text-lg font-bold"
            >
              {({ copied }) => (
                <>
                  <span className="text-gray-700">
                    {copied ? "Copied!" : compress(wallet58, 4)}
                  </span>
                  <ClipboardDocumentIcon className="size-5 text-gray-500 group-hover:text-gray-600" />
                </>
              )}
            </CopyButton>
          </div>
          <ToggleAutoConnect />
          <NetworkPicker />
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={openModal}
                className={cn(
                  active ? "bg-gray-100" : "",
                  "block w-full px-4 py-2 text-left text-sm text-gray-700",
                )}
              >
                Change wallet
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={() => disconnect()}
                className={cn(
                  active ? "bg-gray-100" : "",
                  "block w-full px-4 py-2 text-left text-sm text-gray-700",
                )}
              >
                Disconnect
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
};

const ToggleAutoConnect = () => {
  const { autoConnect, setAutoConnect } = useAutoConnect();

  return (
    <div className="px-3 py-2">
      <SwitchField>
        <Switch checked={autoConnect} onChange={setAutoConnect} />
        <Label>Enable autoconnect</Label>
      </SwitchField>
    </div>
  );
};

const NetworkPicker = () => {
  const { network, setNetwork } = useNetworkConfigurationStore();
  const availableNetworks = ["mainnet-beta", "testnet", "devnet"];
  const [customRpc, setCustomRpc] = useState(() =>
    !availableNetworks.includes(network) ? network : "",
  );

  return (
    <>
      <div className="pb-2">
        <RadioGroup
          className="flex items-center gap-x-2 px-3 text-white"
          value={network}
          onChange={(value) => {
            setNetwork(value);
            setCustomRpc("");
          }}
        >
          {availableNetworks.map((item) => (
            <Radio key={item} value={item.toLowerCase()} className="grow">
              <button
                type="button"
                className={cn(
                  "w-full rounded-md border border-gray-300 px-1.5 py-0.5 text-sm capitalize",
                  "focus:outline-none focus:ring-1",
                  network === item
                    ? "text-secondary-content border-indigo-600 bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50 focus:ring-gray-300",
                )}
              >
                {/* split by - and extract the first part because of mainnet-beta */}
                {item.split("-")[0]}
              </button>
            </Radio>
          ))}
        </RadioGroup>
      </div>
      <div className="flex h-9 items-center gap-2 px-3">
        <Field>
          <Input
            placeholder="Enter custom RPC"
            type="text"
            value={customRpc}
            onChange={({ target }) => setCustomRpc(target.value)}
            className="w-36 min-w-0 rounded border border-zinc-300 px-2.5 py-1 text-sm/6"
          />
        </Field>
        <Button
          type="button"
          color="indigo"
          className="h-9"
          onClick={() => setNetwork(customRpc)}
        >
          Set
        </Button>
      </div>
    </>
  );
};
