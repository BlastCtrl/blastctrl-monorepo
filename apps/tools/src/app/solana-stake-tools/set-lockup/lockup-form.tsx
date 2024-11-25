"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isPublicKey, lamportsToSolString } from "@/lib/solana/common";
import {
  Field,
  Fieldset,
  Input,
  InputProps,
  Label,
  Legend,
} from "@headlessui/react";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/description-list";
import type { FormEvent, ReactNode } from "react";
import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";

import { Button, cn, SpinnerIcon } from "@blastctrl/ui";
import {
  StakeAccountType,
  useStakeAccount,
} from "@/state/queries/use-stake-account";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  PublicKey,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { notify } from "@/components/notification";
import { retryWithBackoff } from "@/lib/utils";
import { getSetLockupInstruction } from "@/lib/solana/stake";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ZodError } from "zod";
import { useCurrentEpoch } from "@/state/queries/use-epoch";
import { Badge } from "@/components/badge";

function getLockupStatus(
  stakeData: StakeAccountType | undefined,
  currentEpoch: number | undefined,
): boolean | undefined {
  if (stakeData === undefined) return undefined;
  if (currentEpoch === undefined) return undefined;
  const lockupEpoch = stakeData.data.info.meta.lockup.epoch;
  const lockupTimestamp = stakeData.data.info.meta.lockup.unixTimestamp;
  const currentTimestamp = Math.floor(Date.now() / 1000);

  return lockupTimestamp > currentTimestamp || lockupEpoch > currentEpoch;
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
  const isInvalid = stakeAccAddr !== "" && !isPublicKey(stakeAccAddr);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    console.log("Submit attempt");
    e.preventDefault();
    if (isSuccess || isInvalid) {
      console.log(isSuccess, isInvalid, "early return");
      return;
    }
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
    <div className="mt-8 ">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Field className="w-full" disabled={isSuccess}>
          <Label className="font-semibold">Staking Account</Label>
          <Input
            value={stakeAccAddr}
            onChange={({ target }) => setStakeAccAddr(target.value)}
            invalid={isInvalid}
            className={cn(
              "mt-2 block w-full rounded-lg border border-zinc-300 bg-white/5 px-3 py-1 text-sm/6 text-zinc-900",
              "focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25",
              "h-[36px] grow",
              "data-[disabled]:bg-zinc-100 data-[disabled]:text-zinc-500",
              "data-[invalid]:text-red-600 data-[invalid]:data-[focus]:outline-red-600 data-[invalid]:ring-red-600",
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
          {error instanceof ZodError ? (
            <div className="space-y-1">
              {error.errors.map((e, i) => (
                <p key={i} className="font-medium text-red-600">
                  {e.path.join(".")}: {e.message}
                </p>
              ))}
            </div>
          ) : (
            <p className="font-medium text-red-600">{error.message}</p>
          )}
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
            stakePubkey={new PublicKey(stakeAccAddr)}
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
  const { publicKey } = useWallet();
  const { data: epochData } = useCurrentEpoch(); // prefetch

  const withdrawAuthMatch =
    publicKey?.toString() === stakeData.data.info.meta.authorized.withdrawer;
  const stakerAuthMatch =
    publicKey?.toString() === stakeData.data.info.meta.authorized.staker;
  const custodianMatch =
    publicKey?.toString() === stakeData.data.info.meta.lockup.custodian;
  const isLockupActive = getLockupStatus(stakeData, epochData?.epoch);

  return (
    <DescriptionList className="relative w-full rounded-lg border border-zinc-200 px-4 font-normal underline-offset-4 shadow *:decoration-green-500/50 *:decoration-[3px]">
      <DescriptionTerm>Balance</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {lamportsToSolString(stakeData.lamports)} SOL
      </DescriptionDetails>
      <DescriptionTerm>Delegated Voter</DescriptionTerm>
      <DescriptionDetails className="truncate">
        {stakeData.data.info.stake
          ? stakeData.data.info.stake.delegation.voter
          : "Undelegated"}
      </DescriptionDetails>
      <DescriptionTerm>Withdraw Auth</DescriptionTerm>
      <DescriptionDetails
        data-match={withdrawAuthMatch}
        className="truncate data-[match=true]:underline"
      >
        {stakeData.data.info.meta.authorized.withdrawer}
      </DescriptionDetails>
      <DescriptionTerm>Staking Auth</DescriptionTerm>
      <DescriptionDetails
        data-match={stakerAuthMatch}
        className="truncate data-[match=true]:underline"
      >
        {stakeData.data.info.meta.authorized.staker}
      </DescriptionDetails>
      <DescriptionTerm>Lockup Auth (Custodian)</DescriptionTerm>
      <DescriptionDetails
        data-match={custodianMatch}
        className="truncate data-[match=true]:underline"
      >
        {stakeData.data.info.meta.lockup.custodian ?? "None"}
      </DescriptionDetails>
      {stakeData.data.info.meta.lockup.unixTimestamp > 0 ? (
        <>
          <DescriptionTerm>Lockup (Local time)</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {new Date(
              stakeData.data.info.meta.lockup.unixTimestamp * 1000,
            ).toLocaleString()}
          </DescriptionDetails>
          <DescriptionTerm>Lockup Timestamp</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {stakeData.data.info.meta.lockup.unixTimestamp}
          </DescriptionDetails>
        </>
      ) : null}
      {stakeData.data.info.meta.lockup.epoch > 0 ? (
        <>
          <DescriptionTerm>Lockup epoch</DescriptionTerm>
          <DescriptionDetails className="truncate">
            {stakeData.data.info.meta.lockup.epoch}
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
  stakePubkey,
  stakeData,
  reset,
}: {
  stakePubkey: PublicKey;
  stakeData: StakeAccountType;
  reset: () => void;
}) {
  const { data } = useCurrentEpoch();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [custodian, setCustodian] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [epoch, setEpoch] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const { setVisible } = useWalletModal();

  const { refetch } = useStakeAccount(stakePubkey.toString());

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!publicKey || !sendTransaction) return;

    if (custodian === "" && timestamp === "" && epoch === "") {
      notify({
        type: "error",
        description: "You need to update at least one field.",
      });
      return;
    }

    try {
      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10e6 }));

      tx.add(
        getSetLockupInstruction(
          StakeProgram.programId,
          stakePubkey,
          {
            custodian: custodian ? new PublicKey(custodian) : undefined,
            epoch: !!epoch ? Number(epoch) : undefined,
            unixTimestamp: !!timestamp ? Number(timestamp) : undefined,
          },
          publicKey,
        ),
      );

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

      await refetch();
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
            <div className="flex rounded-lg bg-white/5 shadow-sm">
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
                    stakeData.data.info.meta.lockup.unixTimestamp.toString(),
                  )
                }
              />
            </div>
          </Field>

          <Field className="w-full">
            <Label className="font-medium sm:text-sm/6">
              Lockup epoch
              {data?.epoch !== undefined ? ` (current: ${data.epoch})` : null}
            </Label>
            <div className="flex rounded-lg bg-white/5 shadow-sm">
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
                  void setEpoch(
                    stakeData.data.info.meta.lockup.epoch.toString(),
                  )
                }
              />
            </div>
          </Field>

          <Field className="w-full">
            <Label className="font-medium sm:text-sm/6">Lockup custodian</Label>
            <div className="flex rounded-lg bg-white/5 shadow-sm">
              <StyledInput
                autoCorrect="false"
                value={custodian}
                onChange={({ target }) => setCustodian(target.value)}
                invalid={custodian !== "" && !isPublicKey(custodian)}
                placeholder="New lockup custodian"
              />
              <InsetButton
                handleClick={() => {
                  window.alert(
                    "This will set the custodian to a non-existing wallet. It will not be possible to modify the lockup until it expires.",
                  );
                  void setCustodian(PublicKey.default.toString());
                }}
              >
                Disable
              </InsetButton>
              <InsetButton
                handleClick={() =>
                  void setCustodian(stakeData.data.info.meta.lockup.custodian)
                }
              />
            </div>
          </Field>
        </Fieldset>

        {!publicKey ? (
          <div className="flex justify-end">
            <Button
              onClick={() => void setVisible(true)}
              type="button"
              color="indigo"
            >
              Connect your wallet
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 ">
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
                <SpinnerIcon className="-ml-1 mr-1 inline size-[1em] animate-spin" />
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
      className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-md px-3 py-2 text-sm font-semibold text-zinc-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 [&:has(+button)]:rounded-r-none"
    >
      {children ?? <ArrowUturnLeftIcon className="size-4" />}
    </button>
  );
}

function StyledInput({ className, ...props }: InputProps) {
  return (
    <Input
      className={cn(
        "grow items-stretch data-[focus]:z-10",
        "rounded-none rounded-l-lg border-0 py-1.5 text-zinc-900 ring-1 ring-inset ring-gray-300 sm:text-sm/6",
        "focus:outline-none data-[focus]:ring-2 data-[focus]:ring-inset data-[focus]:ring-indigo-600",
        "data-[disabled]:bg-zinc-100 data-[disabled]:text-zinc-500",
        "data-[invalid]:border-red-600 data-[invalid]:text-red-600",
        className,
      )}
      {...props}
    />
  );
}
