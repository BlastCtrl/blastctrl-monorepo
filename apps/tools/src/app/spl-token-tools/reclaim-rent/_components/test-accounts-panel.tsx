import { notify } from "@/components/notification";
import {
  kitBatchSender,
  sendBatches,
  type BatchResult,
} from "@/connector/send-batches";
import { useKitClient } from "@/connector/use-kit-client";
import { solBalanceKey } from "@/state/queries/use-sol-balance";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { useCluster } from "@solana/connector/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
} from "./rent";
import { buildTestAccountInstructions, demoMintsFor } from "./test-accounts";
import { useRentRate } from "@/state/queries/use-rent";

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Gives the wallet an empty token account for each demo mint, holding as
 * much excess as an account opened at the original rent, so the tool has
 * something to reclaim again. Shown in development and, for everyone, on
 * devnet; see showsTestAccountsPanel. The × hides it until the next page
 * load.
 */
export function TestAccountsPanel() {
  const { client } = useKitClient();
  const { type: cluster } = useCluster();
  const queryClient = useQueryClient();
  const { lamportsPerByte } = useRentRate();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const excess =
    minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE) -
    minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte);
  const mints = demoMintsFor(cluster);

  if (hidden) return null;

  const create = async () => {
    if (!client) {
      notify({ type: "error", title: "Connect a wallet first" });
      return;
    }
    if (!mints) {
      notify({
        type: "error",
        title: "Couldn't create test accounts",
        description:
          "There are no demo mints on this network. Switch to mainnet or devnet and try again.",
      });
      return;
    }
    setBusy(true);
    try {
      const groups = await buildTestAccountInstructions(
        mints,
        client.payer,
        excess,
      );
      const batches = groups.map((instructions, index) => ({
        index,
        instructions,
      }));
      // One wallet prompt where the wallet allows it; a wallet that asks per
      // transaction stops at the first refusal, which lands in the catch.
      const results: BatchResult[] = [];
      await sendBatches(
        batches,
        {
          sender: kitBatchSender(client),
          build: (batch) => batch.instructions,
        },
        { onBatchResult: (result) => results.push(result) },
      );

      results.forEach((result) => {
        if (result.status === "failed") {
          notify({
            type: "error",
            title: `Test transaction ${result.index + 1} of ${batches.length} failed`,
            description: result.error,
          });
        }
      });
      const confirmed = results
        .filter(
          (r): r is Extract<BatchResult, { status: "confirmed" }> =>
            r.status === "confirmed",
        )
        .sort((a, b) => a.index - b.index);
      if (confirmed.length > 0) {
        const accounts = confirmed.reduce(
          (n, c) => n + groups[c.index]!.length / 2,
          0,
        );
        notify({
          type: "success",
          title: "Test accounts ready",
          description: `${accounts} token accounts, each with ${formatSol(excess)} SOL of excess. Check again to see them.`,
          txid: confirmed.at(-1)!.signature,
        });
      }
    } catch (err) {
      notify({
        type: "error",
        title: "Couldn't create test accounts",
        description: message(err),
      });
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({
        queryKey: solBalanceKey(client.payer.address),
      });
    }
  };

  return (
    <aside
      aria-label="Development tools"
      className="mx-auto mt-6 w-[min(100%,var(--breakpoint-lg))] px-4 sm:px-0"
    >
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 rounded-lg border-2 border-dashed border-zinc-300 bg-white/60 py-4 pr-12 pl-5">
        <div className="min-w-0 grow basis-72">
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-amber-800 uppercase">
              Dev
            </span>
            <h2 className="text-sm font-semibold text-zinc-900">
              Test accounts
            </h2>
          </div>
          <p className="mt-1.5 max-w-prose text-sm text-pretty text-zinc-500">
            {mints
              ? `Opens an empty token account for each of the ${mints.length} demo mints and adds ${formatSol(excess)} SOL of excess to each. Accounts that already exist only get the excess.`
              : "There are no demo mints on this network. Switch to mainnet or devnet."}
          </p>
        </div>
        <Button outline disabled={busy || !mints} onClick={() => void create()}>
          {busy && <SpinnerIcon className="size-4 animate-spin" />}
          {busy ? "Creating…" : "Create test accounts"}
        </Button>
        <button
          type="button"
          aria-label="Hide until the page reloads"
          onClick={() => setHidden(true)}
          className="absolute top-2 right-2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <XMarkIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
    </aside>
  );
}
