"use client";

import { notify } from "@/components/notification";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { compress, lamportsToSolString } from "@/lib/solana/common";
import type { StakeAccountType } from "@/state/queries/use-user-stake-accounts";
import { useUserStakeAccounts } from "@/state/queries/use-user-stake-accounts";
import { useValidatorData } from "@/state/queries/use-validator-data";
import {
  Button,
  cn,
  CopyButton,
  SpinnerIcon,
  Switch,
  SwitchField,
} from "@blastctrl/ui";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import { Description, Field, Input, Label } from "@headlessui/react";
import { DocumentDuplicateIcon } from "@heroicons/react/20/solid";
import { getWithdrawInstruction } from "@solana-program/stake";
import { useConnector } from "@solana/connector/react";
import {
  address,
  flattenTransactionPlanResult,
  isAddress,
  parallelInstructionPlan,
  type Address,
  lamportsToSol,
} from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Box } from "./box";
import { decimalFixedPointToString } from "@solana/fixed-points";

export function AccountList() {
  const { account } = useConnector();
  const { setOpen } = useConnectorDialog();
  const { data, isLoading, error } = useUserStakeAccounts(account ?? undefined);

  if (!account) {
    return (
      <Box className="mt-4 max-w-2xl">
        <Button
          color="indigo"
          type="button"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          Connect your wallet
        </Button>
      </Box>
    );
  }

  if (isLoading) {
    return <Box className="mt-4 max-w-2xl">Loading...</Box>;
  }

  if (error) {
    return <Box className="mt-4 max-w-2xl">{error.message}</Box>;
  }

  return <AccountListForm stakeAccounts={data ?? []} />;
}

/** Lamports above the delegated stake and the rent reserve, i.e. what can be withdrawn. */
function getUnclaimedLamports(account: StakeAccountType): bigint {
  if (!account.stake) return 0n;
  return (
    account.lamports -
    account.stake.delegation.stake -
    account.meta.rentExemptReserve
  );
}

