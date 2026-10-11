import { notify } from "@/components";
import { errorMessage } from "@/lib/solana/send-batches";
import { retryWithBackoff } from "@/lib/utils";
import { Button, CopyButton, SpinnerIcon } from "@blastctrl/ui";
import { ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { serializeForSquads } from "./squads";
import type { Batch } from "./transactions";

type Props = {
  /** The NFTs that are ready, packed for Squads. */
  batches: Batch[];
  vault: string;
};

/**
 * Builds the verifications as unsigned transactions for the vault to sign
 * through Squads, instead of sending them from a connected wallet.
 */
export function SquadsExportPanel({ batches, vault }: Props) {
  const { connection } = useConnection();
  const [built, setBuilt] = useState<{
    batches: Batch[];
    transactions: string[];
  } | null>(null);
  const [building, setBuilding] = useState(false);

  // A rebuild is needed whenever the batches change, e.g. after a check.
  const transactions = built?.batches === batches ? built.transactions : null;
  const ready = batches.reduce((sum, b) => sum + b.mints.length, 0);

  const build = async () => {
    setBuilding(true);
    try {
      // Squads keeps only the instructions, but a real blockhash keeps the
      // transactions valid for anything that inspects them on the way.
      const lifetime = await retryWithBackoff(() =>
        connection.getLatestBlockhash("confirmed"),
      );
      const signer = new PublicKey(vault);
      setBuilt({
        batches,
        transactions: batches.map((b) =>
          serializeForSquads(b, signer, lifetime),
        ),
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Couldn't build the transactions",
        description: errorMessage(err),
      });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {ready === 0
            ? "Nothing left to verify."
            : `${ready} ${ready === 1 ? "NFT" : "NFTs"} in ${batches.length} ${batches.length === 1 ? "transaction" : "transactions"} for Squads.`}
        </p>
        <Button
          color="indigo"
          disabled={ready === 0 || building}
          onClick={build}
        >
          {building && (
            <SpinnerIcon className="mr-2 -ml-1 size-5 animate-spin" />
          )}
          Build transactions
        </Button>
      </div>

      {transactions && (
        <>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
            <li>
              In the Squads app, open the transaction builder and add an
              instruction by importing from base58.
            </li>
            <li>
              Paste one transaction from below, then create the proposal. Make
              one proposal per transaction: together they would run out of
              compute when executed.
            </li>
            <li>
              Once the proposals are approved and executed, click Check again to
              see which NFTs are verified.
            </li>
          </ol>
          <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
            {transactions.map((transaction, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0 font-medium text-gray-900">
                  Transaction {i + 1}
                  <span className="ml-2 font-normal text-gray-500">
                    {batches[i]!.mints.length}{" "}
                    {batches[i]!.mints.length === 1 ? "NFT" : "NFTs"}
                  </span>
                </span>
                <span className="min-w-0 grow truncate font-mono text-xs text-gray-400">
                  {transaction}
                </span>
                <CopyButton
                  clipboard={transaction}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {({ copied }) => (
                    <>
                      <ClipboardDocumentIcon className="size-4 text-gray-500" />
                      {copied ? "Copied!" : "Copy"}
                    </>
                  )}
                </CopyButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
