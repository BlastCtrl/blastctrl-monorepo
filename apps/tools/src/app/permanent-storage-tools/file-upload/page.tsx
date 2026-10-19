"use client";

import { TurboStorage } from "@/lib/turbo";
import { createWalletAdapterCompat } from "@solana/connector/compat";
import { useConnector, useTransactionSigner } from "@solana/connector/react";
import { useMemo } from "react";
import { UploaderView } from "./_components/view";

export default function FileUpload() {
  const { isConnected, account, disconnectWallet } = useConnector();
  // Turbo's SDK speaks the legacy wallet-adapter dialect (web3.js
  // transactions, raw message signing), so bridge the connector's signer
  // through the compat layer instead of hand-rolling conversions.
  const { signer } = useTransactionSigner();

  const { storage, error } = useMemo(() => {
    if (!isConnected || !signer) return { storage: null, error: null };
    try {
      const wallet = createWalletAdapterCompat(signer, {
        disconnect: disconnectWallet,
      });
      return { storage: TurboStorage.make(wallet), error: null };
    } catch (error) {
      return {
        storage: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isConnected, signer, disconnectWallet]);

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
        <UploaderView key={account ?? undefined} turbo={storage} />
      ) : (
        <div>Connect your wallet to use this tool</div>
      )}
    </div>
  );
}
