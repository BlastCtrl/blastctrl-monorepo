"use client";

import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/description-list";
import { notify } from "@/components/notification";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { lamportsToSolString } from "@/lib/solana/common";
import type { StakeAccountType } from "@/state/queries/use-stake-account";
import { useStakeAccount } from "@/state/queries/use-stake-account";
import { Button, cn, SpinnerIcon } from "@blastctrl/ui";
import {
  Checkbox,
  Field,
  Fieldset,
  Input,
  Label,
  Legend,
} from "@headlessui/react";
import { getAuthorizeInstruction, StakeAuthorize } from "@solana-program/stake";
import { address, isAddress, type Address } from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";

const DISABLE_OVERRIDE = true;

export function AuthorizeFormsContainer() {
  const queryClient = useQueryClient();
  const [stakeAccAddr, setStakeAccAddr] = useState("");
  const { data, error, refetch, isLoading } = useStakeAccount(
    stakeAccAddr,
    DISABLE_OVERRIDE,
  );

  const isSuccess = !!stakeAccAddr && !!data;
  const isInvalid = stakeAccAddr !== "" && !isAddress(stakeAccAddr);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSuccess || isInvalid) return;
    await refetch();
  };

  const reset = () => {
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: ["stake-account", stakeAccAddr],
    });
    setStakeAccAddr("");
  };

  return (
    <div className="mt-8">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Field className="w-full" disabled={isSuccess}>
          <Label className="font-medium">Staking Account</Label>
          <Input
            value={stakeAccAddr}
            onChange={({ target }) => setStakeAccAddr(target.value)}
            invalid={isInvalid}
            className={cn(
              "mt-2 block w-full rounded-lg border border-zinc-300 bg-white/5 px-3 py-1 text-sm/6 text-zinc-900",
              "focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25",
              "h-[36px] grow",
              "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
              "data-invalid:border-red-600 data-invalid:text-red-600 data-invalid:data-focus:outline-red-600",
            )}
            placeholder="Address of a staking account you have signing authority over"
          />
        </Field>
        <Button
          type="submit"
          color="indigo"
          className="h-9 px-5 sm:px-5"
          disabled={isSuccess || isInvalid || isLoading}
        >
          {isLoading && <SpinnerIcon className="size-3.5 animate-spin" />}
          Confirm
        </Button>
      </form>

      {error && (
        <div className="mt-8 rounded-lg border-2 border-red-600 bg-red-600/5 p-2 text-sm/6">
          <p className="font-medium">
            There was an error loading the staking account with the message:
          </p>
          <p className="font-medium text-red-600">{error.message}</p>
        </div>
      )}

      {isSuccess && (
        <>
          <div className="mt-8">
            <StakeAccountDescription stakeData={data} />
          </div>

          <AuthorizeTransactionBuilder
            reset={reset}
            stakeAddress={address(stakeAccAddr)}
          />
        </>
      )}
    </div>
  );
}

function StakeAccountDescription({
  stakeData,
}: {
  stakeData: StakeAccountType;
}) {
  const { lockup } = stakeData.meta;
  return (
    <DescriptionList className="w-[min(100%,350px)] rounded-lg border border-zinc-200 px-4">
      <DescriptionTerm>Balance</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {lamportsToSolString(stakeData.lamports)} SOL
      </DescriptionDetails>
      <DescriptionTerm>Delegated Voter</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {stakeData.stake
          ? stakeData.stake.delegation.voterPubkey
          : "Not delegated"}
      </DescriptionDetails>
      <DescriptionTerm>Withdraw Auth</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {stakeData.meta.authorized.withdrawer}
      </DescriptionDetails>
      <DescriptionTerm>Staking Auth</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {stakeData.meta.authorized.staker}
      </DescriptionDetails>
      <DescriptionTerm>Lockup Auth</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {lockup.custodian ?? "None"}
      </DescriptionDetails>
      {lockup.unixTimestamp > 0n ? (
        <>
          <DescriptionTerm>Lockup (Local time)</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {new Date(Number(lockup.unixTimestamp) * 1000).toLocaleString()}
          </DescriptionDetails>
          <DescriptionTerm>Lockup Timestamp</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {lockup.unixTimestamp.toString()}
          </DescriptionDetails>
        </>
      ) : null}
    </DescriptionList>
  );
}

