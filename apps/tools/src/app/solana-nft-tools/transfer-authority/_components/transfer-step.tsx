import { isPublicKey } from "@/lib/solana/common";
import useUmi from "@/lib/hooks/use-umi";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { AddressInput, Label } from "./address-input";
import { NftTable } from "./nft-table";
import type { CreatorMode, TransferPlan } from "./plan";
import { planTransfer } from "./plan";
import { SendPanel } from "./send-panel";
import type { SignerMode } from "./signer-choice";
import {
  SignerModePicker,
  SquadsMultisigField,
  useSquadsMultisigInfo,
} from "./signer-choice";
import {
  MAX_TRANSFERS_PER_SQUADS_TRANSACTION,
  useSquadsMultisig,
} from "./squads";
import { SquadsPanel } from "./squads-panel";
import type { ReadyTransfer } from "./transactions";
import { packBatches, transferInstruction } from "./transactions";
import { useNftMetadata } from "./use-nft-metadata";

const CREATOR_MODES: {
  value: CreatorMode;
  label: string;
  description: string;
}[] = [
  {
    value: "swap",
    label: "Swap the creator entry",
    description:
      "The new creator takes the current update authority's place and share. Other creators stay as they are.",
  },
  {
    value: "replace",
    label: "Replace all creators",
    description:
      "The new creator becomes the only creator, with 100%. Not possible while someone else is a verified creator.",
  },
  {
    value: "keep",
    label: "Don't change creators",
    description: "Only the update authority changes.",
  },
];

const SIGNER_MODES = {
  wallet: {
    label: "Sign with the connected wallet",
    description: "The current update authority's wallet signs and sends it.",
  },
  squads: {
    label: "Propose from a Squads multisig",
    description:
      "When a Squads vault is the current update authority: a member's wallet puts the whole transfer into one Squads proposal. The multisig approves it once, here or in the Squads app, and any member executes it.",
  },
};

type Props = {
  mints: string[];
  onBusyChange: (busy: boolean) => void;
};

