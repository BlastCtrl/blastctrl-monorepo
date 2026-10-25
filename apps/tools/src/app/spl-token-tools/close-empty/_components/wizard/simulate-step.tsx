import { simulateUnsigned } from "@/connector/simulate";
import { useKitClient } from "@/connector/use-kit-client";
import type { ParsedTokenAccount } from "@/state/queries/use-owner-assets";
import { Button } from "@blastctrl/ui/button";
import { Dialog } from "@headlessui/react";
import { useState } from "react";
import {
  ACCOUNTS_PER_TRANSACTION,
  closeAccountInstruction,
  useCloseAccountsStore,
} from "./wizard-context";

const btnSecondary =
  "rounded-sm bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50";

export const SimulateStep = () => {
  const { client } = useKitClient();
  const accountsToClose = useCloseAccountsStore(
    (store) => store.initialAccounts,
  );
  const goToStepTwo = useCloseAccountsStore((store) => store.goToStepTwo);
  const closeDialog = useCloseAccountsStore((store) => store.closeDialog);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [result, setResult] = useState<ParsedTokenAccount[]>([]);

  /** Simulates closing each account on its own, keeping the ones that succeed. */
  const simulateCloseTransactions = async (accounts: ParsedTokenAccount[]) => {
    if (!client) return;

    const simulations = await Promise.allSettled(
      accounts.map((acc) =>
        simulateUnsigned(client, [closeAccountInstruction(acc, client.payer)]),
      ),
    );

    const good: ParsedTokenAccount[] = [];
    simulations.forEach((simulation, i) => {
      if (simulation.status === "rejected") {
        console.log(simulation.reason);
        return;
      }
      if (simulation.value.err) {
        console.log(simulation.value.err, simulation.value.logs);
        return;
      }
      good.push(accounts[i]!);
    });

    setResult(good);
    setHasSimulated(true);
  };

  // Before simulation
  if (hasSimulated === false) {
    return (
      <>
        <Dialog.Description className="text-base text-pretty text-zinc-500">
          <strong className="text-blue-500">{accountsToClose.length}</strong>{" "}
          token accounts selected. To continue, run the simulation to check
          whether the selected accounts can be succesfully closed.
        </Dialog.Description>
        <div className="mt-auto flex w-full items-center justify-end gap-4">
          <button className={btnSecondary} onClick={closeDialog}>
            Cancel
          </button>
          <Button
            disabled={!client}
            onClick={() => simulateCloseTransactions(accountsToClose)}
          >
            Simulate
          </Button>
        </div>
      </>
    );
  }

  // After simulation

  // Nothing succeeded
  if (result.length === 0) {
    return (
      <>
        <Dialog.Description className="text-zinc-500">
          Simulation failed for all accounts, click the button below to go back.
        </Dialog.Description>
        <div className="mt-auto flex w-full items-center justify-end">
          <button className={btnSecondary} onClick={closeDialog}>
            Return
          </button>
        </div>
      </>
    );
  }

  const transactionCount = Math.ceil(result.length / ACCOUNTS_PER_TRANSACTION);

  // Not all succeeded
  if (result.length > 0 && result.length < accountsToClose.length) {
    const failed = accountsToClose.length - result.length;
    return (
      <>
        <Dialog.Description className="text-zinc-500">
          Simulation failed for{" "}
          <strong className="text-red-600">{failed}</strong> accounts. The
          remaining <strong className="text-blue-500">{result.length}</strong>{" "}
          accounts can be closed. When you continue, you will need to confirm{" "}
          {transactionCount} transaction
          {transactionCount > 1 ? "s" : ""} with your wallet
        </Dialog.Description>
        <div className="mt-auto flex w-full items-center justify-end gap-4">
          <button className={btnSecondary} onClick={closeDialog}>
            Cancel
          </button>
          <button
            className={btnSecondary}
            onClick={() => simulateCloseTransactions(accountsToClose)}
          >
            Retry Simulation
          </button>
          <Button onClick={() => goToStepTwo(result)}>
            Submit transactions
          </Button>
        </div>
      </>
    );
  }

  // All suceeded
  return (
    <>
      <Dialog.Description className="text-zinc-500">
        All simulations succeeded!{" "}
        <strong className="text-blue-500">{result.length}</strong> accounts can
        be closed. When you continue, you will need to confirm{" "}
        {transactionCount} transaction{transactionCount > 1 ? "s" : ""} with
        your wallet.
      </Dialog.Description>
      <div className="mt-auto flex w-full items-center justify-end gap-4">
        <button className={btnSecondary} onClick={closeDialog}>
          Cancel
        </button>
        <Button onClick={() => goToStepTwo(result)}>Submit transactions</Button>
      </div>
    </>
  );
};
