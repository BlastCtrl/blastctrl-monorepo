"use client";

import { IrysStorage } from "@/lib/irys";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { UploaderView } from "./_components/view";

export default function FileUpload() {
  const { network } = useNetworkConfigurationStore();
  const wallet = useWallet();
  const [storage, setStorage] = useState<IrysStorage | null>(null);

  useEffect(() => {
    async function makeWebIrys() {
      const irys = await IrysStorage.makeWebIrys(network, wallet);
      setStorage(irys);
    }
    if (!storage && wallet?.connected) {
      void makeWebIrys();
    }

    () => {
      setStorage(null);
    };
  }, [network, storage, wallet, wallet.connected]);

  return (
    <div>
      <div className="mx-auto">
        <div className="mb-4 sm:border-b sm:border-gray-200 sm:pb-3">
          <h1 className="font-display mb-2 text-center text-3xl font-semibold text-gray-900">
            Simple Arweave Uploader
          </h1>
          <p className="text-center text-sm leading-snug tracking-tight text-gray-900">
            Upload files to Arweave using the Irys Network and paying in SOL.
          </p>
        </div>
      </div>
      {wallet && storage ? (
        <UploaderView irys={storage} />
      ) : (
        <div>Connect your wallet to use this tool</div>
      )}
    </div>
  );
}
