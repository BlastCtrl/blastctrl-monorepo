"use client";

import { notifyPromise } from "@/components";
import type { FileUploader } from "@/lib/solana/metaplex-json-metadata";
import { TurboStorage } from "@/lib/turbo";
import { createWalletAdapterCompat } from "@solana/connector/compat";
import { useConnector, useTransactionSigner } from "@solana/connector/react";
import Link from "next/link";
import { useMemo } from "react";

/** Shown when an Arweave upload fails; the funds, if any were spent, are recoverable. */
export const uploadErrorDescription = (err: unknown) => (
  <div className="break-normal">
    <p>
      There has been an error while uploading with the message:{" "}
      <span className="font-medium break-all text-yellow-300">
        {err instanceof Error ? err.message : String(err)}
      </span>
      .
    </p>
    <p className="mt-2">
      You can recover any lost funds on the{" "}
      <Link
        href="/permanent-storage-tools/file-upload"
        className="font-medium text-blue-300"
      >
        /permanent-storage-tools
      </Link>{" "}
      page.
    </p>
  </div>
);

/**
 * Uploads files to Arweave through Turbo, paid in SOL by the connected wallet,
 * reporting each upload in a toast. Null until a wallet is connected. Every
 * failure, including a wallet that can't sign messages, is reported by the
 * toast and rejected; callers can stop quietly.
 */
export function useArweaveUploader(): FileUploader | null {
  const { disconnectWallet } = useConnector();
  // Turbo speaks the legacy wallet-adapter dialect; bridge the connector's
  // byte signer through the compat layer, as the file-upload tool does.
  const { signer } = useTransactionSigner();

  return useMemo(() => {
    if (!signer) return null;
    // One client per wallet, created on first use and dropped with this
    // closure when the wallet changes or the page unmounts.
    let turbo: TurboStorage | undefined;

    return (file, label) =>
      notifyPromise(
        (async () => {
          turbo ??= TurboStorage.make(
            createWalletAdapterCompat(signer, { disconnect: disconnectWallet }),
          );
          const { id } = await turbo.uploadFile(file);
          return `https://arweave.net/${id}`;
        })(),
        {
          loading: { description: `Uploading ${label} to Arweave...` },
          success: { description: `Uploaded the ${label} to Arweave` },
          error: (err) => ({
            title: `Error uploading the ${label}`,
            description: uploadErrorDescription(err),
          }),
        },
      );
  }, [signer, disconnectWallet]);
}
