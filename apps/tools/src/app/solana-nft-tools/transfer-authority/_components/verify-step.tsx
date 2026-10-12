import useUmi from "@/lib/hooks/use-umi";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { NftTable } from "./nft-table";
import { planVerify } from "./plan";
import { SendPanel } from "./send-panel";
import type { SignerMode } from "./signer-choice";
import {
  SignerModePicker,
  SquadsMultisigField,
  useSquadsMultisigInfo,
} from "./signer-choice";
import { MAX_VERIFICATIONS_PER_SQUADS_TRANSACTION } from "./squads";
import { SquadsPanel } from "./squads-panel";
import type { ReadyVerify } from "./transactions";
import { packBatches, verifyInstruction } from "./transactions";
import { useNftMetadata } from "./use-nft-metadata";

const MODES = {
  wallet: {
    label: "Sign with the connected wallet",
    description: "The creator's wallet signs and sends the verifications.",
  },
  squads: {
    label: "Propose from a Squads multisig",
    description:
      "A member's wallet puts all the verifications into one Squads proposal. The multisig approves it once, here or in the Squads app, and any member executes it.",
  },
};

type Props = {
  mints: string[];
  onBusyChange: (busy: boolean) => void;
};

export function VerifyStep({ mints, onBusyChange }: Props) {
  const umi = useUmi();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const [mode, setMode] = useState<SignerMode>("wallet");
  const [multisigAddress, setMultisigAddress] = useState("");
  const { multisig, error: multisigError } = useSquadsMultisigInfo(
    multisigAddress,
    mode === "squads",
  );
  const [checked, setChecked] = useState<string[]>([]);
  const metadata = useNftMetadata(checked);

  /** The creator whose verification gets built, empty until it's known. */
  const creator =
    mode === "wallet" ? (publicKey?.toBase58() ?? "") : (multisig?.vault ?? "");

  const plans = useMemo(() => {
    if (!metadata.data || !creator) return null;
    return checked.map((mint) =>
      planVerify(mint, metadata.data.get(mint) ?? null, creator),
    );
  }, [metadata.data, checked, creator]);

  const batches = useMemo(() => {
    if (!plans || !creator) return [];
    return packBatches(
      plans
        .filter((p): p is ReadyVerify => p.status === "ready")
        .map((plan) => ({
          mint: plan.mint,
          instruction: verifyInstruction(umi, plan, creator),
        })),
      new PublicKey(creator),
      mode === "squads"
        ? { maxPerTransaction: MAX_VERIFICATIONS_PER_SQUADS_TRANSACTION }
        : undefined,
    );
  }, [plans, creator, umi, mode]);

  const listChanged =
    checked.length > 0 &&
    (checked.length !== mints.length || checked.some((m, i) => m !== mints[i]));

  const check = () => {
    if (mode === "wallet" && !publicKey) {
      setVisible(true);
      return;
    }
    if (!listChanged && checked.length > 0) {
      void metadata.refetch();
    } else {
      setChecked(mints);
    }
  };

  const checkLabel =
    mode === "wallet" && !publicKey
      ? "Connect your wallet"
      : `Check ${mints.length} ${mints.length === 1 ? "NFT" : "NFTs"}`;

  return (
    <div className="space-y-6">
      <SignerModePicker
        name="verify-mode"
        legend="Who verifies"
        value={mode}
        onChange={setMode}
        options={MODES}
      />

      {mode === "wallet" ? (
        <p className="text-sm text-gray-500">
          Connect the wallet that was added as a creator in step 1. It signs a
          verification for each NFT; no update authority is needed.
        </p>
      ) : (
        <SquadsMultisigField
          id="verify-squads-multisig"
          value={multisigAddress}
          onChange={setMultisigAddress}
          error={multisigError}
          vault={multisig?.vault}
          hint="Its first vault must be the creator that was added in step 1."
        />
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {listChanged && (
          <p className="mr-auto text-sm text-amber-700">
            The list changed since the last check.
          </p>
        )}
        <Button
          outline
          onClick={check}
          disabled={
            metadata.isFetching ||
            mints.length === 0 ||
            (mode === "squads" && !creator)
          }
        >
          {metadata.isFetching && (
            <SpinnerIcon className="mr-1 -ml-1 size-4 animate-spin" />
          )}
          {checkLabel}
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
          {mode === "wallet" ? (
            <SendPanel
              action="Verify"
              disabled={metadata.isFetching}
              batches={batches}
              onBusyChange={onBusyChange}
              onSettled={() => void metadata.refetch()}
            />
          ) : (
            multisig && (
              <SquadsPanel
                batches={batches}
                multisig={multisig}
                onBusyChange={onBusyChange}
                onSettled={() => void metadata.refetch()}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
