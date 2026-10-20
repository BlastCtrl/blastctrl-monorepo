import { InputGroup, InputMultiline, notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { useKitClient } from "@/connector/use-kit-client";
import { compress } from "@/lib/solana/common";
import {
  addToCollectionInstructions,
  fetchTokenMetadatas,
} from "@/lib/solana/metaplex-token-metadata";
import { zipMap } from "@/lib/utils";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { address, isAddress } from "@solana/kit";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { BatchStatus } from "./batch-status";
import {
  invalidMintLine,
  NFTS_PER_ADD_TRANSACTION,
  parseMintList,
  planAddToCollection,
  type SkippedNft,
} from "./collection-plan";
import {
  confirmedItems,
  notifySendFailure,
  useCollectionBatches,
} from "./use-collection-batches";

type FormData = {
  nftList: string;
  collectionMint: string;
};

export const AddTo = () => {
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
      addToCollectionInstructions(wallet, mint, collection),
    NFTS_PER_ADD_TRANSACTION,
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
      const collection = address(data.collectionMint);
      const mints = parseMintList(data.nftList).map(address);
      const [collectionMetadata = null, ...metadatas] =
        await fetchTokenMetadatas(client.rpc, [collection, ...mints]);
      const plan = planAddToCollection(
        client.payer.address,
        { mint: collection, metadata: collectionMetadata },
        zipMap(mints, metadatas, (mint, metadata) => ({ mint, metadata })),
      );
      setSkipped(plan.skipped);
      if (plan.items.length === 0) {
        notify({
          type: "info",
          title: "Nothing to add",
          description: "None of these NFTs can go into the collection.",
        });
        return;
      }

      const confirmed = confirmedItems(await send(client, plan.items));
      notify(
        confirmed === plan.items.length
          ? {
              type: "success",
              title: "Added to collection",
              description: `${confirmed} NFTs added to ${compress(collection, 4)}`,
            }
          : {
              type: "error",
              title: "Some transactions failed",
              description: `${confirmed} of ${plan.items.length} NFTs were added`,
            },
      );
    } catch (err) {
      notifySendFailure(err, "Add to collection error");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white px-4 pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow-sm">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="mb-4 font-display text-3xl font-semibold">
          Add to collection
        </h1>
        <p className="text-sm text-gray-500">
          Enter a list of NFTs that you wish to add to a collection. You need to
          be the{" "}
          <a
            className="text-blue-500"
            target="_blank"
            rel="noreferrer"
            href="https://developers.metaplex.com/token-metadata/collections"
          >
            update authority
          </a>{" "}
          of both the collection and all the NFTs. Every transaction is signed
          in one go.
        </p>
      </div>
      <form onSubmit={handleSubmit(submit)}>
        <div className="my-4 flex flex-col gap-y-4">
          <InputGroup
            className="w-full"
            type="text"
            label="Collection NFT mint"
            {...register("collectionMint", {
              required: true,
              validate: (value) => isAddress(value) || "Not a valid address",
            })}
            error={errors?.collectionMint}
          />
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
            {client ? "Add to collection" : "Connect your wallet"}
          </Button>
        </div>
      </form>
      <BatchStatus batches={batches} skipped={skipped} />
    </div>
  );
};
