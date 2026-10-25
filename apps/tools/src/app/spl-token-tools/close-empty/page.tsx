"use client";

import { notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useOwnerAssets } from "@/state/queries/use-owner-assets";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { getCreateAssociatedTokenIdempotentInstructionAsync } from "@solana-program/token";
import { useConnector } from "@solana/connector/react";
import { address } from "@solana/kit";
import { AccountList } from "./_components/account-list";

export default function CloseEmpty() {
  const { isConnected, account } = useConnector();
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const { data, isFetching, refetch } = useOwnerAssets(account ?? "");

  const handleLoad = async () => {
    if (!isConnected) {
      setOpen(true);
      return;
    }
    void refetch();
  };

  /** Dev only: create a few empty token accounts to have something to close. */
  const handleCreateAccounts = async () => {
    if (!client) return;
    const mints = [
      "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
      "C8yhZZpzz2rZ4XfGkikou7JksaL1UZj6DndZVudebno4",
      "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",
      "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      "4LLbsb5ReP3yEtYzmXewyGjcir5uXtKFURtaEUVC2AHs",
      "3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o",
    ];

    try {
      const instructions = await Promise.all(
        mints.map((mint) =>
          getCreateAssociatedTokenIdempotentInstructionAsync({
            payer: client.payer,
            owner: client.payer.address,
            mint: address(mint),
          }),
        ),
      );
      const result = await client.sendTransaction(instructions);
      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: result.context.signature,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Transaction error",
        description: transactionErrorMessage(error),
      });
    }
  };

  const buttonText = () => {
    if (!isConnected) return "Connect your wallet";
    if (isFetching)
      return (
        <>
          <SpinnerIcon className="mr-2 -ml-1 size-5 animate-spin" />
          Loading
        </>
      );

    return "I understand, show my token accounts";
  };

  return (
    <div
      className={cn(
        "mx-auto w-[min(100%,var(--breakpoint-md))] overflow-visible bg-white px-4 pb-5 sm:rounded-lg sm:p-6 sm:shadow-sm",
        !!data && "pb-0!",
      )}
    >
      <h1 className="mb-4 font-display text-3xl font-semibold">
        Close Empty Token Accounts
      </h1>
      {!data && (
        <>
          <div className="space-y-2 text-gray-500">
            <p className="text-pretty">
              You can use this tool to list empty token accounts in your wallet
              and close them, to recover SOL that was used to create them. Some
              token accounts (frozen) cannot be closed, so those won&apos;t be
              displayed.
            </p>
            <p className="text-balance">
              While token accounts can be recreated after you close them, this
              is still a destructive action and could have unexpected
              consequences, so you should be aware of that before proceeding.
            </p>
            <p>Each token account can recover 0.0020342 SOL.</p>
          </div>

          <div className="flex flex-col items-center justify-center gap-2 pt-8 pb-2">
            <Button
              color="indigo"
              type="button"
              onClick={handleLoad}
              disabled={isFetching}
            >
              {buttonText()}
            </Button>
            {process.env.NODE_ENV === "development" && (
              <Button onClick={handleCreateAccounts} disabled={!client}>
                DEV: create token accounts
              </Button>
            )}
          </div>
        </>
      )}

      {data && (
        <AccountList tokenAccounts={data.filter((a) => a.balance === 0n)} />
      )}
    </div>
  );
}
