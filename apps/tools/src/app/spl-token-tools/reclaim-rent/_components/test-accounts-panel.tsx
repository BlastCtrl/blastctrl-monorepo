import { notify } from "@/components/notification";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
} from "./rent";
import { buildTestAccountTransactions, demoMintsFor } from "./test-accounts";
import { useRentRate } from "./use-rent-rate";

const SEND_OPTIONS = { preflightCommitment: "confirmed" } as const;

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Development only: gives the wallet an empty token account for each demo
 * mint, holding as much excess as an account opened at the original rent,
 * so the tool has something to reclaim again. The × hides it until the
 * next page load.
 */
export function TestAccountsPanel() {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const network = useNetworkConfigurationStore((state) => state.network);
  const { lamportsPerByte } = useRentRate();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const excess =
    minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE) -
    minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte);
  const mints = demoMintsFor(network);

  if (hidden) return null;

  const create = async () => {
    if (!publicKey) {
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
      const lifetime = await connection.getLatestBlockhash("confirmed");
      const txs = buildTestAccountTransactions(
        mints,
        publicKey,
        lifetime,
        excess,
      );
      const confirm = async (signature: string) => {
        const { value } = await connection.confirmTransaction(
          { signature, ...lifetime },
          "confirmed",
        );
        if (value.err) throw Error(JSON.stringify(value.err));
        return signature;
      };

      const outcomes: PromiseSettledResult<string>[] = [];
      if (signAllTransactions) {
        const signed = await signAllTransactions(txs);
        outcomes.push(
          ...(await Promise.allSettled(
            signed.map((tx) =>
              connection
                .sendRawTransaction(tx.serialize(), SEND_OPTIONS)
                .then(confirm),
            ),
          )),
        );
      } else {
        // These wallets ask once per transaction; stop at the first refusal.
        for (const tx of txs) {
          const [outcome] = await Promise.allSettled([
            sendTransaction(tx, connection, SEND_OPTIONS).then(confirm),
          ]);
          outcomes.push(outcome!);
          if (outcome!.status === "rejected") break;
        }
      }

      outcomes.forEach((outcome, i) => {
        if (outcome.status === "rejected") {
          notify({
            type: "error",
            title: `Test transaction ${i + 1} of ${txs.length} failed`,
            description: message(outcome.reason),
          });
        }
      });
      const confirmed = outcomes.flatMap((outcome, i) =>
        outcome.status === "fulfilled"
          ? [
              {
                signature: outcome.value,
                accounts: txs[i]!.instructions.length / 2,
              },
            ]
          : [],
      );
      if (confirmed.length > 0) {
        const accounts = confirmed.reduce((n, c) => n + c.accounts, 0);
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
        queryKey: ["sol-balance", publicKey.toString()],
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