export function TransferStep({ mints, onBusyChange }: Props) {
  const umi = useUmi();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [mode, setMode] = useState<SignerMode>("wallet");
  const [multisigAddress, setMultisigAddress] = useState("");
  const { multisig, error: multisigError } = useSquadsMultisigInfo(
    multisigAddress,
    mode === "squads",
  );
  /** The current update authority, empty until it's known. */
  const authority =
    mode === "wallet" ? (publicKey?.toBase58() ?? "") : (multisig?.vault ?? "");

  const [checked, setChecked] = useState<string[]>([]);
  const [newAuthority, setNewAuthority] = useState("");
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("swap");
  const [sameCreator, setSameCreator] = useState(true);
  const [creatorInput, setCreatorInput] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const metadata = useNftMetadata(checked);
  const newCreator = sameCreator ? newAuthority : creatorInput;

  // Handing NFTs to a Squads multisig account instead of its vault can't be
  // undone, so both addresses are checked before anything is planned.
  const authorityMultisig = useSquadsMultisig(newAuthority);
  const creatorMultisig = useSquadsMultisig(creatorInput);
  const checkCreator = creatorMode !== "keep" && !sameCreator;

  const authorityError = !newAuthority
    ? "Enter the new update authority"
    : !isPublicKey(newAuthority)
      ? "Not a valid address"
      : newAuthority === authority
        ? "That's the current update authority"
        : authorityMultisig.isPending
          ? "Checking the address"
          : authorityMultisig.data
            ? "That's a Squads multisig account, not its vault"
            : null;
  const creatorError = !checkCreator
    ? null
    : !creatorInput
      ? "Enter the new creator"
      : !isPublicKey(creatorInput)
        ? "Not a valid address"
        : creatorMultisig.isPending
          ? "Checking the address"
          : creatorMultisig.data
            ? "That's a Squads multisig account, not its vault"
            : null;
  const settingsValid = !authorityError && !creatorError && !!authority;

  const plans = useMemo<TransferPlan[] | null>(() => {
    if (!metadata.data || !settingsValid) return null;
    return checked.map((mint) =>
      planTransfer(mint, metadata.data.get(mint) ?? null, {
        wallet: authority,
        newAuthority,
        newCreator,
        creatorMode,
      }),
    );
  }, [
    metadata.data,
    checked,
    settingsValid,
    authority,
    newAuthority,
    newCreator,
    creatorMode,
  ]);

  const batches = useMemo(() => {
    if (!plans || !authority) return [];
    const ready = plans.filter((p): p is ReadyTransfer => p.status === "ready");
    return packBatches(
      ready.map((plan) => ({
        mint: plan.mint,
        instruction: transferInstruction(umi, plan, authority, newAuthority),
      })),
      new PublicKey(authority),
      mode === "squads"
        ? { maxPerTransaction: MAX_TRANSFERS_PER_SQUADS_TRANSACTION }
        : undefined,
    );
  }, [plans, authority, umi, newAuthority, mode]);

  const readyCount = batches.reduce((sum, b) => sum + b.mints.length, 0);
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

  const setBusyState = (value: boolean) => {
    setBusy(value);
    onBusyChange(value);
  };

  return (
    <div className="space-y-6">
      <SignerModePicker
        name="transfer-mode"
        legend="Who signs the transfer"
        value={mode}
        onChange={setMode}
        options={SIGNER_MODES}
        disabled={busy}
      />

      {mode === "squads" && (
        <SquadsMultisigField
          id="transfer-squads-multisig"
          value={multisigAddress}
          onChange={setMultisigAddress}
          error={multisigError}
          vault={multisig?.vault}
          hint="Its first vault must be the NFTs' current update authority."
          disabled={busy}
        />
      )}

      <div>
        <Label htmlFor="new-authority">New update authority</Label>
        <p className="text-xs text-gray-500">
          For a Squads multisig, use its vault address, not the multisig
          account.
        </p>
        <AddressInput
          id="new-authority"
          value={newAuthority}
          onChange={setNewAuthority}
          disabled={busy}
          error={newAuthority ? authorityError : null}
          multisigVault={authorityMultisig.data?.vault}
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Creators</legend>
        <div className="mt-2 space-y-2">
          {CREATOR_MODES.map((mode) => (
            <label key={mode.value} className="flex gap-3 text-sm">
              <input
                type="radio"
                name="creator-mode"
                value={mode.value}
                checked={creatorMode === mode.value}
                onChange={() => setCreatorMode(mode.value)}
                disabled={busy}
                className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-medium text-gray-900">{mode.label}</span>
                <span className="block text-gray-500">{mode.description}</span>
              </span>
            </label>
          ))}
        </div>

        {creatorMode !== "keep" && (
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sameCreator}
                onChange={(e) => setSameCreator(e.target.checked)}
                disabled={busy}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              New creator is the new update authority
            </label>
            {!sameCreator && (
              <div>
                <Label htmlFor="new-creator">New creator</Label>
                <AddressInput
                  id="new-creator"
                  value={creatorInput}
                  onChange={setCreatorInput}
                  disabled={busy}
                  error={creatorInput ? creatorError : null}
                  multisigVault={creatorMultisig.data?.vault}
                />
              </div>
            )}
            <p className="text-xs text-gray-500">
              The new creator is added unverified. To verify it, they connect
              their wallet in step 2.
            </p>
          </div>
        )}
      </fieldset>

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
            busy ||
            metadata.isFetching ||
            mints.length === 0 ||
            (mode === "squads" && !authority)
          }
        >
          {metadata.isFetching && (
            <SpinnerIcon className="mr-1 -ml-1 size-4 animate-spin" />
          )}
          {mode === "wallet" && !publicKey
            ? "Connect your wallet"
            : `Check ${mints.length} ${mints.length === 1 ? "NFT" : "NFTs"}`}
        </Button>
      </div>

      {metadata.error && (
        <p className="text-sm text-red-700">
          Couldn&apos;t load the NFTs: {metadata.error.message}
        </p>
      )}

      {checked.length > 0 && metadata.data && !settingsValid && (
        <p className="text-sm text-gray-500">
          {authorityError ??
            creatorError ??
            (mode === "wallet" ? "Connect your wallet" : multisigError)}{" "}
          to see what will change.
        </p>
      )}

      {plans && (
        <div className="border-t border-gray-200 pt-6">
          <NftTable
            rows={plans}
            readyLabel="Will transfer"
            doneLabel="Already transferred"
          />

          {readyCount > 0 && (
            <label className="mt-6 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={busy}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                I checked that{" "}
                <span className="font-mono text-xs break-all">
                  {newAuthority}
                </span>{" "}
                is the right address. Once the transfer goes through, the
                current update authority can&apos;t update these NFTs anymore.
              </span>
            </label>
          )}

          {mode === "wallet" ? (
            <SendPanel
              action="Transfer"
              disabled={!acknowledged || metadata.isFetching}
              batches={batches}
              onBusyChange={setBusyState}
              onSettled={() => void metadata.refetch()}
            />
          ) : (
            multisig && (
              <SquadsPanel
                batches={batches}
                multisig={multisig}
                disabled={!acknowledged || metadata.isFetching}
                onBusyChange={setBusyState}
                onSettled={() => void metadata.refetch()}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
