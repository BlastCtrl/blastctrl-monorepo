import { useConnectorDialog } from "@/connector/connector-dialog";
import { useKitClient } from "@/connector/use-kit-client";
import { useTokenMetadata } from "@/state/queries/use-token-metadata";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useConnector } from "@solana/connector/react";
import { createNoopSigner, type Address } from "@solana/kit";
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
import type { Batch, ReadyVerify } from "./transactions";
import { verifyBatches } from "./transactions";
import { useResolved } from "./use-resolved";

const NO_BATCHES: Batch[] = [];

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
  mints: Address[];
  onBusyChange: (busy: boolean) => void;
};

export function VerifyStep({ mints, onBusyChange }: Props) {
  const { account } = useConnector();
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();

  const [mode, setMode] = useState<SignerMode>("wallet");
  const [multisigAddress, setMultisigAddress] = useState("");
  const { multisig, error: multisigError } = useSquadsMultisigInfo(
    multisigAddress,
    mode === "squads",
  );
  const [checked, setChecked] = useState<Address[]>([]);
  const metadata = useTokenMetadata(checked);

  /** The creator whose verification gets built, null until it's known. */
  const creator = mode === "wallet" ? account : (multisig?.vault ?? null);
  /**
   * Who signs the instructions: the kit client's wallet signer, or a noop
   * signer for the vault, which signs through the Squads proposal.
   */
  const vault = multisig?.vault;
  const creatorSigner = useMemo(
    () =>
      mode === "wallet"
        ? (client?.payer ?? null)
        : vault
          ? createNoopSigner(vault)
          : null,
    [mode, client, vault],
  );

  const plans = useMemo(() => {
    if (!metadata.data || !creator) return null;
    return checked.map((mint) =>
      planVerify(mint, metadata.data.get(mint) ?? null, creator),
    );
  }, [metadata.data, checked, creator]);

  const pendingBatches = useMemo(() => {
    if (!plans || !creatorSigner) return null;
    return verifyBatches(
      plans.filter((p): p is ReadyVerify => p.status === "ready"),
      creatorSigner,
      mode === "squads"
        ? { maxPerTransaction: MAX_VERIFICATIONS_PER_SQUADS_TRANSACTION }
        : undefined,
    );
  }, [plans, creatorSigner, mode]);
  const batches = useResolved(pendingBatches) ?? NO_BATCHES;

  const listChanged =
    checked.length > 0 &&
    (checked.length !== mints.length || checked.some((m, i) => m !== mints[i]));

  const check = () => {
    if (mode === "wallet" && !account) {
      setOpen(true);
      return;
    }
    if (!listChanged && checked.length > 0) {
      void metadata.refetch();
    } else {
      setChecked(mints);
    }
  };

  const checkLabel =
    mode === "wallet" && !account
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
