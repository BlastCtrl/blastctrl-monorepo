"use client";

import { Select, notify, notifyPromise } from "@/components";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { buildWhirlpoolsSwapTransaction } from "@/lib/octane";
import { formatNumber, numberFormatter } from "@/lib/utils";
import { useJupQuery } from "@/state/queries/use-jup-quote";
import { useTokenBalance } from "@/state/queries/use-token-balance";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { lamportsToSol } from "@/lib/solana/common";
import { SpinnerIcon, cn } from "@blastctrl/ui";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { CogIcon } from "@heroicons/react/24/outline";
import {
  WalletAdapterNetwork,
  WalletSignTransactionError,
} from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { VersionedTransaction } from "@solana/web3.js";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import BonkSmall from "../../../public/bonk_small.png";
import { FormLeft } from "./_components/form-left";

type FormData = {
  swapAmount: number;
  slippage: number;
};

const BONK_MINT_58 = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const BONK_DECIMALS = 5;

const slippages = [
  { value: 0.1, label: "0.1%", id: 0 },
  { value: 0.5, label: "0.5%", id: 1 },
  { value: 1, label: "1%", id: 2 },
];

export default function BonkSwap() {
  const { network } = useNetworkConfigurationStore();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { slippage: 0.5 },
    mode: "onSubmit",
  });
  const swapAmount = watch("swapAmount");
  const [isSwapping, setIsSwapping] = useState(false);
  const [isFetchingQuote] = useState(false);
  const balanceQuery = useTokenBalance(BONK_MINT_58);

  const debouncedSwapAmount = useDebounce(swapAmount, 500);
  const quoteQuery = useJupQuery({
    inputMint: BONK_MINT_58,
    amount: debouncedSwapAmount * Math.pow(10, BONK_DECIMALS),
  });

  const submitSwap = async (data: FormData) => {
    if (!publicKey || !signTransaction) return;
    // Bonk!
    const { swapAmount, slippage } = data;
    const amountAsDecimals = Math.floor(swapAmount * 10 ** BONK_DECIMALS);

    let transaction: VersionedTransaction;
    setIsSwapping(true);
    try {
      const swap = await buildWhirlpoolsSwapTransaction(
        publicKey,
        BONK_MINT_58,
        amountAsDecimals,
        slippage,
      );

      transaction = swap.transaction;
    } catch (err: any) {
      setIsSwapping(false);
      if (err instanceof WalletSignTransactionError) return;
      return notify({
        type: "error",
        title: "Error Creating Swap Transaction",
        description: err?.message,
      });
    }
    const signature = await sendTransaction(transaction, connection);
    const { value } = await connection.getLatestBlockhashAndContext();

    await notifyPromise(
      connection.confirmTransaction({ signature, ...value }, "confirmed"),
      {
        loading: { description: "Confirming transaction" },
        success: () => ({
          title: "BONK Swap Success",
          txid: signature,
        }),
        error: (err) => ({
          title: "Bonk Swap Error",
          description: err?.message,
        }),
      },
    ).finally(() => {
      setIsSwapping(false);
      void balanceQuery.refetch();
    });
  };

  if (network === WalletAdapterNetwork.Devnet) {
    return (
      <div className="mx-auto text-lg">
        This page is only available on mainnet! Switch your network in the
        wallet menu 👉
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl overflow-visible bg-white px-4 pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <div className="border-b border-gray-200 pb-6">
        <h1 className="font-display mb-4 text-center text-3xl font-semibold">
          Gasless{" "}
          <span className="bg-gradient-to-tr from-[#fe5e00] to-[#facc00] bg-clip-text font-sans text-transparent">
            BONK{" "}
          </span>
          Swap
        </h1>
        <p className="text-sm text-gray-500 sm:mx-8">
          You want to dive deeper into Solana&apos;s DeFi but only have $BONK in
          your wallet? No worries! Simply connect your wallet, enter the amount
          and we will help you fund your swap using $BONK itself. No Solana
          required!
          <br />
          2.5% of the $BONK amount that you submit for swapping will be burned!
          🔥
          <br />
          <br />
          You can swap other tokens on our{" "}
          <Link
            href="/gasless-swap"
            className="whitespace-nowrap font-medium text-blue-600 hover:underline"
          >
            gasless swap tool &rarr;
          </Link>
        </p>
      </div>

      <div className="mt-4 flex gap-x-8">
        {/* Image + exchange rate */}
        <FormLeft />

        {/* Form */}
        <form
          onSubmit={handleSubmit(submitSwap)}
          className="flex flex-1 flex-col justify-start"
        >
          {!balanceQuery.data && (
            <div aria-hidden="true" className="mb-2 block h-[33px]" />
          )}
          {balanceQuery.data?.uiAmount ? (
            <button
              aria-disabled={balanceQuery.status !== "success"}
              onClick={() => {
                if (balanceQuery.data.uiAmount) {
                  setValue("swapAmount", balanceQuery.data.uiAmount);
                }
              }}
              className="mb-2 w-full whitespace-pre border-b pb-2 text-right text-base"
            >
              <span className="text-xs text-gray-600">Balance </span>
              <span className="font-medium text-amber-600">
                {numberFormatter.format(balanceQuery?.data?.uiAmount)}
              </span>
            </button>
          ) : null}
          <div>
            <span className="text-base font-medium text-gray-600">
              You will sell:
            </span>

            <div className="relative mt-2 flex w-full justify-between gap-x-2 sm:mt-1">
              <div className="inline-flex w-32 items-center rounded-md border border-transparent bg-gray-200 px-3 font-medium text-gray-800">
                <Image
                  src={BonkSmall}
                  alt="Bonk"
                  className="mr-2 block size-5 rounded-full object-contain"
                />
                BONK
              </div>

              <input
                type="number"
                step="any"
                inputMode="numeric"
                {...register("swapAmount", {
                  required: true,
                  validate: {
                    notEnoughTokens: (value) =>
                      balanceQuery.data?.uiAmount
                        ? value <= balanceQuery?.data?.uiAmount ||
                          "Not enough Bonk"
                        : true,
                  },
                })}
                placeholder="0.00"
                className={cn(
                  "block grow rounded-md border-none border-transparent bg-gray-200 text-right font-medium text-gray-600",
                  "rounded-md px-3 py-2 placeholder:font-medium placeholder:text-gray-400",
                  "focus:outline-none focus:ring-0 sm:text-base",
                )}
              />
            </div>
            <span className="text-sm text-red-600">
              {errors?.swapAmount?.message}
            </span>
          </div>

          {/* Price quote */}

          <div className="mt-6">
            <div className="flex w-full flex-wrap items-center justify-between">
              <span className="text-base font-medium text-gray-600">
                You will receive:
              </span>
            </div>
            <div className="pointer-events-none relative mt-2 flex h-10 w-full items-center justify-between rounded-md bg-gray-200 px-3 shadow-sm sm:mt-1">
              <div className="inline-flex items-center">
                <Image
                  src="/sol_coin.png"
                  alt=""
                  className="rounded-full"
                  height={20}
                  width={20}
                />
                <span className="pl-2 font-medium tracking-wider">SOL</span>
              </div>
              <div className="inline-flex items-center gap-x-2">
                {isFetchingQuote && (
                  <SpinnerIcon className="h-5 w-5 animate-spin text-gray-500" />
                )}
                <span className="font-medium text-gray-600">
                  {quoteQuery.data
                    ? formatNumber.format(
                        lamportsToSol(
                          parseFloat(quoteQuery.data?.outAmount || ""),
                        ),
                        5,
                      )
                    : "0.00"}
                </span>
              </div>
            </div>
          </div>

          <div className="my-2 grid w-full grid-cols-3 gap-x-2">
            {[0.1, 0.5, 1].map((amount) => (
              <button
                key={amount}
                type="button"
                // onClick={handleSolClick(amount)}
                className={cn(
                  "rounded-xl bg-gray-200 px-1.5 py-0.5 font-medium text-gray-500 transition-colors duration-150 hover:bg-amber-500 hover:text-white",
                )}
              >
                {amount} SOL
              </button>
            ))}
          </div>

          <div className="mt-6 flex w-full gap-x-2">
            <Select defaultValue={slippages[2]}>
              <Select.Button className="group h-full flex-grow-0 rounded-md bg-amber-500 px-3 text-white hover:bg-amber-600">
                {({ open }) => (
                  <CogIcon
                    className={cn(
                      "h-6 w-6 transition-transform duration-200 group-hover:rotate-90",
                      open && "rotate-90",
                    )}
                  />
                )}
              </Select.Button>
              <Select.Options>
                <div className="px-2 text-left text-sm text-gray-500">
                  Slippage
                </div>
                {slippages.map((slippage, i) => (
                  <Select.Option
                    key={i}
                    value={slippage}
                    className={({ selected, active }) =>
                      cn(
                        "cursor-pointer rounded-full px-3",
                        selected && "bg-amber-500 text-white",
                        active && !selected && "bg-amber-500/30",
                      )
                    }
                  >
                    {slippage.label}
                  </Select.Option>
                ))}
              </Select.Options>
            </Select>
            {publicKey ? (
              <button
                type="submit"
                disabled={isSwapping}
                className="inline-flex flex-auto items-center justify-center rounded-md bg-amber-500 px-2 py-2 font-medium text-white hover:bg-amber-600 disabled:bg-amber-600"
              >
                <ChevronRightIcon className="-ml-1 h-5 w-5 text-white" />
                Submit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setVisible(true)}
                className="inline-flex flex-auto items-center justify-center rounded-md bg-amber-500 px-2 py-2 font-medium text-white hover:bg-amber-600 disabled:bg-amber-600"
              >
                Connect wallet
              </button>
            )}
          </div>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://station.jup.ag/docs"
            className="mt-1 text-right text-sm text-gray-600 hover:underline"
          >
            Swap is powered by Jupiter
          </a>
        </form>
      </div>
    </div>
  );
}
