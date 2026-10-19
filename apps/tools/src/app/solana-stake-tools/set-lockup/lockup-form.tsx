"use client";

import { Badge } from "@/components/badge";
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
import { useCurrentEpoch } from "@/state/queries/use-epoch";
import { useStakeAccount } from "@/state/queries/use-stake-account";
import type { StakeAccountType } from "@/state/queries/use-stake-account";
import { Button, cn, SpinnerIcon } from "@blastctrl/ui";
import { Field, Fieldset, Input, Label, Legend } from "@headlessui/react";
import type { InputProps } from "@headlessui/react";
import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { getSetLockupInstruction } from "@solana-program/stake";
import { useConnector } from "@solana/connector/react";
import { address, isAddress, type Address } from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

/** The all-zero address: setting it as custodian makes the lockup unmodifiable until it expires. */
const DISABLED_CUSTODIAN = "11111111111111111111111111111111";

function getLockupStatus(
  stakeData: StakeAccountType | undefined,
  currentEpoch: number | undefined,
): boolean | undefined {
  if (stakeData === undefined) return undefined;
  if (currentEpoch === undefined) return undefined;
  const { epoch: lockupEpoch, unixTimestamp: lockupTimestamp } =
    stakeData.meta.lockup;
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

  return (
    lockupTimestamp > currentTimestamp || lockupEpoch > BigInt(currentEpoch)
  );
}

const DISABLE_OVERRIDE = true;

export function LockupFormContainer() {
  const queryClient = useQueryClient();
  const [stakeAccAddr, setStakeAccAddr] = useState("");
  const { data, error, refetch, isLoading } = useStakeAccount(
    stakeAccAddr,
    DISABLE_OVERRIDE,
  );
  useCurrentEpoch(); // prefetch

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
          <Label className="font-semibold">Staking Account</Label>
          <Input
            value={stakeAccAddr}
            onChange={({ target }) => setStakeAccAddr(target.value)}
            invalid={isInvalid}
            className={cn(
              "mt-2 block w-full rounded-lg border border-zinc-300 bg-white/5 px-3 py-1 text-sm/6 text-zinc-900",
              "focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25",
              "h-[36px] grow",
              "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
              "data-invalid:text-red-600 data-invalid:ring-red-600 data-invalid:data-focus:outline-red-600",
            )}
            placeholder="Enter a staking account where you are the custodian"
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

          <SetLockupTransactionBuilder
            reset={reset}
            stakeData={data}
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
  const { account } = useConnector();
  const { data: epochData } = useCurrentEpoch();

  const withdrawAuthMatch = account === stakeData.meta.authorized.withdrawer;
  const stakerAuthMatch = account === stakeData.meta.authorized.staker;
  const custodianMatch = account === stakeData.meta.lockup.custodian;
  const isLockupActive = getLockupStatus(stakeData, epochData?.epoch);

  return (
    <DescriptionList className="relative w-full rounded-lg border border-zinc-200 px-4 font-normal underline-offset-4 shadow-sm *:decoration-green-500/50 *:decoration-[3px]">
      <DescriptionTerm>Balance</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {lamportsToSolString(stakeData.lamports)} SOL
      </DescriptionDetails>
      <DescriptionTerm>Delegated Voter</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {stakeData.stake
          ? stakeData.stake.delegation.voterPubkey
          : "Undelegated"}
      </DescriptionDetails>
      <DescriptionTerm>Withdraw Auth</DescriptionTerm>
      <DescriptionDetails
        data-match={withdrawAuthMatch}
        className="truncate data-[match=true]:underline"
      >
        {stakeData.meta.authorized.withdrawer}
      </DescriptionDetails>
      <DescriptionTerm>Staking Auth</DescriptionTerm>
      <DescriptionDetails
        data-match={stakerAuthMatch}
        className="truncate data-[match=true]:underline"
      >
        {stakeData.meta.authorized.staker}
      </DescriptionDetails>
      <DescriptionTerm>Lockup Auth (Custodian)</DescriptionTerm>
      <DescriptionDetails
        data-match={custodianMatch}
        className="truncate data-[match=true]:underline"
      >
        {stakeData.meta.lockup.custodian ?? "None"}
      </DescriptionDetails>
      {stakeData.meta.lockup.unixTimestamp > 0n ? (
        <>
          <DescriptionTerm>Lockup (Local time)</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {new Date(
              Number(stakeData.meta.lockup.unixTimestamp) * 1000,
            ).toLocaleString()}
          </DescriptionDetails>
          <DescriptionTerm>Lockup Timestamp</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {stakeData.meta.lockup.unixTimestamp.toString()}
          </DescriptionDetails>
        </>
      ) : null}
      {stakeData.meta.lockup.epoch > 0n ? (
        <>
          <DescriptionTerm>Lockup epoch</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {stakeData.meta.lockup.epoch.toString()}
          </DescriptionDetails>
        </>
      ) : null}
      {isLockupActive !== undefined ? (
        <>
          <DescriptionTerm>Lockup state</DescriptionTerm>
          <DescriptionDetails>
            <Badge color={isLockupActive ? "zinc" : "green"}>
              {isLockupActive ? "Enforced" : "Inactive"}
            </Badge>
          </DescriptionDetails>
        </>
      ) : null}
    </DescriptionList>
  );
}

