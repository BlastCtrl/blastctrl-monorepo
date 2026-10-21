import { notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { compress } from "@/lib/solana";
import { normalizeTokenAmount } from "@/lib/solana/common";
import { SpinnerIcon } from "@blastctrl/ui";
import { Tooltip } from "@blastctrl/ui/tooltip";
import { ChevronRightIcon, WalletIcon } from "@heroicons/react/20/solid";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/solid";
import { fetchMint } from "@solana-program/token";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import {
  recoverNestedInstructions,
  type NestedPair,
  type TokenAccount,
} from "../_utils";

type NestedListProps = {
  nestedTokenAccounts?: NestedPair[];
  setNestedTokenAccounts: Dispatch<SetStateAction<NestedPair[]>>;
};

export const NestedList = ({
  nestedTokenAccounts,
  setNestedTokenAccounts,
}: NestedListProps) => {
  if (!nestedTokenAccounts || nestedTokenAccounts?.length === 0) {
    return (
      <div className="pt-4 pb-1 font-normal">No nested accounts found ✔</div>
    );
  }

  const singleOrMany = nestedTokenAccounts.length === 1;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4 pb-1">
      <h3 className="text-center font-medium text-indigo-600">
        {nestedTokenAccounts.length} nested token account
        {singleOrMany ? "" : "s"} found.
      </h3>

      <ul className="mt-4 w-full space-y-4">
        {nestedTokenAccounts.map((pair, idx) => (
          <li key={pair.nested.address}>
            <NestedInfo
              {...pair}
              idx={idx}
              setNestedTokenAccounts={setNestedTokenAccounts}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export const NestedInfo = ({
  parent,
  nested,
  recoverable,
  idx,
  setNestedTokenAccounts,
}: NestedPair & {
  idx: number;
  setNestedTokenAccounts: Dispatch<SetStateAction<NestedPair[]>>;
}) => {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const [confirming, setConfirming] = useState(false);

  const handleRecover = async () => {
    if (!client) {
      setOpen(true);
      return;
    }

    setConfirming(true);
    try {
      const { decimals } = (await fetchMint(client.rpc, nested.data.mint)).data;

      const result = await client.sendTransaction(
        await recoverNestedInstructions(client.payer, parent, nested),
      );
      notify({
        type: "success",
        title: "Recover nested success",
        description: (
          <>
            Successfully recovered{" "}
            <span className="font-medium text-blue-300">
              {normalizeTokenAmount(nested.data.amount.toString(), decimals)}
            </span>{" "}
            tokens.
          </>
        ),
        txid: result.context.signature,
      });
      setNestedTokenAccounts((prev) => prev.filter((_, i) => i !== idx));
    } catch (error) {
      notify({
        type: "error",
        title: "Error recovering nested account",
        description: (
          <span className="break-all">{transactionErrorMessage(error)}</span>
        ),
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
      <div className="px-4 py-5 sm:p-6">
        <div className="grid gap-y-4 xs:grid-cols-2">
          {([parent, nested] as TokenAccount[]).map((account, idx) => {
            return (
              <div key={idx} className="flex">
                <div className="mt-2 mr-4 shrink-0 self-start">
                  <QuestionMarkCircleIcon className="h-10 w-10 rounded-full text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold tracking-wider text-gray-700 uppercase">
                    {idx === 0 ? "Parent" : "Nested"}
                  </h4>
                  <p className="font-mono leading-5 font-medium tracking-tighter text-gray-700">
                    {compress(account.data.mint, 6)}
                  </p>
                  <p className="font-mono leading-5 font-medium tracking-tighter text-gray-500">
                    {compress(account.address, 6)}
                  </p>
                  <div className="mt-2 inline-flex w-full items-center justify-end">
                    <WalletIcon className="mr-1 h-3 w-3 text-gray-500" />
                    <span className="font-mono text-gray-900 underline">
                      {/* Raw units: the mint's decimals aren't looked up yet. */}
                      {account.data.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end bg-gray-50 px-4 py-2 sm:px-6">
        {recoverable ? (
          <button
            type="button"
            onClick={handleRecover}
            disabled={confirming}
            className="inline-flex items-center rounded-full border border-transparent bg-green-600 px-3 py-0.5 text-sm text-white hover:bg-green-700 disabled:bg-green-700"
          >
            {confirming ? (
              <>
                <SpinnerIcon className="mr-1 ml-1 h-5 w-5 animate-spin text-white" />
                Confirming
              </>
            ) : (
              <>
                Recover
                <Tooltip
                  content="The
          nested account will be deleted and its tokens will be transferred to your ATA of the same
          mint as the nested account, while the rent will be transferred to your wallet."
                >
                  <QuestionMarkCircleIcon className="ml-1 size-5 text-white hover:cursor-pointer" />
                </Tooltip>
                <ChevronRightIcon className="-mr-2 ml-1 size-5" />
              </>
            )}
          </button>
        ) : (
          <div className="inline-flex items-center">
            😥 Unrecoverable
            <Tooltip
              content={
                "Only a nested associated token account of the same token program as its parent can be recovered. Regular token accounts, and a Token-2022 account nested in a Token account (or the other way round), can't be."
              }
            >
              <QuestionMarkCircleIcon className="ml-2 size-5 text-gray-400 hover:cursor-pointer" />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};
