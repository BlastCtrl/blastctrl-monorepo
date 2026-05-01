"use client";

import { TurboStorage } from "@/lib/turbo";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { UploaderView } from "./_components/view";

export default function FileUpload() {
  const wallet = useWallet();
  const [storage, setStorage] = useState<TurboStorage | null>(null);

  useEffect(() => {
    async function make() {
      const turbo = await TurboStorage.make(wallet);
      setStorage(turbo);
    }
    if (!storage && wallet?.connected) {
      void make();
    }

    return () => {
      setStorage(null);
    };
  }, [storage, wallet, wallet.connected]);

  return (
    <div>
      <div className="mx-auto">
        <div className="mb-4 sm:border-b sm:border-gray-200 sm:pb-3">
          <h1 className="font-display mb-2 text-center text-3xl font-semibold text-gray-900">
            Simple Arweave Uploader
          </h1>
          <p className="text-center text-sm leading-snug tracking-tight text-gray-900">
            Upload files to Arweave using Turbo and paying in SOL.
          </p>
        </div>
      </div>
      {wallet && storage ? (
        <UploaderView turbo={storage} />
      ) : (
        <div>Connect your wallet to use this tool</div>
      )}
    </div>
  );
}
