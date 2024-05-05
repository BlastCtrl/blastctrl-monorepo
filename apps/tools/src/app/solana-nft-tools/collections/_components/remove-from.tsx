import { Transaction } from "@solana/web3.js";
import { useState } from "react";

import { ChevronRightIcon } from "@heroicons/react/20/solid";

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  InputMultiline,
  notify,
  notifyManyPromises,
  notifyPromise,
} from "@/components";
import { useWalletConnection } from "@/state/use-wallet-connection";
import type { TxUnverifyData } from "@/app/api/tx/remove-from-collection/route";
import { useForm } from "react-hook-form";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { isPublicKey } from "@/lib/solana/common";
import { fetcher } from "@/lib/utils";
import { Button, SpinnerIcon } from "@blastctrl/ui";

type FormData = {
  nftList: string;
};

export const RemoveFrom = () => {
  const { network } = useNetworkConfigurationStore();
  const { connection, wallet, sendAndConfirmTransaction, signAllTransactions } =
    useWalletConnection();
  const { setVisible } = useWalletModal();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({});
  const [isConfirming, setIsConfirming] = useState(false);

  const onUnverifyItems = async (data: FormData) => {
    if (!wallet) {
      return setVisible(true);
    }

    const nftMints = data.nftList.split("\n").filter(Boolean);

    try {
      // unverify
      setIsConfirming(true);
      const {
        tx: removeCollectionResponse,
        blockhash,
        lastValidBlockHeight,
        minContextSlot,
      } = await fetcher<TxUnverifyData>("/api/tx/remove-from-collection", {
        method: "POST",
        body: JSON.stringify({
          authorityAddress: wallet.toBase58(),
          nftMints,
          network,
        }),
        headers: { "Content-type": "application/json; charset=UTF-8" },
      });

      const transactions = removeCollectionResponse.map((tx) =>
        Transaction.from(Buffer.from(tx, "base64")),
      );

      if (transactions.length > 1) {
        notify({
          type: "info",
          description: `This action requires multiple transactions and will be split into ${transactions.length} batches.`,
        });
      } else if (transactions[0]) {
        return void notifyPromise(sendAndConfirmTransaction(transactions[0]), {
          loading: { description: "Confirming transaction..." },
          success: {
            title: "Remove from collection success",
            description: `${nftMints.length} NFTs removed from collection.`,
          },
          error: (err) => ({
            title: "Error removing from collection",
            description: (
              <div>
                <p className="block">Transaction failed with message: </p>
                <p className="mt-1.5 block">{err?.message}</p>
              </div>
            ),
          }),
        });
      }

      // Request signature from wallet
      // @ts-expect-error: this could error if the wallet doesnt support signAll
      const signed = await signAllTransactions(transactions);
      const txids = await Promise.all(
        signed.map(async (signedTx) => {
          return await connection.sendRawTransaction(signedTx.serialize(), {
            minContextSlot,
          });
        }),
      );

      const promises = txids.map(async (signature) => {
        const { value } = await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });
        if (value.err) throw Error("msg", { cause: "test" });
        return { value };
      });

      const transactionPromises = promises.map((promise, idx) => ({
        label: `SetAndVerify ~ batch ${idx + 1}`,
        txid: txids[idx]!,
        promise,
      }));

      notifyManyPromises({
        title: "Confirming multiple transactions",
        promises: transactionPromises,
      });
    } catch (err: any) {
      notify({
        type: "error",
        title: "Remove from collection Error",
        description: err?.message,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white px-4 pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="font-display mb-4 text-3xl font-semibold">
          Remove from collection
        </h1>
        <p className="text-sm text-gray-500">
          Enter a list of NFTs that you wish to remove from a collection. All
          NFTs should belong to the same on-chain collection and you need to be
          the{" "}
          <a
            className="text-blue-500"
            target="_blank"
            rel="noreferrer"
            href="https://docs.metaplex.com/programs/token-metadata/accounts#metadata"
          >
            update authority
          </a>{" "}
          of both the collection and all the NFTs.
        </p>
      </div>
      <form onSubmit={handleSubmit(onUnverifyItems)}>
        <div className="my-4 flex flex-col gap-y-4">
          <InputMultiline
            className="w-full"
            rows={10}
            label="NFT addresses"
            description="Mint addresses, each in a new line"
            {...register("nftList", {
              required: true,
              validate: (value) => {
                const list = value.split("\n");
                const invalid = list.find((row) => !isPublicKey(row));
                return !invalid || `There is an invalid pubkey: ${invalid}`;
              },
            })}
            error={errors?.nftList}
          />
        </div>
        <div className="my-4 flex items-center justify-end py-2">
          <Button color="indigo" type="submit" disabled={isConfirming}>
            {isConfirming ? (
              <SpinnerIcon className="-ml-1 mr-1 inline h-5 w-5 animate-spin" />
            ) : (
              <ChevronRightIcon className="-ml-1 mr-1 inline h-5 w-5" />
            )}
            Submit
          </Button>
        </div>
      </form>
    </div>
  );
};
