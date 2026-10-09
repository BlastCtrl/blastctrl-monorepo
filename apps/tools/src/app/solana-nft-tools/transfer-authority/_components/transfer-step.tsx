import { isPublicKey } from "@/lib/solana/common";
import useUmi from "@/lib/hooks/use-umi";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMemo, useState } from "react";
import { NftTable } from "./nft-table";
import type { CreatorMode, TransferPlan } from "./plan";
import { planTransfer } from "./plan";
import { SendPanel } from "./send-panel";
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
    label: "Swap your creator entry",
    description:
      "The new creator takes your wallet's place and share. Other creators stay as they are.",
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

type Props = {
  mints: string[];
  onBusyChange: (busy: boolean) => void;
};

export function TransferStep({ mints, onBusyChange }: Props) {
  const umi = useUmi();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet = publicKey?.toBase58() ?? "";

  const [checked, setChecked] = useState<string[]>([]);
  const [newAuthority, setNewAuthority] = useState("");
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("swap");
  const [sameCreator, setSameCreator] = useState(true);
  const [creatorInput, setCreatorInput] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const metadata = useNftMetadata(checked);
  const newCreator = sameCreator ? newAuthority : creatorInput;

  const authorityError = !newAuthority
    ? "Enter the new update authority"
    : !isPublicKey(newAuthority)
      ? "Not a valid address"
      : newAuthority === wallet
        ? "That's the connected wallet"
        : null;
  const creatorError =
    creatorMode === "keep" || sameCreator
      ? null
      : !creatorInput
        ? "Enter the new creator"
        : !isPublicKey(creatorInput)
          ? "Not a valid address"
          : null;
  const settingsValid = !authorityError && !creatorError && !!wallet;

  const plans = useMemo<TransferPlan[] | null>(() => {
    if (!metadata.data || !settingsValid) return null;
    return checked.map((mint) =>
      planTransfer(mint, metadata.data.get(mint) ?? null, {
        wallet,
        newAuthority,
        newCreator,
        creatorMode,
      }),
    );
  }, [
    metadata.data,
    checked,
    settingsValid,
    wallet,
    newAuthority,
    newCreator,
    creatorMode,
  ]);

  const batches = useMemo(() => {
    if (!plans || !publicKey) return [];
    const ready = plans.filter((p): p is ReadyTransfer => p.status === "ready");
    return packBatches(
      ready.map((plan) => ({
        mint: plan.mint,
        instruction: transferInstruction(umi, plan, wallet, newAuthority),
      })),
      publicKey,
    );
  }, [plans, publicKey, umi, wallet, newAuthority]);

  const readyCount = batches.reduce((sum, b) => sum + b.mints.length, 0);
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

  const setBusyState = (value: boolean) => {
    setBusy(value);
    onBusyChange(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="new-authority">New update authority</Label>
        <AddressInput
          id="new-authority"
          value={newAuthority}
          onChange={setNewAuthority}
          disabled={busy}
          error={newAuthority ? authorityError : null}
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
            busy || metadata.isFetching || (!!publicKey && mints.length === 0)
          }
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

      {checked.length > 0 && metadata.data && !settingsValid && (
        <p className="text-sm text-gray-500">
          {authorityError ?? creatorError ?? "Connect your wallet"} to see what
          will change.
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
                is the right address. Once the transfer goes through, this
                wallet can&apos;t update these NFTs anymore.
              </span>
            </label>
          )}

          <SendPanel
            action="Transfer"
            disabled={!acknowledged || metadata.isFetching}
            batches={batches}
            onBusyChange={setBusyState}
            onSettled={() => void metadata.refetch()}
          />
        </div>
      )}
    </div>
  );
}

export function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
      {children}
    </label>
  );
}

function AddressInput({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error: string | null;
}) {
  return (
    <>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        placeholder="Wallet address"
        className={cn(
          "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-50",
          error && "border-red-300 text-red-900",
        )}
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </>
  );
}
