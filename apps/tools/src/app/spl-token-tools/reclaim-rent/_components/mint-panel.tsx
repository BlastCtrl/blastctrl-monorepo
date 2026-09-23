import { compress, isPublicKey } from "@/lib/solana/common";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useState } from "react";
import { AccountTable } from "./account-table";
import { EXAMPLE_MINTS, lookupMockMint } from "./mock-data";
import type { ReclaimableAccount } from "./types";

type Props = {
  mints: ReclaimableAccount[];
  selectedIds: Set<string>;
  reclaimedIds: Set<string>;
  onAdd: (mint: ReclaimableAccount) => void;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
};

export function MintPanel({
  mints,
  selectedIds,
  reclaimedIds,
  onAdd,
  onToggle,
  onToggleAll,
}: Props) {
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async (value: string) => {
    const trimmed = value.trim();
    setError(null);
    if (!isPublicKey(trimmed)) {
      setError("That isn't a Solana address. Paste the mint address in full.");
      return;
    }
    if (mints.some((m) => m.address === trimmed)) {
      setError("That mint is already in the list.");
      return;
    }

    setChecking(true);
    await new Promise((r) => setTimeout(r, 900));
    setChecking(false);

    const result = lookupMockMint(trimmed);
    if (result.status === "ok") {
      onAdd(result.account);
      setAddress("");
    } else if (result.status === "not-a-mint") {
      setError(
        "That address isn't a token mint. Token accounts are on the other tab.",
      );
    } else if (result.status === "other-authority") {
      setError(
        `Only the mint authority can reclaim from ${result.name}, and that is ${compress(result.authority, 4)}, not your wallet.`,
      );
    } else {
      setError(
        `${result.name} has no mint authority any more. Reclaiming would need the mint's own keypair, which a wallet can't provide.`,
      );
    }
  };

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-zinc-600">
        Mints hold a deposit too. A wallet can&apos;t list the mints it
        controls, so paste each address. You need to be the mint authority.
      </p>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void check(address);
        }}
      >
        <label htmlFor="mint-address" className="sr-only">
          Mint address
        </label>
        <input
          id="mint-address"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
          placeholder="Mint address"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? "mint-error" : undefined}
          className="form-input grow rounded-lg border-zinc-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
        <Button type="submit" outline disabled={checking || !address.trim()}>
          {checking && <SpinnerIcon className="size-4 animate-spin" />}
          {checking ? "Checking" : "Check mint"}
        </Button>
      </form>

      {error && (
        <p id="mint-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
        <span>Demo addresses:</span>
        {EXAMPLE_MINTS.map((example) => (
          <button
            key={example.address}
            type="button"
            disabled={checking}
            onClick={() => {
              setAddress(example.address);
              void check(example.address);
            }}
            className="text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-700 disabled:opacity-50"
          >
            {example.label}
          </button>
        ))}
      </div>

      {mints.length > 0 && (
        <AccountTable
          accounts={mints}
          selectedIds={selectedIds}
          reclaimedIds={reclaimedIds}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
        />
      )}
    </div>
  );
}
