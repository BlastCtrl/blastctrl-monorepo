import { InputMultiline, notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { useKitClient } from "@/connector/use-kit-client";
import {
  fetchTokenMetadatas,
  removeFromCollectionInstructions,
} from "@/lib/solana/metaplex-token-metadata";
import { zipMap } from "@/lib/utils";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { address } from "@solana/kit";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { BatchStatus } from "./batch-status";
import {
  collectionsOf,
  invalidMintLine,
  NFTS_PER_REMOVE_TRANSACTION,
  parseMintList,
  planRemoveFromCollection,
  type SkippedNft,
} from "./collection-plan";
import {
  confirmedItems,
  notifySendFailure,
  useCollectionBatches,
} from "./use-collection-batches";

type FormData = {
  nftList: string;
};

export const RemoveFrom = () => {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();
  const [isWorking, setIsWorking] = useState(false);
  const [skipped, setSkipped] = useState<SkippedNft[]>([]);
  const { batches, send, reset } = useCollectionBatches(
    (wallet, { mint, collection }) =>
      removeFromCollectionInstructions(wallet, mint, collection),
    NFTS_PER_REMOVE_TRANSACTION,
  );

  const submit = async (data: FormData) => {
    if (!client) {
      setOpen(true);
      return;
    }
    setIsWorking(true);
    reset();
    setSkipped([]);
    try {
      const mints = parseMintList(data.nftList).map(address);
      const nfts = zipMap(
        mints,
        await fetchTokenMetadatas(client.rpc, mints),
        (mint, metadata) => ({ mint, metadata }),
      );
      // Who may unverify depends on each collection's own update authority.
      const collectionMints = collectionsOf(nfts);
      const collections = new Map(
        zipMap(
          collectionMints,
          await fetchTokenMetadatas(client.rpc, collectionMints),
          (mint, metadata) => [mint, metadata] as const,
        ),
      );
      const plan = planRemoveFromCollection(
        client.payer.address,
        nfts,
        collections,
      );
      setSkipped(plan.skipped);
      if (plan.items.length === 0) {
        notify({
          type: "info",
          title: "Nothing to remove",
          description: "None of these NFTs can be taken out of a collection.",
        });
        return;
      }

      const confirmed = confirmedItems(await send(client, plan.items));
      notify(
        confirmed === plan.items.length
          ? {
              type: "success",
              title: "Removed from collection",
              description: `${confirmed} NFTs removed from their collection`,
            }
          : {
              type: "error",
              title: "Some transactions failed",
              description: `${confirmed} of ${plan.items.length} NFTs were removed`,
            },
      );
    } catch (err) {
      notifySendFailure(err, "Remove from collection error");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white px-4 pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow-sm">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="mb-4 font-display text-3xl font-semibold">
          Remove from collection
        </h1>
        <p className="text-sm text-gray-500">
          Enter a list of NFTs that you wish to remove from their collection.
          You need to be the{" "}
          <a
            className="text-blue-500"
            target="_blank"
            rel="noreferrer"
            href="https://developers.metaplex.com/token-metadata/collections"
          >
            update authority
          </a>{" "}
          of the collection. The NFTs keep their collection key, marked
          unverified. Every transaction is signed in one go.
        </p>
      </div>
      <form onSubmit={handleSubmit(submit)}>
        <div className="my-4 flex flex-col gap-y-4">
          <InputMultiline
            className="w-full"
            rows={10}
            label="NFT addresses"
            description="Mint addresses, each on its own line"
            {...register("nftList", {
              required: true,
              validate: (value) => {
                const invalid = invalidMintLine(value);
                return !invalid || `Not a valid address: ${invalid}`;
              },
            })}
            error={errors?.nftList}
          />
        </div>
        <div className="my-4 flex items-center justify-end py-2">
          <Button color="indigo" type="submit" disabled={isWorking}>
            {isWorking && (
              <SpinnerIcon className="mr-1 -ml-1 inline h-5 w-5 animate-spin" />
            )}
            {client ? "Remove from collection" : "Connect your wallet"}
          </Button>
        </div>
      </form>
      <BatchStatus batches={batches} skipped={skipped} />
    </div>
  );
};
