import { notify } from "@/components";
import type { IrysStorage } from "@/lib/irys";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import type { Amount, Currency } from "@/types";
import { formatAmount, lamports } from "@/types";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { Transition } from "@headlessui/react";
import { QuestionMarkCircleIcon } from "@heroicons/react/20/solid";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { useLocalStorage, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { formatRelative } from "date-fns";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Uploads } from "./uploads";

export type UploadedFile = {
  name: string;
  contentType: string;
  uri: string;
  uploadDate: number;
};

function pascalify(text: string) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
  text = text.replace(/[-_\s.]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
  return text.substring(0, 1).toUpperCase() + text.substring(1);
}

export const UploaderView = ({ irys }: { irys: IrysStorage }) => {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { network } = useNetworkConfigurationStore();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePrice, setFilePrice] = useState<Amount<Currency> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploads, setUploads] = useLocalStorage<UploadedFile[]>(
    `previousUploads${pascalify(network)}`,
    [],
  );
  const [balance, setBalance] = useState<Amount<Currency> | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!connected) return;
    const balance = await irys.getBalance();
    setBalance(balance);
  }, [irys, connected]);

  useEffect(() => {
    if (network !== WalletAdapterNetwork.Mainnet) {
      notify({
        title: `Network is set to ${network}`,
        description: (
          <>
            Using Irys on non-mainnet networks will result in your uploads not
            being permanent. All uploads are removed after a week.{" "}
            <a
              className="text-blue-300 underline"
              rel="noreferrer"
              target="_blank"
              href="https://docs.irys.xyz/developer-docs/using-devnet"
            >
              Docs
            </a>
          </>
        ),
      });
    }
  }, [network]);

  useEffect(() => {
    let subscribed = true;
    if (subscribed) {
      void refreshBalance();
    }
    return () => {
      subscribed = false;
    };
  }, [network, refreshBalance]);

  const handleWithdraw = async () => {
    try {
      const { requested } = await irys.withdrawAll();
      const balance = lamports(requested);
      notify({
        title: "Withdraw succesful",
        type: "success",
        description: (
          <>
            Withdrawed{" "}
            <span className="font-medium text-blue-300">
              {formatAmount(balance)}
            </span>
          </>
        ),
      });
    } catch (err: any) {
      console.log({ err });
      notify({
        title: "Error withdrawing",
        type: "error",
        description: (
          <>
            {err.message ? (
              <span className="break-words">{err.message}</span>
            ) : (
              "Unknown error, check the console for more information."
            )}
          </>
        ),
      });
    } finally {
      await refreshBalance();
    }
  };

  const handleDrag = (event: DragEvent<HTMLFormElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLFormElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files?.[0]) {
      const droppedFile = event.dataTransfer.files[0];
      setFile(droppedFile);
      void irys
        .getUploadPrice(droppedFile.size)
        .then((price) => setFilePrice(price));
    }
  };

  const handleSetFile = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (event.target?.files?.length === 1) {
      const selectedFile = event.target.files.item(0)!;
      setFile(selectedFile);
      void irys
        .getUploadPrice(selectedFile.size)
        .then((price) => setFilePrice(price));
    }
  };

  const handleCancel = (e: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    e.preventDefault();
    setFile(null);
    setFilePrice(null);
    setIsUploading(false);
  };

  const handleUpload = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }

    if (!file) {
      notify({ type: "error", description: "No file selected" });
      return;
    }

    try {
      setIsUploading(true);
      const res = await irys.uploadFile(file);
      const uri = `https://arweave.net/${res.id}`;
      setUploads((uploads) => [
        {
          name: file.name,
          contentType: file.type,
          uri,
          uploadDate: Date.now(),
        },
        ...uploads,
      ]);
      notify({
        title: "Upload success",
        type: "success",
        description: (
          <>
            Your file is available at{" "}
            <a
              href={uri}
              rel="noreferrer"
              target="_blank"
              className="break-all font-medium text-blue-300 underline"
            >
              {uri}
            </a>
          </>
        ),
      });
      setFile(null);
    } catch (err: any) {
      console.log({ err });
      notify({
        title: "Error uploading",
        type: "error",
        description: (
          <>
            {err.message
              ? err.message
              : "Unknown error, check the console for more details"}
          </>
        ),
      });
    } finally {
      void refreshBalance();
      setIsUploading(false);
    }
  };

  // TODO: add FAQ, disclosures
  return (
    <div className="mx-auto flex flex-col md:max-w-screen-sm md:p-1">
      {/* Drop upload */}
      <div>
        <Transition
          as="form"
          onSubmit={(e) => e.preventDefault()}
          onDragEnter={handleDrag}
          show={!file}
          enter="transform transition duration-75"
          enterFrom="translate-y-20 opacity-50"
          enterTo="translate-y-0 opacity-100"
        >
          <div className="sm:grid sm:grid-cols-2 sm:items-start sm:gap-4">
            <div className="mt-1 sm:col-span-2 sm:mt-0">
              <div
                className={cn(
                  "mx-auto flex max-w-lg justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pb-6 pt-5 transition-colors",
                  dragActive && "bg-accent/30",
                )}
              >
                <div className="space-y-1 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex justify-center text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="border-b-secondary text-secondary focus-within:ring-secondary hover:text-secondary-focus relative cursor-pointer border-b-2 font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        onChange={handleSetFile}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Not recommended to use files over 20MB
                  </p>
                </div>
              </div>
            </div>
            {dragActive && (
              <div
                draggable={true}
                className="absolute inset-0 h-full w-full"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              ></div>
            )}
          </div>
        </Transition>

        {/* File data and upload */}
        <Transition
          as="div"
          show={!!file}
          appear={true}
          enter="transform transition"
          enterFrom="-translate-x-20 opacity-50"
          enterTo="translate-x-0 opacity-100"
        >
          {file && (
            <div className="overflow-hidden bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  File Information
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Metadata and upload cost.
                </p>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                <dl className="sm:divide-y sm:divide-gray-200">
                  <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                    <dt className="text-sm font-medium text-gray-500">
                      File name
                    </dt>
                    <dd className="mt-1 break-all text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {file.name}
                    </dd>
                  </div>
                  <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                    <dt className="text-sm font-medium text-gray-500">Type</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {file.type}
                    </dd>
                  </div>

                  <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                    <dt className="text-sm font-medium text-gray-500">Size</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {(file.size / 10 ** 3).toFixed(2)} KB
                    </dd>
                  </div>

                  <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                    <dt className="text-sm font-medium text-gray-500">
                      Last modified
                    </dt>
                    <dd
                      suppressHydrationWarning
                      className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0"
                    >
                      {formatRelative(file.lastModified, new Date())}
                    </dd>
                  </div>
                  <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                    <dt className="text-sm font-medium text-gray-500">
                      Estimated cost
                      <a
                        href="https://docs.irys.xyz/overview/fees"
                        rel="noreferrer"
                        target="_blank"
                      >
                        <QuestionMarkCircleIcon className="mb-0.5 ml-1 inline h-4 w-4 text-gray-400" />
                      </a>
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {filePrice && formatAmount(filePrice)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="border-t border-gray-200 bg-gray-50">
                <form
                  onSubmit={(e) => e.preventDefault()}
                  className="flex justify-center gap-1 py-2 sm:gap-2"
                >
                  <Button
                    plain
                    type="button"
                    disabled={!file}
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="indigo"
                    type="button"
                    disabled={!file}
                    onClick={handleUpload}
                  >
                    {isUploading && (
                      <SpinnerIcon
                        className="-ml-1 mr-3 h-5 w-5 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {isUploading ? "Uploading" : "Upload"}
                  </Button>
                </form>
              </div>
            </div>
          )}
        </Transition>
      </div>

      {balance?.basisPoints.gtn(0) && (
        <div className="mx-auto my-3 max-w-sm rounded-md border border-gray-300 px-3 py-2 shadow-sm">
          <div className="font-base text-sm text-gray-900">
            <span className="mb-1 block text-xs uppercase tracking-wider text-gray-500">
              {network}
            </span>
            <span className="font-medium text-gray-500">Irys funds </span>
            <span className="mx-1 text-base font-semibold text-gray-700">
              {balance ? <>{formatAmount(balance)}</> : "0 SOL"}
            </span>
          </div>

          <div className="my-3 w-full">
            <button
              disabled={isUploading}
              onClick={handleWithdraw}
              className={cn(
                "bg-secondary inline-flex w-full items-center justify-center rounded-md border border-transparent px-4 py-1.5 text-base font-medium text-gray-50",
                "hover:bg-secondary-focus focus:ring-secondary-focus focus:outline-none focus:ring-2 focus:ring-offset-2",
                "disabled:pointer-events-none disabled:bg-gray-400",
              )}
            >
              <ChevronRightIcon className="-ml-1 mr-1 h-5 w-5" />
              Withdraw all
            </button>
            <p className="pt-2 text-xs text-gray-500">
              These are the leftovers due to how the pricing works. Minimum
              balance for withdrawing is 5000 lamports.
            </p>
          </div>
        </div>
      )}

      {uploads?.length > 0 && (
        <div className="my-4 sm:my-6">
          <Uploads files={uploads} />
        </div>
      )}
    </div>
  );
};
