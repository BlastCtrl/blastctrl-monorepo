"use client";

import { useUserStakeAccounts } from "@/state/queries/use-user-stake-accounts";
import type { StakeAccountType } from "@/state/queries/use-user-stake-accounts";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { lamportsToSol, lamportsToSolString } from "@/lib/solana/common";
import {
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/solid";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { Box } from "./box";
import { Field, Label } from "@headlessui/react";
import * as Slider from "@radix-ui/react-slider";
import { retryWithBackoff } from "@/lib/utils";
import {
  ComputeBudgetProgram,
  Keypair,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { notify } from "@/components/notification";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PickerDialog } from "./picker-dialog";

export function SplitGraphicForm() {
  const { publicKey } = useWallet();
  const { data, isLoading, error } = useUserStakeAccounts(
    publicKey ?? undefined,
  );
  const [selectedAccount, setSelectedAccount] =
    useState<StakeAccountType | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = () => {
    if (selectedAccount) {
      void navigator.clipboard.writeText(selectedAccount.accountId.toString());
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
                data={data}
                selectedAccount={selectedAccount}
                setSelectedAccount={setSelectedAccount}
              />
            </div>
            {selectedAccount && (
              <Button
                color="indigo"
                onClick={copyToClipboard}
                className="flex !size-[36px] items-center !p-0 text-indigo-200"
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
      {selectedAccount && <SplitFormInner selectedAccount={selectedAccount} />}
    </>
  );
}

function SplitFormInner({
  selectedAccount,
}: {
  selectedAccount: StakeAccountType;
}) {
  const { connection } = useConnection();
  const [isConfirming, setIsConfirming] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  // multiply the lamports by the percent
  // check for error => percent is >= 100 or <= 0
  // Do not allow submit if there's an error
  // show red borders if there's an input error
  const [inputs, setInputs] = useState(() => {
    const original = selectedAccount.lamports * 0.5;
    return {
      percent: 50,
      originalStake: lamportsToSolString(original),
      newStake: lamportsToSolString(selectedAccount.lamports - original),
    };
  });

  const inputError = inputs.percent >= 100 || inputs.percent <= 0;

  const handleSlider = (value: number) => {
    const original = (selectedAccount.lamports * value) / 100;
    setInputs({
      percent: value,
      originalStake: lamportsToSolString(original),
      newStake: lamportsToSolString(selectedAccount.lamports - original),
    });
  };
  const handleLeftInput = (stakeStr: string) => {
    const stake = Number(stakeStr);
    const source = lamportsToSol(selectedAccount.lamports);
    const percent = (stake / source) * 100;
    setInputs({
      percent,
      originalStake: stakeStr,
      newStake: (source - stake).toLocaleString("fullwide", fullwide),
    });
  };

  const handleRightInput = (stakeStr: string) => {
    const stake = Number(stakeStr);
    const source = lamportsToSol(selectedAccount.lamports);
    const percent = 100 - (stake / source) * 100;
    setInputs({
      percent,
      originalStake: (source - stake).toLocaleString("fullwide", fullwide),
      newStake: stakeStr,
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!publicKey || !sendTransaction || !selectedAccount) return;
    if (inputError) return;
    try {
      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      const stakeAccount = Keypair.generate();
      const tx = new Transaction();
      const newAccountBalanceLamports = +(
        (1 - inputs.percent / 100) *
        selectedAccount.lamports
      ).toFixed(0);

      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1e6 }),
        StakeProgram.split(
          {
            authorizedPubkey: publicKey,
            stakePubkey: selectedAccount.accountId,
            splitStakePubkey: stakeAccount.publicKey,
            lamports: newAccountBalanceLamports,
          },
          0,
        ),
      );

      tx.feePayer = publicKey;
      tx.recentBlockhash = value.blockhash;
      tx.partialSign(stakeAccount);
      const signature = await sendTransaction(tx, connection, {
        minContextSlot: context.slot,
        maxRetries: 0,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });
      if (!isConfirming) {
        setIsConfirming(true);
      }

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
      setFormSuccess(stakeAccount.publicKey.toString());
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
    <form className="mt-4" onSubmit={handleSubmit}>
      <Box>
        <div className="text-left">
          <p className="text-sm font-medium">Current Stake Amount</p>
          <p className="text-lg font-bold">
            {lamportsToSol(selectedAccount.lamports)} SOL
          </p>
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
              className="group relative mt-1.5 flex w-full touch-none select-none items-center transition-[margin] duration-300 hover:-mx-1 hover:cursor-grab active:cursor-grabbing"
              min={0}
              max={100}
              step={0.1}
            >
              <Slider.Track className="relative h-4 grow rounded-full bg-gradient-to-r from-orange-400 to-yellow-400 duration-300 group-hover:h-[18px]">
                <Slider.Range className="absolute h-full rounded-l-full bg-gradient-to-r from-indigo-500 to-indigo-600" />
              </Slider.Track>
              <Slider.Thumb
                className="block h-6 w-3 rounded-sm border border-[#171717] bg-white outline-none transition-[height,width] group-hover:h-7 group-hover:w-[14px]"
                aria-label="Total %"
              />
            </Slider.Root>
          </div>
        </div>

        <div className="mt-2 grid w-full grid-cols-2 gap-4">
          <div className="grid aspect-[2/1] place-items-center rounded-3xl bg-indigo-500/25 ring-4 ring-inset ring-white/50">
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
                className="min-w-0 grow border-0 bg-transparent py-1.5 pl-0.5 pr-3.5 font-medium text-indigo-950/80 focus:outline-none focus:ring-0"
              />{" "}
              <span className="font-medium text-indigo-950/80">SOL</span>
            </div>
          </div>
          <div className="grid aspect-[2/1] place-items-center rounded-3xl bg-amber-500/25 ring-4 ring-inset ring-white/50">
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
                className="min-w-0 grow border-0 bg-transparent py-1.5 pl-0.5 pr-3.5 font-medium text-indigo-950/80 focus:outline-none focus:ring-0"
              />{" "}
              <span className="font-medium text-indigo-950/80">SOL</span>
            </div>
          </div>
        </div>

        {!publicKey ? (
          <div className="mt-6">
            <Button
              onClick={() => void setVisible(true)}
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
              disabled={inputError}
              color="indigo"
              className="w-full"
            >
              {isConfirming && (
                <SpinnerIcon className="-ml-1 mr-1 inline size-[1em] animate-spin" />
              )}
              Submit
            </Button>
          </div>
        )}

        {formSuccess && (
          <div className="mt-8 flex items-center gap-2 rounded-lg p-4 shadow ring-1 ring-black/5">
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
