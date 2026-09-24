import { compress, isPublicKey } from "@/lib/solana/common";
import { useDasApi } from "@/state/queries/das";
import { lookupMint } from "@/state/queries/use-reclaimable-accounts";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { CollapsibleTable } from "./collapsible-table";
import type { MintLookup, ReclaimableAccount } from "./types";

type Props = {
  owner: string;
  mints: ReclaimableAccount[];
  selectedIds: Set<string>;
  reclaimedIds: Set<string>;
  onAdd: (mint: ReclaimableAccount) => void;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
};

export function MintPanel({
  owner,
  mints,
  selectedIds,
  reclaimedIds,
  onAdd,
  onToggle,
  onToggleAll,
}: Props) {
  const { connection } = useConnection();
  const { url } = useDasApi();
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: (mint: string) => lookupMint(connection, url, mint, owner),
    onSuccess: (result) => {
      if (result.status === "ok") {
        onAdd(result.account);
        setAddress("");
      } else {
        setError(describe(result));
      }
    },
    onError: () =>
      setError("Couldn't load that account. Check the address and try again."),
  });

  const submit = () => {
    const trimmed = address.trim();
    setError(null);
    if (!isPublicKey(trimmed)) {
      setError("That isn't a Solana address. Paste the mint address in full.");
      return;
    }
    if (mints.some((m) => m.address === trimmed)) {
      setError("That mint is already in the list.");
      return;
    }
    check.mutate(trimmed);
  };

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-zinc-600">
        Mints hold rent too, and only the mint authority can take it back.
        {mints.length > 0
          ? " These are the mints you control among the tokens in your wallet."
          : " None of the tokens in your wallet have a mint you control."}{" "}
        A mint you control but hold no tokens of can be added by address.
      </p>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
          className="grow rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
        />
        <Button
          type="submit"
          outline
          disabled={check.isPending || !address.trim()}
        >
          {check.isPending && <SpinnerIcon className="size-4 animate-spin" />}
          {check.isPending ? "Checking" : "Add mint"}
        </Button>
      </form>

      {error && (
        <p id="mint-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {mints.length > 0 && (
        <CollapsibleTable
          noun="mints"
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

function describe(result: Exclude<MintLookup, { status: "ok" }>) {
  switch (result.status) {
    case "not-found":
      return "There is no account at that address.";
    case "not-a-mint":
      return "That address isn't a token mint. Token accounts are found on their own, above.";
    case "other-authority":
      return `Only the mint authority can reclaim from ${result.name}, and that is ${compress(result.authority, 4)}, not your wallet.`;
    case "no-authority":
      return `${result.name} has no mint authority any more. Reclaiming would need the mint's own keypair, which a wallet can't provide.`;
  }
}
