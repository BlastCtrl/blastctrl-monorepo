import useUmi from "@/lib/hooks/use-umi";
import { isPublicKey } from "@/lib/solana/common";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { AddressInput, Label } from "./address-input";
import { NftTable } from "./nft-table";
import { planVerify } from "./plan";
import { SendPanel } from "./send-panel";
import { MAX_NFTS_PER_SQUADS_TRANSACTION, useSquadsMultisig } from "./squads";
import { SquadsExportPanel } from "./squads-export-panel";
import type { ReadyVerify } from "./transactions";
import { packBatches, verifyInstruction } from "./transactions";
import { useNftMetadata } from "./use-nft-metadata";

/**
 * Who signs the verifications: the connected wallet, or a Squads vault
 * through proposals built from exported transactions.
 */
type Mode = "wallet" | "squads";

const MODES: { value: Mode; label: string; description: string }[] = [
  {
    value: "wallet",
    label: "Sign with the connected wallet",
    description: "The creator's wallet signs and sends the verifications.",
  },
  {
    value: "squads",
    label: "Export for a Squads multisig",
    description:
      "Build the verifications as transactions to import into the Squads app, where the multisig approves and runs them. No wallet connection needed.",
  },
];

type Props = {
  mints: string[];
  onBusyChange: (busy: boolean) => void;
};

export function VerifyStep({ mints, onBusyChange }: Props) {
  const umi = useUmi();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const [mode, setMode] = useState<Mode>("wallet");
  const [vault, setVault] = useState("");
  const vaultMultisig = useSquadsMultisig(vault);
  const [checked, setChecked] = useState<string[]>([]);
  const metadata = useNftMetadata(checked);

  const vaultError = !vault
    ? "Enter the vault address"
    : !isPublicKey(vault)
      ? "Not a valid address"
      : vaultMultisig.isPending
        ? "Checking the address"
        : vaultMultisig.data
          ? "That's a Squads multisig account, not its vault"
          : null;

  /** The creator whose verification gets built, empty until it's known. */
  const creator =
    mode === "wallet" ? (publicKey?.toBase58() ?? "") : vaultError ? "" : vault;

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
        ? { maxPerTransaction: MAX_NFTS_PER_SQUADS_TRANSACTION }
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
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">
          Who verifies
        </legend>
        <div className="mt-2 space-y-2">
          {MODES.map((m) => (
            <label key={m.value} className="flex gap-3 text-sm">
              <input
                type="radio"
                name="verify-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-medium text-gray-900">{m.label}</span>
                <span className="block text-gray-500">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "wallet" ? (
        <p className="text-sm text-gray-500">
          Connect the wallet that was added as a creator in step 1. It signs a
          verification for each NFT; no update authority is needed.
        </p>
      ) : (
        <div>
          <Label htmlFor="squads-vault">Squads vault address</Label>
          <p className="text-xs text-gray-500">
            The vault that was added as a creator in step 1. Squads shows it as
            the address that holds the multisig&apos;s assets.
          </p>
          <AddressInput
            id="squads-vault"
            value={vault}
            onChange={setVault}
            error={vault ? vaultError : null}
            placeholder="Vault address"
            multisigVault={vaultMultisig.data?.vault}
          />
        </div>
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
            <SquadsExportPanel batches={batches} vault={creator} />
          )}
        </div>
      )}
    </div>
  );
}