function AccountListForm({
  stakeAccounts,
}: {
  stakeAccounts: StakeAccountType[];
}) {
  const queryClient = useQueryClient();
  const { client } = useKitClient();
  const [selectedAccounts, setSelectedAccounts] = useState<Address[]>([]);
  const [modifyRecipient, setModifyRecipient] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const totalClaimLamports = stakeAccounts
    .filter((acc) => selectedAccounts.includes(acc.address))
    .reduce((sum, account) => sum + getUnclaimedLamports(account), 0n);

  const isInvalid =
    modifyRecipient && recipient !== "" && !isAddress(recipient);

  const handleSubmit = async () => {
    if (!client) return;
    const owner = client.payer;
    const recipientAddress =
      modifyRecipient && recipient ? address(recipient) : owner.address;

    const instructions = stakeAccounts
      .filter((acc) => selectedAccounts.includes(acc.address))
      .map((acc) => ({ acc, lamports: getUnclaimedLamports(acc) }))
      .filter(({ lamports }) => lamports > 0n)
      .map(({ acc, lamports }) =>
        getWithdrawInstruction({
          stake: acc.address,
          recipient: recipientAddress,
          withdrawAuthority: owner,
          // A withdrawal under an active lockup needs the custodian's
          // signature; the wallet gives it when it is the custodian.
          lockupAuthority:
            acc.meta.lockup.custodian === owner.address ? owner : undefined,
          args: lamports,
        }),
      );
    if (instructions.length === 0) return;

    setIsConfirming(true);
    try {
      // Withdrawals are independent, so the planner packs as many as fit into
      // one transaction and sends any overflow as further transactions.
      const result = await client.sendTransactions(
        parallelInstructionPlan(instructions),
      );
      const signatures = flattenTransactionPlanResult(result)
        .filter((r) => r.status === "successful")
        .map((r) => r.context.signature);

      for (const signature of signatures) {
        notify({
          type: "success",
          title:
            signatures.length > 1
              ? `Transaction ${signatures.indexOf(signature) + 1} of ${signatures.length} confirmed`
              : "Transaction confirmed",
          txid: signature,
        });
      }
      setSelectedAccounts([]);
      void queryClient.invalidateQueries({ queryKey: ["user-stake-accounts"] });
    } catch (error) {
      notify({
        type: "error",
        title: "Transaction error",
        description: transactionErrorMessage(error),
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      <Box className="mt-4 max-w-2xl">
        <Table className="w-full">
          <TableHead>
            <TableRow>
              <TableHeader>Unclaimed SOL</TableHeader>
              <TableHeader className="text-right">Stake Account</TableHeader>
              <TableHeader className="text-right">Claim MEV</TableHeader>
            </TableRow>
          </TableHead>
          <tbody>
            {stakeAccounts.map((account) => {
              const unclaimedLamports = getUnclaimedLamports(account);
              if (!account.stake || unclaimedLamports === 0n) return null;

              return (
                <TableRow key={account.address}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold text-zinc-800">
                        {lamportsToSolString(unclaimedLamports)} SOL
                      </div>
                      <div className="text-sm text-wrap text-zinc-500">
                        Total in account:{" "}
                        {decimalFixedPointToString(
                          lamportsToSol(account.lamports),
                        )}{" "}
                        SOL
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-end gap-1.5">
                      <AccountAddress address={account.address} />
                      <ValidatorInfo account={account} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <SwitchField>
                      <Switch
                        checked={selectedAccounts.includes(account.address)}
                        onChange={() => {
                          setSelectedAccounts((selected) =>
                            selected.includes(account.address)
                              ? selected.filter((a) => a !== account.address)
                              : [...selected, account.address],
                          );
                        }}
                      />
                    </SwitchField>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </Box>
      <Box className="mt-4 max-w-2xl">
        <Field className="grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-1 sm:grid-cols-[1fr_auto]">
          <Label className="font-semibold text-zinc-800">
            Modify reward recipient
          </Label>
          <Switch
            color="indigo"
            checked={modifyRecipient}
            onChange={() => setModifyRecipient(!modifyRecipient)}
          />
          <Description className="text-sm text-zinc-500">
            By default, the rewards are sent to the wallet that owns the stake
            accounts. You can use this to set a different wallet as the
            recipient.
          </Description>
        </Field>

        {modifyRecipient && (
          <Field className="mt-4 w-full">
            <Label className="font-medium">Recipient address</Label>
            <Input
              value={recipient}
              onChange={({ target }) => setRecipient(target.value)}
              invalid={isInvalid}
              className={cn(
                "mt-2 block w-full rounded-lg border border-zinc-300 bg-white/5 px-3 py-1 text-sm/6 text-zinc-900",
                "focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25",
                "h-[36px] grow",
                "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
                "data-invalid:text-red-600 data-invalid:ring-red-600 data-invalid:data-focus:outline-red-600",
              )}
              placeholder="Enter the address of the recipient"
            />
          </Field>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSubmit}
            color="indigo"
            className="h-9 px-5 sm:px-5"
            disabled={
              !client || isInvalid || totalClaimLamports === 0n || isConfirming
            }
          >
            {isConfirming && <SpinnerIcon className="size-3.5 animate-spin" />}
            {totalClaimLamports === 0n
              ? "Confirm"
              : `Claim ${lamportsToSolString(totalClaimLamports)} SOL`}
          </Button>
        </div>
      </Box>
    </>
  );
}

function AccountAddress({ address }: { address: Address }) {
  return (
    <CopyButton clipboard={address} className="flex items-center gap-1">
      <span>{compress(address, 4)}</span>
      <DocumentDuplicateIcon className="size-4 text-zinc-400" />
    </CopyButton>
  );
}

function ValidatorInfo({ account }: { account: StakeAccountType }) {
  const { data, error, isPending } = useValidatorData(
    account.stake?.delegation.voterPubkey,
  );

  if (account.stake === null) {
    return (
      <div className="text-left text-sm">
        This stake account isn&apos;t delegated
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="hidden h-5 w-[140px] animate-pulse rounded-sm bg-indigo-200 sm:block" />
    );
  }

  if (error) {
    return (
      <div className="hidden w-[140px] text-right text-xs text-red-500 sm:block">
        Validator data not found
      </div>
    );
  }

  return (
    <div className="hidden h-5 w-[140px] items-center justify-end gap-2 sm:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.image}
        alt={data.name}
        width={24}
        height={24}
        className="size-5 rounded-full"
      />
      <span className="grow truncate text-sm">{data.name}</span>
    </div>
  );
}
