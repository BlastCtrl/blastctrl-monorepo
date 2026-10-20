"use client";

import { notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-programs";
import { useDelegatedAssets } from "@/state/queries/use-delegated-assets";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import {
  getApproveInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { useConnector } from "@solana/connector/react";
import { address, type Address } from "@solana/kit";
import { AccountList } from "./_components/account-list";

/** Dev only: token accounts of the dev wallet to delegate so the list has rows. */
const DEV_DELEGATE = address("AuKct4JHSMhftUHZHmkiSLUAC7uevUdJjhvUhSpTitJC");
const DEV_ACCOUNTS = {
  token: address("D59omT4FmyyGnegtLCCBNCjNAh7vAWJHn14Ux1faN7Ha"),
  token2022: address("6kCzhxTd5UAMnbGYnQw1vrCuYP18taxskvouuQijvbFx"),
};

export default function RevokeDelegations() {
  const { isConnected, account } = useConnector();
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const { data, isFetching, refetch } = useDelegatedAssets(account ?? "");

  const handleLoad = async () => {
    if (!isConnected) {
      setOpen(true);
      return;
    }
    void refetch();
  };

  /** Dev only: approve 25 tokens (8 decimals) to the dev delegate. */
  const handleDelegateDev = async (
    source: Address,
    programAddress: Address,
  ) => {
    if (!client) return;
    try {
      const result = await client.sendTransaction([
        getApproveInstruction(
          {
            source,
            delegate: DEV_DELEGATE,
            owner: client.payer,
            amount: 2_500_000_000n,
          },
          { programAddress },
        ),
      ]);
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

    return "I understand, show my delegated token accounts";
  };

  return (
    <div
      className={cn(
        "mx-auto w-[min(100%,var(--breakpoint-md))] overflow-visible bg-white px-4 pb-5 sm:rounded-lg sm:p-6 sm:shadow-sm",
        !!data && "pb-0!",
      )}
    >
      <h1 className="mb-4 font-display text-3xl font-semibold">
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
              <>
                <Button
                  disabled={!client}
                  onClick={() =>
                    handleDelegateDev(DEV_ACCOUNTS.token, TOKEN_PROGRAM_ADDRESS)
                  }
                >
                  DEV: delegate the TOKENI account
                </Button>
                <Button
                  disabled={!client}
                  onClick={() =>
                    handleDelegateDev(
                      DEV_ACCOUNTS.token2022,
                      TOKEN_2022_PROGRAM_ADDRESS,
                    )
                  }
                >
                  DEV: delegate the TOKENI22 account
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {data && <AccountList delegatedAccounts={data} />}
    </div>
  );
}