function AuthorizeTransactionBuilder({
  stakeAddress,
  reset,
}: {
  stakeAddress: Address;
  reset: () => void;
}) {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const [authority, setAuthority] = useState("");
  const [withdrawCheckbox, setWithdrawCheckbox] = useState(true);
  const [stakeCheckbox, setStakeCheckbox] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  const { refetch } = useStakeAccount(stakeAddress);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    const owner = client.payer;

    if (!withdrawCheckbox && !stakeCheckbox) {
      notify({
        type: "error",
        description: "Pick at least one type of signing authority.",
      });
      return;
    }
    if (!isAddress(authority)) {
      notify({
        type: "error",
        description: "New authority is not a valid address.",
      });
      return;
    }
    const newAuthority = address(authority);

    // The connected wallet signs as the current authority for each type.
    const instructions = [
      ...(withdrawCheckbox
        ? [
            getAuthorizeInstruction({
              stake: stakeAddress,
              authority: owner,
              arg0: newAuthority,
              arg1: StakeAuthorize.Withdrawer,
            }),
          ]
        : []),
      ...(stakeCheckbox
        ? [
            getAuthorizeInstruction({
              stake: stakeAddress,
              authority: owner,
              arg0: newAuthority,
              arg1: StakeAuthorize.Staker,
            }),
          ]
        : []),
    ];

    setIsConfirming(true);
    try {
      const result = await client.sendTransaction(instructions);

      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: result.context.signature,
      });

      await refetch();
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
    <div className="mt-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Fieldset className="space-y-2">
          <Legend className="font-bold">
            Choose signing authorities to update
          </Legend>
          <Field className="flex items-center gap-2">
            <Checkbox
              checked={withdrawCheckbox}
              onChange={setWithdrawCheckbox}
              className="group block size-4 rounded-sm border bg-white data-checked:bg-indigo-500 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:data-disabled:bg-gray-500"
            >
              <CheckMark />
            </Checkbox>
            <Label>Withdraw authority</Label>
          </Field>
          <Field className="flex items-center gap-2">
            <Checkbox
              checked={stakeCheckbox}
              onChange={setStakeCheckbox}
              className="group block size-4 rounded-sm border bg-white data-checked:bg-indigo-500 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:data-disabled:bg-gray-500"
            >
              <CheckMark />
            </Checkbox>
            <Label>Staking authority</Label>
          </Field>
        </Fieldset>

        <Field className="w-full">
          <Label className="font-medium">New Authority</Label>
          <Input
            required
            value={authority}
            onChange={({ target }) => setAuthority(target.value)}
            invalid={authority !== "" && !isAddress(authority)}
            className={cn(
              "mt-2 block w-full rounded-lg border border-zinc-300 bg-white/5 px-3 py-1 text-sm/6 text-zinc-900",
              "focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25",
              "h-[36px] grow",
              "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
              "data-invalid:border-red-600 data-invalid:text-red-600 data-invalid:data-focus:outline-red-600",
            )}
            placeholder="Address of the new signing authority"
          />
        </Field>

        {!client ? (
          <div className="flex justify-end">
            <Button type="button" color="indigo" onClick={() => setOpen(true)}>
              Connect your wallet
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={reset}
              color="dark/zinc"
              className="flex-1"
            >
              Reset
            </Button>
            <Button
              type="submit"
              color="indigo"
              className="flex-1"
              disabled={isConfirming}
            >
              {isConfirming && (
                <SpinnerIcon className="mr-1 -ml-1 inline size-[1em] animate-spin" />
              )}
              Submit
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      className="scale-0 stroke-white opacity-0 transition-all group-data-checked:scale-100 group-data-checked:opacity-100"
      viewBox="0 0 14 14"
      fill="none"
    >
      <path
        d="M3 8L6 11L11 3.5"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
