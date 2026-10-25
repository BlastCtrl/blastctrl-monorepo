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
import { generateKeyPairSigner, type Address, type Lamports } from "@solana/kit";
import type { SyntheticEvent } from "react";
import { useState } from "react";
import { Box } from "./box";
import { PickerDialog } from "./picker-dialog";
import {
  parseSolInput,
  splitAmountError,
  splitBounds,
  splitInstructions,
  splittableLamports,
} from "./split-plan";

export function SplitGraphicForm({ owner }: { owner: Address }) {
  const { data, isLoading, error } = useUserStakeAccounts(owner);
  const { data: rent } = useRentQuery(STAKE_ACCOUNT_SIZE);
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
      {selectedAccount && rent !== undefined && (
        <SplitFormInner
          // Remount when the account changes so the split state resets.
          key={selectedAccount.address}
          owner={owner}
          selectedAccount={selectedAccount}
          rent={rent}
        />
      )}
    </>
  );
}

/** Slider and input state: what moves to the new account, in lamports, with the strings being edited. */
type SplitInputs = {
  newLamports: bigint;
  originalStake: string;
  newStake: string;
};

function SplitFormInner({
  owner,
  selectedAccount,
  rent,
}: {
  owner: Address;
  selectedAccount: StakeAccountType;
  rent: Lamports;
}) {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");

  // What a split can move: the delegated stake, or everything above rent
  // for an undelegated account. Free lamports (MEV rewards) never move.
  const total = splittableLamports(selectedAccount, rent);
  const bounds = splitBounds(selectedAccount, rent);

  const fromLamports = (newLamports: bigint): SplitInputs => ({
    newLamports,
    originalStake: lamportsToSolString(total - newLamports),
    newStake: lamportsToSolString(newLamports),
  });

  const [inputs, setInputs] = useState<SplitInputs>(() =>
    fromLamports(total / 2n),
  );

  const inputError = splitAmountError(selectedAccount, inputs.newLamports, rent);
  // Share kept by the original account, for the slider.
  const percent =
    total > 0n
      ? Number(((total - inputs.newLamports) * 10_000n) / total) / 100
      : 100;

  const handleSlider = (value: number) => {
    const kept = (total * BigInt(Math.round(value * 100))) / 10_000n;
    setInputs(fromLamports(total - kept));
  };
  const handleLeftInput = (stakeStr: string) => {
    const kept = parseSolInput(stakeStr);
    const newLamports = kept === null ? total : total - kept;
    setInputs({
      newLamports,
      originalStake: stakeStr,
      newStake: lamportsToSolString(newLamports),
    });
  };
  const handleRightInput = (stakeStr: string) => {
    const newLamports = parseSolInput(stakeStr) ?? 0n;
    setInputs({
      newLamports,
      originalStake: lamportsToSolString(total - newLamports),
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
      const splitStake = await generateKeyPairSigner();
      // The destination is funded with its rent by the wallet, then the
      // chosen stake moves into it (see split-plan.ts for the rules).
      const result = await client.sendTransaction(
        splitInstructions({
          source: selectedAccount.address,
          destination: splitStake,
          authority: client.payer,
          amount: inputs.newLamports,
          rent,
        }),
      );

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
          <p className="text-sm font-medium">
            {selectedAccount.stake
              ? "Delegated stake"
              : "Balance above the rent-exempt reserve"}
          </p>
          <p className="text-lg font-bold">{lamportsToSolString(total)} SOL</p>
          <p className="text-sm text-zinc-500">
            The new account&apos;s rent-exempt reserve (
            {lamportsToSolString(rent)} SOL) is paid by your wallet on top.
            {selectedAccount.stake &&
              " A delegated account must keep at least 1 SOL of stake on each side; any extra lamports (MEV rewards) stay in the original account."}
          </p>
        </div>

        <div className="">
          <div
            data-inputerror={!!inputError}
            className="text-right text-sm/6 font-medium text-zinc-500 data-[inputerror=true]:text-rose-500"
          >
            Split ratio: {percent.toFixed(2)}%
          </div>
          <div className="h-8">
            <Slider.Root
              value={[percent]}
              onValueChange={(value) => void handleSlider(value[0] ?? 50)}
              disabled={bounds === null}
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
                inputMode="decimal"
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
                inputMode="decimal"
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

        {inputError && (
          <p className="mt-3 text-sm text-rose-600">{inputError}</p>
        )}

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
              disabled={!!inputError || isConfirming}
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
