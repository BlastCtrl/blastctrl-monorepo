"use client";

import { TurboStorage } from "@/lib/turbo";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { UploaderView } from "./_components/view";

export default function FileUpload() {
  const { connected, publicKey, signMessage, signTransaction } = useWallet();
  const { storage, error } = useMemo(() => {
    if (!connected) return { storage: null, error: null };
    try {
      return {
        storage: TurboStorage.make({ publicKey, signMessage, signTransaction }),
        error: null,
      };
    } catch (error) {
      return {
        storage: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [connected, publicKey, signMessage, signTransaction]);

  return (
    <div>
      <div className="mx-auto">
        <div className="mb-4 sm:border-b sm:border-gray-200 sm:pb-3">
          <h1 className="mb-2 text-center font-display text-3xl font-semibold text-gray-900">
            Simple Arweave Uploader
          </h1>
          <p className="text-center text-sm leading-snug tracking-tight text-gray-900">
            Upload files to Arweave using Turbo and paying in SOL.
          </p>
        </div>
      </div>
      {error ? (
        <div role="alert">{error}</div>
      ) : storage ? (
        <UploaderView key={publicKey?.toBase58()} turbo={storage} />
      ) : (
        <div>Connect your wallet to use this tool</div>
      )}
    </div>
  );
}
