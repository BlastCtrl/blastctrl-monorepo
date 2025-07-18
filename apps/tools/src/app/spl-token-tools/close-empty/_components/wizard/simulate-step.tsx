import type { ParsedTokenAccount } from "@/state/queries/use-owner-assets";
import { useWalletConnection } from "@/state/use-wallet-connection";
import { Button } from "@blastctrl/ui/button";
import { Dialog } from "@headlessui/react";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { useState } from "react";
import { useCloseAccountsStore } from "./wizard-context";

const btnSecondary =
  "rounded bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50";

const toPubkey = (address: string) => new PublicKey(address);

export const SimulateStep = () => {
  const { connection } = useConnection();
  const accountsToClose = useCloseAccountsStore(
    (store) => store.initialAccounts,
  );
  const goToStepTwo = useCloseAccountsStore((store) => store.goToStepTwo);
  const closeDialog = useCloseAccountsStore((store) => store.closeDialog);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [result, setResult] = useState<ParsedTokenAccount[]>([]);

  const { wallet } = useWalletConnection();

  const simulateCloseTransactions = async (accounts: ParsedTokenAccount[]) => {
    if (!wallet) return;
    // Create transactions to close accounts
    const { value, context } = await connection.getLatestBlockhashAndContext();

    const transactions = accounts.map((acc) => {
      const messageV0 = new TransactionMessage({
        payerKey: wallet,
        recentBlockhash: value.blockhash,
        instructions: [
          createCloseAccountInstruction(
            toPubkey(acc.token_account),
            wallet,
            wallet,
            [],
            toPubkey(acc.token_program),
          ),
        ],
      }).compileToV0Message();
      return new VersionedTransaction(messageV0);
    });

    const simulationResults = await Promise.allSettled(
      transactions.map((vt) =>
        connection.simulateTransaction(vt, {
          minContextSlot: context.slot,
          commitment: "confirmed",
        }),
      ),
    );

    // TODO: fix types here
    const good: ParsedTokenAccount[] = [];
    for (let i = 0; i < simulationResults.length; i++) {
      const result = simulationResults[i] as any;

      console.log(simulationResults[i]);
      if (result.status === "rejected") continue;
      if (result.value.value.err) continue;
      good.push(accounts[i]!);
    }

    setResult(good);
    setHasSimulated(true);
  };

  // Before simulation
  if (hasSimulated === false) {
    return (
      <>
        <Dialog.Description className="text-pretty text-base text-zinc-500">
          <strong className="text-blue-500">{accountsToClose.length}</strong>{" "}
          token accounts selected. To continue, run the simulation to check
          whether the selected accounts can be succesfully closed.
        </Dialog.Description>
        <div className="mt-auto flex w-full items-center justify-end gap-4">
          <button className={btnSecondary} onClick={closeDialog}>
            Cancel
          </button>
          <Button onClick={() => simulateCloseTransactions(accountsToClose)}>
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

  // Not all succeeded
  const ACCOUNTS_PER_TRANSACTION = 4;
  const transactionCount = Math.ceil(result.length / ACCOUNTS_PER_TRANSACTION);

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
