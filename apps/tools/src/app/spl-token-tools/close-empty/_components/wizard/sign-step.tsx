import { notify } from "@/components/notification";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { chunk } from "@/lib/utils";
import type { ParsedTokenAccount } from "@/state/queries/use-owner-assets";
import { Dialog } from "@headlessui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCOUNTS_PER_TRANSACTION,
  closeAccountInstruction,
  useCloseAccountsStore,
} from "./wizard-context";

export const SignStep = () => {
  const promptShown = useRef(false);
  const { client } = useKitClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const accountsToClose = useCloseAccountsStore(
    (store) => store.simulatedAccounts,
  );
  const goToStepThree = useCloseAccountsStore((store) => store.goToStepThree);

  const handleSendTransaction = useCallback(async () => {
    if (!client) return;
    const closedAccounts: ParsedTokenAccount[] = [];

    setIsConfirming(true);
    try {
      // One transaction per chunk, in order; each needs a wallet approval.
      for (const batch of chunk(accountsToClose, ACCOUNTS_PER_TRANSACTION)) {
        const result = await client.sendTransaction(
          batch.map((acc) => closeAccountInstruction(acc, client.payer)),
        );
        notify({
          type: "success",
          title: "Transaction confirmed",
          txid: result.context.signature,
        });
        closedAccounts.push(...batch);
      }

      goToStepThree(closedAccounts, null);
    } catch (err) {
      const errorMessage = transactionErrorMessage(err);
      notify({
        type: "error",
        title: "Transaction error",
        description: errorMessage,
      });
      goToStepThree(closedAccounts, errorMessage);
    } finally {
      setIsConfirming(false);
    }
  }, [accountsToClose, client, goToStepThree]);

  useEffect(() => {
    if (!client || promptShown.current) return;
    promptShown.current = true;
    void handleSendTransaction();
  }, [client, handleSendTransaction]);

  return (
    <>
      <Dialog.Description className="space-y-1 text-zinc-500">
        <span className="block">
          Confirm the transactions in your wallet. The transactions will close{" "}
          <strong className="text-blue-500">{accountsToClose.length}</strong>{" "}
          accounts.
        </span>
        <span className="block">
          Expected balance change:{" "}
          <strong className="text-green-600">
            &uarr; {accountsToClose.length * 0.0020342} SOL
          </strong>
        </span>
        {isConfirming && <Loader />}
      </Dialog.Description>
    </>
  );
};

const Loader = () => {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev + 1) % 16);
    }, 1000);

    return () => {
      clearInterval(id);
      setDots(0);
    };
  }, []);

  return (
    <span className="mt-auto block text-zinc-500">
      <span>Confirming transaction(s) </span>
      <span className="text-xl font-semibold text-blue-500">
        {new Array(dots).fill(".").join("")}
      </span>
    </span>
  );
};
