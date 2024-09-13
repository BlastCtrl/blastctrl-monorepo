"use client";

import { notify } from "@/components";
import { useDebounce } from "@/lib/hooks/use-debounce";
import * as Octane from "@/lib/octane";
import { lamportsToSol } from "@/lib/solana/common";
import { formatNumber, numberFormatter } from "@/lib/utils";
import { useJupQuery } from "@/state/queries/use-jup-quote";
import { useTokenBalance } from "@/state/queries/use-token-balance";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Button } from "@blastctrl/ui";
import { ChevronRightIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { WalletSignTransactionError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { VersionedTransaction } from "@solana/web3.js";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Popover, PopoverButton, PopoverPanel } from "./_components/popover";
import { TokenQuote } from "./_components/token-quote";
import { TokenSelectPanel } from "./_components/token-select-panel";
import { useQueryClient } from "@tanstack/react-query";
import { jupTokensQuery } from "@/state/queries/use-jup-tokens";

type FormData = {
  swapAmount: number;
  slippage: number;
};

type SelectToken = {
  name: string;
  decimals: number;
  symbol: string;
  address: string;
};

export default function GaslessSwap() {
  const { network } = useNetworkConfigurationStore();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
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
  const debouncedSwapAmount = useDebounce(swapAmount, 400);
  const [selectToken, setSelectToken] = useState<SelectToken | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const balanceQuery = useTokenBalance(selectToken?.address ?? "");
  const quoteQuery = useJupQuery({
    inputMint: selectToken?.address ?? "",
    amount: selectToken
      ? debouncedSwapAmount * Math.pow(10, selectToken?.decimals)
      : 0,
  });
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  const prefetchJupTokens = () => {
    void queryClient.prefetchQuery(jupTokensQuery(publicKey?.toString() ?? ""));
  };

  const submitSwap = async (data: FormData) => {
    if (!selectToken || !publicKey || !signTransaction) return;
    const { swapAmount, slippage } = data;
    const amountAsDecimals = Math.floor(
      swapAmount * 10 ** selectToken.decimals,
    );

    let transaction: VersionedTransaction;

    setIsSwapping(true);
    try {
      const swap = await Octane.buildWhirlpoolsSwapTransaction(
        publicKey,
        selectToken.address,
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

    const id = notify({
      type: "loading",
      description: "Confirming transaction",
    });
    try {
      const signature = await sendTransaction(transaction, connection);
      const { value } = await connection.getLatestBlockhashAndContext();
      const res = await connection.confirmTransaction(
        { signature, ...value },
        "confirmed",
      );

      if (res.value.err) {
        throw Error("Error while confirming swap");
      }

      notify(
        {
          type: "success",
          title: `${selectToken.name} Swap Success`,
          txid: signature,
        },
        id,
      );
    } catch (err: any) {
      if (err instanceof WalletSignTransactionError) return;
      notify(
        { type: "error", title: "Swap Error", description: err?.message },
        id,
      );
    } finally {
      setIsSwapping(false);
      void balanceQuery.refetch();
    }
  };

  if (network === "devnet") {
    return (
      <div className="mx-auto text-lg">
        This page is only available on mainnet! Switch your network in the
        wallet menu 👉
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg overflow-visible bg-white px-4 py-4 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <div className="border-b border-gray-200 pb-6">
        <h1 className="font-display mb-4 text-center text-3xl font-semibold">
          Gasless Swap
        </h1>
        <p className="mx-4 text-sm text-gray-500">
          Dive deeper into Solana&apos;s DeFi with our Gasless Swap tool! If you
          have a wallet that has no SOL, but owns any token that can be traded
          on the Jupiter Swap aggregator, you can swap it for SOL here! <br />
          <br />
          Just connect your wallet, enter the swap amount and we&apos;ll fund
          your trade for you.
          <br />
          <br />
          You can swap $BONK with our{" "}
          <Link
            href="/gasless-bonk-swap"
            className="whitespace-nowrap font-medium text-blue-600 hover:underline"
          >
            gasless BONK Swap utility &rarr;
          </Link>
        </p>
      </div>

      <form
        onSubmit={handleSubmit(submitSwap)}
        className="mx-auto flex w-[95%] flex-1 flex-col justify-start sm:w-4/5"
      >
        <button
          aria-disabled={balanceQuery.status !== "success"}
          onClick={() => {
            if (balanceQuery.data?.uiAmount) {
              setValue("swapAmount", Number(balanceQuery.data.uiAmount));
            }
          }}
          className="w-full whitespace-pre py-2 text-right text-base"
        >
          <span className="text-xs text-gray-600">Balance </span>
          {balanceQuery.data?.uiAmount ? (
            <span className="font-medium text-indigo-600">
              {numberFormatter.format(balanceQuery.data.uiAmount)}
            </span>
          ) : (
            <span className="font-medium">0</span>
          )}
        </button>

        <div>
          <span className="block font-medium text-gray-600">
            You will sell:
          </span>
          <div className="mt-2 flex gap-x-2 sm:mt-1">
            <Popover as="div" className="relative xs:w-32">
              <PopoverButton
                onMouseEnter={prefetchJupTokens}
                className="inline-flex size-full items-center justify-between rounded-md border border-transparent bg-gray-200 px-3 font-medium text-gray-800"
              >
                <span className="mr-2 block xs:mr-0">
                  {selectToken?.symbol ?? "Name"}
                </span>
                <ChevronUpDownIcon className="h-4 w-4 text-gray-700" />
              </PopoverButton>
              <PopoverPanel>
                <TokenSelectPanel onSelect={(token) => setSelectToken(token)} />
              </PopoverPanel>
            </Popover>
            <input
              type="number"
              step="any"
              inputMode="numeric"
              autoComplete="off"
              {...register("swapAmount", {
                required: true,
                validate: {
                  notEnoughTokens: (value) =>
                    balanceQuery.data?.uiAmount
                      ? value <= balanceQuery.data.uiAmount ||
                        `Not enough ${selectToken?.name}`
                      : true,
                },
              })}
              placeholder="0.00"
              className="min-w-0 grow rounded-md border-transparent bg-gray-200 text-right font-medium text-gray-600 placeholder:text-gray-400 focus:outline-none focus:ring-0"
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
                unoptimized={true}
                src="/sol_coin.png"
                alt=""
                className="rounded-full"
                height={20}
                width={20}
              />
              <span className="pl-2 font-medium tracking-wider text-gray-500">
                SOL
              </span>
            </div>
            <div className="inline-flex items-center gap-x-2">
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

        <TokenQuote quoteToken={selectToken} />

        <div className="mt-6 flex w-full gap-x-2">
          {publicKey ? (
            <Button
              color="indigo"
              type="submit"
              className="w-full"
              disabled={isSwapping}
            >
              <ChevronRightIcon className="size-5 text-white" />
              Submit
            </Button>
          ) : (
            <Button
              color="indigo"
              type="button"
              className="w-full"
              onClick={() => setVisible(true)}
            >
              Connect your wallet
            </Button>
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
  );
}
