/* eslint-disable @typescript-eslint/no-unsafe-call */
"use client";

import { InputGroup } from "@/components";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useForm } from "react-hook-form";

import { InputMultiline, notify } from "@/components";
import { IrysStorage } from "@/lib/irys";
import { mimeTypeToCategory } from "@/lib/utils";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { WalletError } from "@solana/wallet-adapter-base";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { MediaFiles } from "./_components/media-files";
import useUmi from "@/lib/hooks/use-umi";
import { generateSigner } from "@metaplex-foundation/umi";
import { setComputeUnitPrice } from "@metaplex-foundation/mpl-toolbox";
import * as base58 from "bs58";
import { useState } from "react";
import { createV1 } from "@metaplex-foundation/mpl-core";

export type CreateFormInputs = {
  name: string;
  symbol: string;
  description: string;
  external_url: string;
  uri: string;
  image: File | null;
  animation_url: File | null;
};

export default function Mint() {
  const { network } = useNetworkConfigurationStore();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [isConfirming, setIsConfirming] = useState(false);
  const [createJson, setCreateJson] = useState(true);
  const umi = useUmi();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue,
    watch,
  } = useForm<CreateFormInputs>({
    mode: "onSubmit",
    defaultValues: {
      name: "",
      symbol: "",
      uri: "",
    },
  });

  const submit = async (data: CreateFormInputs) => {
    if (!wallet.publicKey) {
      setVisible(true);
      return;
    }

    if (!wallet.signMessage) {
      notify({
        title: "Error",
        description: "Selected wallet doesn't support signing messages",
      });
      return setVisible(true);
    }

    // Setup
    setIsConfirming(true);

    const irys = await IrysStorage.makeWebIrys(network, wallet);

    // Check if we are uploading a json file
    let jsonUrl: string;

    try {
      if (createJson) {
        notify({
          title: "Uploading external metadata",
          description:
            "The metadata JSON file is being uploaded to Arweave via Irys. This will require multiple wallet confirmations, including payment and signature verification.",
        });

        // Check if we're also uploading media files
        const { image, animation_url } = data;
        let imageUrl: string | undefined;
        let animationUrl: string | undefined;

        try {
          if (image)
            imageUrl = `https://arweave.net/${(await irys.uploadFile(image)).id}`;
          if (animation_url)
            animationUrl = `https://arweave.net/${(await irys.uploadFile(animation_url)).id}`;
        } catch (err: any) {
          setIsConfirming(false);
          return notify({
            type: "error",
            title: "File upload error",
            description: (
              <div className="break-normal">
                <p>
                  There has been an error while uploading with the message:{" "}
                  <span className="break-all font-medium text-yellow-300">
                    {err?.message}
                  </span>
                  .
                </p>
                <p className="mt-2">
                  You can recover any lost funds on the{" "}
                  <Link
                    href="/permanent-storage-tools/file-upload"
                    className="font-medium text-blue-300"
                  >
                    /permanent-storage-tools
                  </Link>{" "}
                  page.
                </p>
              </div>
            ),
          });
        }
        const category = animation_url
          ? mimeTypeToCategory(animation_url)
          : image
            ? mimeTypeToCategory(image)
            : undefined;

        const { name, symbol, description, external_url } = data;
        const json = {
          name,
          symbol,
          description,
          external_url,
        };

        const files: Array<{ type?: string; uri: string }> = [];
        if (imageUrl) {
          Object.assign(json, { image: imageUrl });
          files.push({ uri: imageUrl, type: image?.type });
        }

        if (animationUrl) {
          Object.assign(json, { animation_url: animationUrl });
          files.push({ uri: animationUrl, type: animation_url?.type });
        }
        if (files.length > 0)
          Object.assign(json, { properties: { category, files } });

        const metadata = new File([JSON.stringify(json)], data.name, {
          type: "application/json",
        });

        jsonUrl = `https://arweave.net/${(await irys.uploadFile(metadata)).id}`;
      } else {
        jsonUrl = data.uri;
      }

      const { name } = data;

      const { signature } = await createV1(umi, {
        asset: generateSigner(umi),
        name,
        uri: jsonUrl,
      })
        // .add(setComputeUnitLimit(umi, { units: 1_000_000 }))
        .add(setComputeUnitPrice(umi, { microLamports: 1_000_000 }))
        .sendAndConfirm(umi);

      console.log(base58.encode(signature));
      notify({
        title: "NFT mint successful",
        description: (
          <>
            The <span className="font-medium text-blue-300">{name}</span> NFT
            has been minted to your wallet.
          </>
        ),
        type: "success",
        txid: base58.encode(signature),
      });
    } catch (err: any) {
      if (err instanceof WalletError) {
        // The onError callback in the walletconnect context will handle it
        return;
      }
      console.log({ err });
      console.log(await err.getLogs());
      notify({
        type: "error",
        title: "Error minting",
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
          NFT minting
        </h1>
        <p className="text-sm text-gray-500">
          Enter the on-chain values you wish your NFT to have. It will be minted
          to your wallet, with your address as its update authority.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(submit)}
        className="space-y-8 divide-y divide-gray-200"
      >
        <div>
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Basic Information
            </h3>
            <div className="relative flex items-start">
              <div className="flex h-5 items-center">
                <input
                  id="use-json"
                  name="use-json"
                  type="checkbox"
                  checked={!createJson}
                  onChange={() => {
                    setCreateJson((prev) => !prev);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="use-json" className="font-medium text-gray-700">
                  Already have a <code>JSON</code> file?
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <InputGroup
                label="Name"
                type="text"
                {...register("name", {
                  maxLength: {
                    value: 32,
                    message: "Max name length is 32",
                  },
                  required: true,
                })}
                error={errors?.name}
              />
            </div>

            <div className="sm:col-span-2">
              <InputGroup
                label="Symbol"
                type="text"
                {...register("symbol", {
                  maxLength: {
                    value: 10,
                    message: "Max symbol length is 10",
                  },
                })}
                error={errors?.symbol}
              />
            </div>

            <InputMultiline
              className={`sm:col-span-6 ${createJson ? "block" : "hidden"}`}
              label="Description"
              rows={2}
              {...register("description", { shouldUnregister: !createJson })}
              error={errors?.description}
            />

            <InputGroup
              className={`sm:col-span-6 ${createJson ? "block" : "hidden"}`}
              label="External URL"
              type="text"
              description="Link to your homepage or a gallery"
              {...register("external_url", { shouldUnregister: !createJson })}
              error={errors?.external_url}
            />

            <InputGroup
              className={`sm:col-span-6 ${!createJson ? "block" : "hidden"}`}
              label="URI"
              description="Use an existing link to a metadata file"
              type="text"
              {...register("uri", {
                maxLength: {
                  value: 200,
                  message: "Max URI length is 200",
                },
                shouldUnregister: createJson,
              })}
              error={errors?.uri}
            />
          </div>
        </div>

        {createJson && (
          <>
            <div>
              <div className="mt-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Image and Files
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Image that represents your NFT and an additional file that
                  will be associated with it. All files are uploaded to Arweave
                  via Irys.
                </p>
              </div>
              <MediaFiles watch={watch} setValue={setValue} />
            </div>
          </>
        )}

        <div className="pt-5">
          <div className="flex justify-end gap-2">
            <Button
              plain
              onClick={() => {
                reset();
              }}
              type="button"
            >
              Clear inputs
            </Button>
            <Button
              type="submit"
              color="indigo"
              disabled={isConfirming}
              // className="bg-secondary hover:bg-secondary-focus focus:ring-secondary-focus inline-flex items-center rounded-md px-4 py-2 text-base text-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              {isConfirming ? (
                <>
                  <SpinnerIcon className="-ml-1 mr-2 h-5 w-5 animate-spin" />
                  Confirming
                </>
              ) : (
                "Mint"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