function SetLockupTransactionBuilder({
  stakeAddress,
  stakeData,
  reset,
}: {
  stakeAddress: Address;
  stakeData: StakeAccountType;
  reset: () => void;
}) {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const { data: epochData } = useCurrentEpoch();
  const [custodian, setCustodian] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [epoch, setEpoch] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const { refetch } = useStakeAccount(stakeAddress);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    const owner = client.payer;

    if (custodian === "" && timestamp === "" && epoch === "") {
      notify({
        type: "error",
        description: "You need to update at least one field.",
      });
      return;
    }
    if (custodian !== "" && !isAddress(custodian)) {
      notify({
        type: "error",
        description: "Custodian is not a valid address.",
      });
      return;
    }

    // Likely failure conditions; let the user back out.
    const lockupActive = getLockupStatus(stakeData, epochData?.epoch);
    if (
      lockupActive === false &&
      stakeData.meta.authorized.withdrawer !== owner.address &&
      !window.confirm(
        "This transaction might fail: the lockup has expired and the connected wallet is not the withdraw authority. Continue anyway?",
      )
    ) {
      return;
    }
    if (
      lockupActive &&
      stakeData.meta.lockup.custodian !== owner.address &&
      !window.confirm(
        "This transaction might fail: the lockup is active and the connected wallet is not the lockup custodian. Continue anyway?",
      )
    ) {
      return;
    }

    setIsConfirming(true);
    try {
      // Empty fields are sent as `null`, which leaves that lockup value untouched.
      const result = await client.sendTransaction([
        getSetLockupInstruction({
          stake: stakeAddress,
          authority: owner,
          unixTimestamp: timestamp ? Number(timestamp) : null,
          epoch: epoch ? Number(epoch) : null,
          custodian: custodian ? address(custodian) : null,
        }),
      ]);

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
        <Fieldset className="space-y-4">
          <div>
            <Legend className="mt-1.5 font-semibold">
              Choose lockup fields you wish to update
            </Legend>
            <p className="text-sm text-zinc-500">
              If you don&apos;t want to modify a field, leave it empty. To use
              the previous lockup value, press the button next to the input
              field.
            </p>
          </div>

          <Field className="w-full">
            <Label className="font-medium sm:text-sm/6">Lockup timestamp</Label>
            <div className="flex rounded-lg bg-white/5 shadow-xs">
              <StyledInput
                autoCorrect="false"
                value={timestamp}
                onChange={({ target }) => {
                  if (/^\d*$/.test(target.value)) {
                    setTimestamp(target.value);
                  }
                }}
                invalid={isNaN(parseInt(timestamp))}
                placeholder="New lockup timestamp"
              />
              <InsetButton
                handleClick={() =>
                  void setTimestamp(
                    stakeData.meta.lockup.unixTimestamp.toString(),
                  )
                }
              />
            </div>
          </Field>

          <Field className="w-full">
            <Label className="font-medium sm:text-sm/6">
              Lockup epoch
              {epochData?.epoch !== undefined
                ? ` (current: ${epochData.epoch})`
                : null}
            </Label>
            <div className="flex rounded-lg bg-white/5 shadow-xs">
              <StyledInput
                autoCorrect="false"
                value={epoch}
                onChange={({ target }) => {
                  if (/^\d*$/.test(target.value)) {
                    setEpoch(target.value);
                  }
                }}
                invalid={isNaN(parseInt(epoch))}
                placeholder="New lockup epoch"
              />
              <InsetButton
                handleClick={() =>
                  void setEpoch(stakeData.meta.lockup.epoch.toString())
                }
              />
            </div>
          </Field>

          <Field className="w-full">
            <Label className="font-medium sm:text-sm/6">Lockup custodian</Label>
            <div className="flex rounded-lg bg-white/5 shadow-xs">
              <StyledInput
                autoCorrect="false"
                value={custodian}
                onChange={({ target }) => setCustodian(target.value)}
                invalid={custodian !== "" && !isAddress(custodian)}
                placeholder="New lockup custodian"
              />
              <InsetButton
                handleClick={() => {
                  window.alert(
                    "This will set the custodian to a non-existing wallet. It will not be possible to modify the lockup until it expires.",
                  );
                  void setCustodian(DISABLED_CUSTODIAN);
                }}
              >
                Disable
              </InsetButton>
              <InsetButton
                handleClick={() =>
                  void setCustodian(stakeData.meta.lockup.custodian)
                }
              />
            </div>
          </Field>
        </Fieldset>

        {!client ? (
          <div className="flex justify-end">
            <Button onClick={() => setOpen(true)} type="button" color="indigo">
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
            <Button type="submit" color="indigo" className="flex-1">
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

function InsetButton({
  handleClick,
  children,
}: {
  handleClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title="Use previous value"
      aria-label="Use previous value"
      onClick={handleClick}
      className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-md px-3 py-2 text-sm font-semibold text-zinc-600 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 [&:has(+button)]:rounded-r-none"
    >
      {children ?? <ArrowUturnLeftIcon className="size-4" />}
    </button>
  );
}

function StyledInput({ className, ...props }: InputProps) {
  return (
    <Input
      className={cn(
        "grow items-stretch data-focus:z-10",
        "rounded-none rounded-l-lg border-0 px-3 py-1.5 text-zinc-900 ring-1 ring-gray-300 ring-inset sm:text-sm/6",
        "focus:outline-hidden data-focus:ring-2 data-focus:ring-indigo-600 data-focus:ring-inset",
        "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
        "data-invalid:border-red-600 data-invalid:text-red-600",
        className,
      )}
      {...props}
    />
  );
}
