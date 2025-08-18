"use client";

import { useDelegatedAssets } from "@/state/queries/use-delegated-assets";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AccountList } from "./_components";
import { retryWithBackoff } from "@/lib/utils";
import { createApproveInstruction } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { notify } from "@/components";

export default function RevokeDelegations() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { data, isFetching, refetch } = useDelegatedAssets(
    publicKey?.toString() ?? "",
  );

  const handleDelegateAccount = async () => {
    if (!publicKey || !sendTransaction) return;
    const { value } = await retryWithBackoff(() =>
      connection.getLatestBlockhashAndContext({ commitment: "confirmed" }),
    );
    const token = new PublicKey("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
    const tokenAccount = new PublicKey(
      "D59omT4FmyyGnegtLCCBNCjNAh7vAWJHn14Ux1faN7Ha",
    );
    const delegate = new PublicKey(
      "AuKct4JHSMhftUHZHmkiSLUAC7uevUdJjhvUhSpTitJC",
    );
    const tx = new Transaction().add(
      createApproveInstruction(tokenAccount, delegate, publicKey, 25 * 1e8),
    );

    (tx.recentBlockhash = value.blockhash), (tx.feePayer = publicKey);
    const signature = await sendTransaction(tx, connection, {
      preflightCommitment: "confirmed",
      skipPreflight: true,
      maxRetries: 0,
    });
    await connection.confirmTransaction({
      blockhash: value.blockhash,
      lastValidBlockHeight: value.lastValidBlockHeight,
      signature,
    });

    notify({
      type: "success",
      title: "Transaction confirmed",
      txid: signature,
    });
  };

  const handleLoad = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    void refetch();
  };

  const buttonText = () => {
    if (!connected) return "Connect your wallet";
    if (isFetching)
      return (
        <>
          <SpinnerIcon className="-ml-1 mr-2 size-5 animate-spin" />
          Loading
        </>
      );

    return "I understand, show my delegated token accounts";
  };

  return (
    <div
      className={cn(
        "mx-auto w-[min(100%,theme(screens.md))] overflow-visible bg-white px-4 pb-5 sm:rounded-lg sm:p-6 sm:shadow",
        !!data && "!pb-0",
      )}
    >
      <h1 className="font-display mb-4 text-3xl font-semibold">
        Revoke Token Delegations
      </h1>
      {!data && (
        <>
          <div className="space-y-2 text-gray-500">
            <p className="text-pretty">
              You can use this tool to list token accounts in your wallet that
              have been delegated to other addresses and revoke those
              delegations to regain full control of your tokens.
            </p>
            <p className="text-balance">
              When you delegate tokens, you give another address permission to
              spend a specific amount of your tokens. Revoking delegations
              removes this permission and ensures only you can control your
              tokens.
            </p>
            <p>
              Review your delegated accounts carefully before revoking, as some
              delegations may be required for DeFi protocols or other services
              you&apos;re using.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-2 pb-2 pt-8">
            <Button
              color="indigo"
              type="button"
              onClick={handleLoad}
              disabled={isFetching}
            >
              {buttonText()}
            </Button>
            {process.env.NODE_ENV === "development" && (
              <Button onClick={handleDelegateAccount}>
                DEV: delegate the TOKENI account
              </Button>
            )}
          </div>
        </>
      )}

      {data && <AccountList delegatedAccounts={data} />}
    </div>
  );
}
