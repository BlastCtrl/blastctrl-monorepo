"use client";
import {
  StakeAccountType,
  useUserStakeAccounts,
} from "@/state/queries/use-user-stake-accounts";
import { Box } from "./box";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Button,
  cn,
  CopyButton,
  SpinnerIcon,
  Switch,
  SwitchField,
} from "@blastctrl/ui";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import { compress, isPublicKey, lamportsToSol } from "@/lib/solana/common";
import { Description, Field, Input, Label } from "@headlessui/react";
import { useState } from "react";
import {
  ComputeBudgetProgram,
  PublicKey,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { DocumentDuplicateIcon } from "@heroicons/react/20/solid";
import { useValidatorData } from "@/state/queries/use-validator-data";
import { notify } from "@/components/notification";
import { retryWithBackoff } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function AccountList() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { data, isLoading, error } = useUserStakeAccounts(
    publicKey ?? undefined,
  );

  if (!publicKey) {
    return (
      <Box className="mt-4">
        <Button
          color="indigo"
          type="button"
          className="w-full"
          onClick={() => setVisible(true)}
        >
          Connect your wallet
        </Button>
      </Box>
    );
  }

  if (isLoading) {
    return <Box className="mt-4">Loading...</Box>;
  }

  if (error) {
    return <Box className="mt-4">{error.message}</Box>;
  }

  return <AccountListForm stakeAccounts={data ?? []} />;
}

function getUnclaimedLamports(account: StakeAccountType) {
  if (!account.data.info.stake) return 0;

  return (
    account.lamports -
    Number(account.data.info.stake.delegation.stake) -
    Number(account.data.info.meta.rentExemptReserve)
  );
}

function AccountListForm({
  stakeAccounts,
}: {
  stakeAccounts: StakeAccountType[];
}) {
  const queryClient = useQueryClient();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [modifyRecipient, setModifyRecipient] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const totalClaimLamports = stakeAccounts
    .filter((acc) => selectedAccounts.includes(acc.accountId.toString()))
    .reduce((acc, account) => acc + getUnclaimedLamports(account), 0);

  const isInvalid =
    modifyRecipient && recipient !== "" && !isPublicKey(recipient);

  const handleSubmit = async () => {
    if (!publicKey || !sendTransaction) return;

    try {
      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1e5 }));

      for (const address of selectedAccounts) {
        const stakePubkey = new PublicKey(address);
        const account = stakeAccounts.find(
          (acc) => acc.accountId.toString() === address,
        );

        if (!account) continue;

        const unclaimedLamports = getUnclaimedLamports(account);
        if (unclaimedLamports === 0) continue;

        tx.add(
          StakeProgram.withdraw({
            authorizedPubkey: publicKey,
            stakePubkey,
            lamports: unclaimedLamports,
            toPubkey: modifyRecipient ? new PublicKey(recipient) : publicKey,
          }),
        );
      }

      tx.recentBlockhash = value.blockhash;
      tx.feePayer = publicKey;

      const txSize = tx.serialize({ requireAllSignatures: false }).length;
      if (txSize >= 1232) {
        notify({
          type: "error",
          title: "Transaction size error",
          description: `Transaction size too large. Maximum size is 1232 bytes. Current size is ${txSize} bytes. Please reduce the number of stake accounts you want to claim rewards from simultaneously.`,
        });
        return;
      }

      const signature = await sendTransaction(tx, connection, {
        minContextSlot: context.slot,
        maxRetries: 0,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });
      if (!isConfirming) {
        setIsConfirming(true);
      }

      console.log(signature);

      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: value.blockhash,
          lastValidBlockHeight: value.lastValidBlockHeight,
        },
        "confirmed",
      );

      if (result.value.err) throw Error(JSON.stringify(result.value.err));

      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: signature,
      });

      void queryClient.invalidateQueries({
        exact: true,
        queryKey: [
          "user-stake-accounts",
          publicKey.toString(),
          publicKey.toString(),
        ],
      });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["user-stake-accounts", publicKey.toString()],
      });
    } catch (error: any) {
      notify({
        type: "error",
        title: "Transaction error",
        description: error.message,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      <Box className="mt-4 max-w-full">
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
              const address = account.accountId.toString();
              if (!account.data.info.stake) return null;

              const unclaimedLamports =
                account.lamports -
                Number(account.data.info.stake.delegation.stake) -
                Number(account.data.info.meta.rentExemptReserve);

              if (unclaimedLamports === 0) return null;

              return (
                <TableRow key={address}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold text-zinc-800">
                        {unclaimedLamports} Lamports
                      </div>
                      <div className="text-wrap text-sm text-zinc-500">
                        Total in account: {lamportsToSol(account.lamports)} SOL
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-end gap-1.5">
                      <AccountAddress address={account.accountId} />
                      <ValidatorInfo account={account} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <SwitchField>
                      <Switch
                        checked={selectedAccounts.includes(address)}
                        onChange={() => {
                          setSelectedAccounts((selectedAccounts) => {
                            if (selectedAccounts.includes(address)) {
                              return selectedAccounts.filter(
                                (a) => a !== address,
                              );
                            } else {
                              return [...selectedAccounts, address];
                            }
                          });
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
      <Box className="mt-8 max-w-full sm:mt-4">
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
                "focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25",
                "h-[36px] grow",
                "data-[disabled]:bg-zinc-100 data-[disabled]:text-zinc-500",
                "data-[invalid]:text-red-600 data-[invalid]:data-[focus]:outline-red-600 data-[invalid]:ring-red-600",
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
            disabled={isInvalid || totalClaimLamports === 0 || isConfirming}
          >
            {isConfirming && <SpinnerIcon className="size-3.5 animate-spin" />}
            {totalClaimLamports === 0
              ? "Confirm"
              : `Claim ${totalClaimLamports} lamports`}
          </Button>
        </div>
      </Box>
    </>
  );
}

function AccountAddress({ address }: { address: PublicKey }) {
  return (
    <CopyButton
      clipboard={address.toString()}
      className="flex items-center gap-1 "
    >
      <span>{compress(address.toString(), 4)}</span>
      <DocumentDuplicateIcon className="size-4 text-zinc-400" />
    </CopyButton>
  );
}

function ValidatorInfo({ account }: { account: StakeAccountType }) {
  const { data, error, isPending } = useValidatorData(
    account.data.info.stake?.delegation.voter,
  );

  if (account.data.info.stake === null) {
    return (
      <div className="text-left text-sm">
        This stake account isn&apos;t delegated
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="hidden h-5 w-[140px] animate-pulse rounded bg-indigo-200 sm:block" />
    );
  }

  if (error) {
    return (
      <div className="w-[140px] text-right hidden text-xs text-red-500 sm:block">
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
