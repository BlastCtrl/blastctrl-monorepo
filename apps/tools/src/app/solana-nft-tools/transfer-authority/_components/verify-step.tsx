import useUmi from "@/lib/hooks/use-umi";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMemo, useState } from "react";
import { NftTable } from "./nft-table";
import { planVerify } from "./plan";
import { SendPanel } from "./send-panel";
import type { ReadyVerify } from "./transactions";
import { packBatches, verifyInstruction } from "./transactions";
import { useNftMetadata } from "./use-nft-metadata";

type Props = {
  mints: string[];
  onBusyChange: (busy: boolean) => void;
};

export function VerifyStep({ mints, onBusyChange }: Props) {
  const umi = useUmi();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet = publicKey?.toBase58() ?? "";

  const [checked, setChecked] = useState<string[]>([]);
  const metadata = useNftMetadata(checked);

  const plans = useMemo(() => {
    if (!metadata.data || !wallet) return null;
    return checked.map((mint) =>
      planVerify(mint, metadata.data.get(mint) ?? null, wallet),
    );
  }, [metadata.data, checked, wallet]);

  const batches = useMemo(() => {
    if (!plans || !publicKey) return [];
    return packBatches(
      plans
        .filter((p): p is ReadyVerify => p.status === "ready")
        .map((plan) => ({
          mint: plan.mint,
          instruction: verifyInstruction(umi, plan, wallet),
        })),
      publicKey,
    );
  }, [plans, publicKey, umi, wallet]);

  const listChanged =
    checked.length > 0 &&
    (checked.length !== mints.length || checked.some((m, i) => m !== mints[i]));

  const check = () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    if (!listChanged && checked.length > 0) {
      void metadata.refetch();
    } else {
      setChecked(mints);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Connect the wallet that was added as a creator in step 1. It signs a
        verification for each NFT; no update authority is needed.
      </p>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {listChanged && (
          <p className="mr-auto text-sm text-amber-700">
            The list changed since the last check.
          </p>
        )}
        <Button
          outline
          onClick={check}
          disabled={metadata.isFetching || (!!publicKey && mints.length === 0)}
        >
          {metadata.isFetching && (
            <SpinnerIcon className="mr-1 -ml-1 size-4 animate-spin" />
          )}
          {!publicKey
            ? "Connect your wallet"
            : `Check ${mints.length} ${mints.length === 1 ? "NFT" : "NFTs"}`}
        </Button>
      </div>

      {metadata.error && (
        <p className="text-sm text-red-700">
          Couldn&apos;t load the NFTs: {metadata.error.message}
        </p>
      )}

      {plans && (
        <div className="border-t border-gray-200 pt-6">
          <NftTable
            rows={plans}
            readyLabel="Will verify"
            doneLabel="Already verified"
          />
          <SendPanel
            action="Verify"
            disabled={metadata.isFetching}
            batches={batches}
            onBusyChange={onBusyChange}
            onSettled={() => void metadata.refetch()}
          />
        </div>
      )}
    </div>
  );
}
