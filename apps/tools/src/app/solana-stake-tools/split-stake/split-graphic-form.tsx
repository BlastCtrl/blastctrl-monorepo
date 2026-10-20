"use client";

import { notify } from "@/components/notification";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { lamportsToSolString } from "@/lib/solana/common";
import { STAKE_ACCOUNT_SIZE } from "@/lib/solana/stake-account";
import { useRentQuery } from "@/state/queries/use-rent";
import { useUserStakeAccounts } from "@/state/queries/use-user-stake-accounts";
import type { StakeAccountType } from "@/state/queries/use-user-stake-accounts";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { Field, Label } from "@headlessui/react";
import {
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/solid";
import * as Slider from "@radix-ui/react-slider";
import {
  getSplitInstruction,
  STAKE_PROGRAM_ADDRESS,
} from "@solana-program/stake";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  generateKeyPairSigner,
  lamports,
  type Address,
  lamportsToSol,
} from "@solana/kit";
import type { SyntheticEvent } from "react";
import { useState } from "react";
import { Box } from "./box";
import { PickerDialog } from "./picker-dialog";
import { decimalFixedPointToNumber } from "@solana/fixed-points";

export function SplitGraphicForm({ owner }: { owner: Address }) {
  const { data, isLoading, error } = useUserStakeAccounts(owner);
  const [selectedAccount, setSelectedAccount] =
    useState<StakeAccountType | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = () => {
    if (selectedAccount) {
      void navigator.clipboard.writeText(selectedAccount.address);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (isLoading) {
    return <div>...</div>;
  }

  return (
    <>
      <Box className="mt-4 space-y-4">
        <Field className="flex flex-col items-start">
          <Label className="font-medium sm:text-sm/6">
            Select a staking account
          </Label>
          <div className="flex items-center gap-4">
            <div className="mt-1 w-72">
              <PickerDialog
                owner={owner}
                data={data}
                selectedAccount={selectedAccount}
                setSelectedAccount={setSelectedAccount}
              />
            </div>
            {selectedAccount && (
              <Button
                color="indigo"
                onClick={copyToClipboard}
                className="flex size-[36px]! items-center p-0! text-indigo-200"
              >
                {isCopied ? (
                  <ClipboardDocumentCheckIcon className="size-5" />
                ) : (
                  <ClipboardDocumentIcon className="size-5" />
                )}
              </Button>
            )}
          </div>
        </Field>
      </Box>
      {selectedAccount && (
        <SplitFormInner owner={owner} selectedAccount={selectedAccount} />
      )}
    </>
  );
}

function SplitFormInner({
  owner,
  selectedAccount,
}: {
  owner: Address;
  selectedAccount: StakeAccountType;
}) {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const { refetch: refetchRent } = useRentQuery(STAKE_ACCOUNT_SIZE);

  // Slider math works in plain numbers; a stake account's balance is well
  // below 2^53 lamports.
  const totalLamports = Number(selectedAccount.lamports);
  const totalSol = decimalFixedPointToNumber(
    lamportsToSol(selectedAccount.lamports),
  );

  const [inputs, setInputs] = useState(() => {
    const original = totalLamports * 0.5;
    return {
      percent: 50,
      originalStake: lamportsToSolString(original),
      newStake: lamportsToSolString(totalLamports - original),
    };
  });

  const inputError = inputs.percent >= 100 || inputs.percent <= 0;

  const handleSlider = (value: number) => {
    const original = (totalLamports * value) / 100;
    setInputs({
      percent: value,
      originalStake: lamportsToSolString(original),
      newStake: lamportsToSolString(totalLamports - original),
    });
  };
  const handleLeftInput = (stakeStr: string) => {
    const stake = Number(stakeStr);
    setInputs({
      percent: (stake / totalSol) * 100,
      originalStake: stakeStr,
      newStake: (totalSol - stake).toLocaleString("fullwide", fullwide),
    });
  };
  const handleRightInput = (stakeStr: string) => {
    const stake = Number(stakeStr);
    setInputs({
      percent: 100 - (stake / totalSol) * 100,
      originalStake: (totalSol - stake).toLocaleString("fullwide", fullwide),
      newStake: stakeStr,
    });
  };

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!client || inputError) return;

    if (
      selectedAccount.meta.authorized.staker !== owner &&
      !window.confirm(
        'Your wallet doesn\'t have the "staker" authority over this staking account. This action will likely fail. Continue anyway?',
      )
    ) {
      return;
    }

    setIsConfirming(true);
    try {
      const { data: rentExemption } = await refetchRent({ throwOnError: true });
      const splitStake = await generateKeyPairSigner();
      const newAccountLamports = lamports(
        BigInt(Math.round((1 - inputs.percent / 100) * totalLamports)),
      );

      // Same shape as the legacy StakeProgram.split with a rent reserve: fund
      // the destination's rent from the wallet, then split into it.
      const result = await client.sendTransaction([
        getCreateAccountInstruction({
          payer: client.payer,
          newAccount: splitStake,
          lamports: rentExemption ?? 0n,
          space: BigInt(STAKE_ACCOUNT_SIZE),
          programAddress: STAKE_PROGRAM_ADDRESS,
        }),
        getSplitInstruction({
          stake: selectedAccount.address,
          splitStake: splitStake.address,
          stakeAuthority: client.payer,
          args: newAccountLamports,
        }),
      ]);

      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: result.context.signature,
      });
      setFormSuccess(splitStake.address);
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
    <form className="mt-4" onSubmit={handleSubmit}>
      <Box>
        <div className="text-left">
          <p className="text-sm font-medium">Current Stake Amount</p>
          <p className="text-lg font-bold">{totalSol} SOL</p>
        </div>

        <div className="">
          <div
            data-inputerror={inputError}
            className="text-right text-sm/6 font-medium text-zinc-500 data-[inputerror=true]:text-rose-500"
          >
            Split ratio: {inputs.percent.toFixed(2)}%
          </div>
          <div className="h-8">
            <Slider.Root
              value={[inputs.percent]}
              onValueChange={(value) => void handleSlider(value[0] ?? 50)}
              className="group relative mt-1.5 flex w-full touch-none items-center transition-[margin] duration-300 select-none hover:-mx-1 hover:cursor-grab active:cursor-grabbing"
              min={0}
              max={100}
              step={0.1}
            >
              <Slider.Track className="relative h-4 grow rounded-full bg-linear-to-r from-orange-400 to-yellow-400 duration-300 group-hover:h-[18px]">
                <Slider.Range className="absolute h-full rounded-l-full bg-linear-to-r from-indigo-500 to-indigo-600" />
              </Slider.Track>
              <Slider.Thumb
                className="block h-6 w-3 rounded-xs border border-[#171717] bg-white outline-hidden transition-[height,width] group-hover:h-7 group-hover:w-[14px]"
                aria-label="Total %"
              />
            </Slider.Root>
          </div>
        </div>

        <div className="mt-2 grid w-full grid-cols-2 gap-4">
          <div className="grid aspect-2/1 place-items-center rounded-3xl bg-indigo-500/25 ring-4 ring-white/50 ring-inset">
            <div className="flex w-4/5 items-center border-b-2 border-indigo-900">
              <input
                type="text"
                id="originalStake"
                name="originalStake"
                value={inputs.originalStake}
                onChange={({ target }) => {
                  if (/^\d*\.?\d{0,9}$/.test(target.value)) {
                    handleLeftInput(target.value);
                  }
                }}
                className="min-w-0 grow border-0 bg-transparent py-1.5 pr-3.5 pl-0.5 font-medium text-indigo-950/80 focus:ring-0 focus:outline-hidden"
              />{" "}
              <span className="font-medium text-indigo-950/80">SOL</span>
            </div>
          </div>
          <div className="grid aspect-2/1 place-items-center rounded-3xl bg-amber-500/25 ring-4 ring-white/50 ring-inset">
            <div className="flex w-4/5 items-center border-b-2 border-indigo-900">
              <input
                type="text"
                id="newStake"
                name="newStake"
                value={inputs.newStake}
                onChange={({ target }) => {
                  if (/^\d*\.?\d{0,9}$/.test(target.value)) {
                    handleRightInput(target.value);
                  }
                }}
                className="min-w-0 grow border-0 bg-transparent py-1.5 pr-3.5 pl-0.5 font-medium text-indigo-950/80 focus:ring-0 focus:outline-hidden"
              />{" "}
              <span className="font-medium text-indigo-950/80">SOL</span>
            </div>
          </div>
        </div>

        {!client ? (
          <div className="mt-6">
            <Button
              onClick={() => setOpen(true)}
              type="button"
              color="indigo"
              className="w-full"
            >
              Connect your wallet
            </Button>
          </div>
        ) : (
          <div className="mt-6">
            <Button
              type="submit"
              disabled={inputError || isConfirming}
              color="indigo"
              className="w-full"
            >
              {isConfirming && (
                <SpinnerIcon className="mr-1 -ml-1 inline size-[1em] animate-spin" />
              )}
              Submit
            </Button>
          </div>
        )}

        {formSuccess && (
          <div className="mt-8 flex items-center gap-2 rounded-lg p-4 shadow-sm ring-1 ring-black/5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-5 text-green-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              New staking account created:{" "}
              <strong className="text-blue-500">{formSuccess}</strong>
            </span>
          </div>
        )}
      </Box>
    </form>
  );
}

const fullwide: Intl.NumberFormatOptions = {
  useGrouping: false,
  maximumFractionDigits: 9,
};
