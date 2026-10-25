"use client";

import { InputGroup, InputMultiline, notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useArweaveUploader } from "@/lib/hooks/use-arweave-uploader";
import { uploadNftMetadata } from "@/lib/solana/metaplex-json-metadata";
import { getCreateV1Instruction } from "@blastctrl/mpl-core";
import { Button, Checkbox, SpinnerIcon } from "@blastctrl/ui";
import { generateKeyPairSigner } from "@solana/kit";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { MediaFiles } from "./_components/media-files";

export type CreateFormInputs = {
  name: string;
  description: string;
  external_url: string;
  uri: string;
  image: File | null;
  animation_url: File | null;
};

export default function Mint() {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const upload = useArweaveUploader();
  const [isConfirming, setIsConfirming] = useState(false);
  const [createJson, setCreateJson] = useState(true);

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
      uri: "",
    },
  });

  const submit = async (data: CreateFormInputs) => {
    if (!client || !upload) {
      setOpen(true);
      return;
    }

    setIsConfirming(true);
    try {
      // The uploader's toasts report a failed upload; stop quietly after one.
      const uri = createJson
        ? await uploadNftMetadata(data, upload).catch(() => null)
        : data.uri;
      if (uri === null) return;

      // The wallet pays and, by the program's defaults, owns the asset and
      // is its update authority. The asset keypair signs with the wallet.
      const asset = await generateKeyPairSigner();
      const result = await client.sendTransaction([
        getCreateV1Instruction({
          asset,
          payer: client.payer,
          name: data.name,
          uri,
        }),
      ]);

      notify({
        title: "NFT mint successful",
        description: (
          <>
            The <span className="font-medium text-blue-300">{data.name}</span>{" "}
            NFT has been minted to your wallet.
          </>
        ),
        type: "success",
        txid: result.context.signature,
      });
    } catch (err) {
      console.log({ err });
      notify({
        type: "error",
        title: "Error minting",
        description: transactionErrorMessage(err),
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white px-4 pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow-sm">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="mb-4 font-display text-3xl font-semibold">
          NFT minting
        </h1>
        <p className="text-sm text-gray-500">
          Enter the on-chain values you wish your NFT to have. It will be minted
          to your wallet, with your address as its update authority.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(submit)}
        className="divide-y divide-gray-200 *:not-last:pb-8"
      >
        <div>
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Basic Information
            </h3>
            <div className="relative flex items-start">
              <div className="flex h-5 items-center">
                <Checkbox
                  id="use-json"
                  name="use-json"
                  checked={!createJson}
                  onChange={() => {
                    setCreateJson((prev) => !prev);
                  }}
                  className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
            <div className="sm:col-span-6">
              <InputGroup
                label="Name"
                type="text"
                {...register("name", { required: true })}
                error={errors?.name}
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
              {...register("uri", { shouldUnregister: createJson })}
              error={errors?.uri}
            />
          </div>
        </div>

        {createJson && (
          <>
            <div>
              <div className="mt-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Image and Files
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Image that represents your NFT and an additional file that
                  will be associated with it. All files are uploaded to Arweave
                  via Turbo.
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
              // className="bg-secondary hover:bg-secondary-focus focus:ring-secondary-focus inline-flex items-center rounded-md px-4 py-2 text-base text-gray-50 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-offset-2"
            >
              {isConfirming ? (
                <>
                  <SpinnerIcon className="mr-2 -ml-1 h-5 w-5 animate-spin" />
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
