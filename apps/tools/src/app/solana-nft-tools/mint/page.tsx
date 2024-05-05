"use client";

import { InputGroup } from "@/components";
import { isPublicKey } from "@/lib/solana/common";
import {
  PlusCircleIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import type { CreateNftInput, JsonMetadata } from "@metaplex-foundation/js";
import {
  Metaplex,
  toBigNumber,
  walletAdapterIdentity,
} from "@metaplex-foundation/js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { InputMultiline, notify } from "@/components";
import { IrysStorage } from "@/lib/irys";
import { mimeTypeToCategory } from "@/lib/utils";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { Switch } from "@headlessui/react";
import { WalletError } from "@solana/wallet-adapter-base";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Attributes } from "./_components/attributes";
import { MediaFiles } from "./_components/media-files";

const MAX_CREATORS = 5;

type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

export type CreateFormInputs = {
  name: string;
  symbol: string;
  description: string;
  external_url: string;
  uri: string;
  updateAuthority: string;
  isMutable: boolean;
  primarySaleHappened: boolean;
  image: File | null;
  animation_url: File | null;
  attributes: {
    trait_type: string;
    value: string;
  }[];
  creators: {
    address: string;
    share: number;
  }[];
  sellerFeePercentage: number;
  isCollection: boolean;
  collectionIsSized: boolean;
  maxSupply: number;
};

export default function Mint() {
  const { connection } = useConnection();
  const { network } = useNetworkConfigurationStore();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const params = useSearchParams();
  const [isConfirming, setIsConfirming] = useState(false);
  const [createJson, setCreateJson] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, dirtyFields },
    setValue,
    watch,
    setFocus,
  } = useForm<CreateFormInputs>({
    mode: "onSubmit",
    defaultValues: {
      name: "",
      symbol: "",
      uri: "",
      isMutable: true,
      primarySaleHappened: false,
      creators: [],
      sellerFeePercentage: 0,
      isCollection: false,
      collectionIsSized: false,
      maxSupply: 0,
    },
  });
  const watchedIsCollection = watch("isCollection");

  const { fields, append, remove } = useFieldArray({
    control,
    name: "creators",
    rules: {
      maxLength: MAX_CREATORS,
      minLength: 0,
    },
  });

  const isCreatorAddable = fields.length < MAX_CREATORS;

  useEffect(() => {
    const isCollection = params.get("isCollection");
    const collectionIsSized = params.get("collectionIsSized");

    if (isCollection) {
      setValue("isCollection", true);
      setFocus("isCollection");
      window.scrollBy(0, 200);
    }
    if (collectionIsSized) {
      setValue("collectionIsSized", true);
    }
  }, [params, setValue, setFocus]);

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
    const metaplex = Metaplex.make(connection).use(
      walletAdapterIdentity(wallet),
    );
    const irys = await IrysStorage.makeWebIrys(network, wallet);

    // Check if we are uploading a json file
    let jsonUrl: string;
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

      const { name, symbol, description, attributes, external_url } = data;
      const json: JsonMetadata<string> = {
        name,
        symbol,
        description,
        external_url,
      };
      const files: Array<{ type?: string; uri: string }> = [];
      if (attributes) Object.assign(json, { attributes });
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

      const { uri } = await metaplex.nfts().uploadMetadata(json);
      jsonUrl = uri;
    } else {
      jsonUrl = data.uri;
    }

    const {
      name,
      symbol,
      isMutable,
      isCollection,
      collectionIsSized,
      maxSupply,
    } = data;
    const createNftInput: CreateNftInput = {
      name,
      symbol,
      uri: jsonUrl,
      isMutable,
      isCollection,
      collectionIsSized,
      maxSupply: toBigNumber(maxSupply),
      creators: dirtyFields.creators
        ? data.creators.map(({ address, share }) => ({
            address: new PublicKey(address),
            share,
            authority:
              address === wallet.publicKey?.toBase58()
                ? (wallet as NonNullableFields<WalletContextState>)
                : undefined,
          }))
        : undefined,
      sellerFeeBasisPoints: dirtyFields.sellerFeePercentage
        ? data.sellerFeePercentage * 100
        : 0,
    };

    try {
      const { response } = await metaplex.nfts().create(createNftInput);
      console.log(response);
      notify({
        title: "NFT mint successful",
        description: (
          <>
            The <span className="font-medium text-blue-300">{name}</span> NFT
            has been minted to your wallet.
          </>
        ),
        type: "success",
        txid: response.signature,
      });
    } catch (err: any) {
      if (err instanceof WalletError) {
        // The onError callback in the walletconnect context will handle it
        return;
      }
      console.log({ err });
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

            <div className="sm:col-span-6">
              <label
                htmlFor="maxSupply"
                className="flex items-end gap-x-2 text-sm"
              >
                <span className="font-medium text-gray-700">Max supply</span>
                <span className="text-xs font-normal text-gray-500">
                  Used for printing editions
                </span>
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="maxSupply"
                  className={cn(
                    "block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                    !!errors.maxSupply &&
                      "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-none focus:ring-red-500",
                  )}
                  aria-invalid={errors.maxSupply ? "true" : "false"}
                  {...register("maxSupply", {
                    min: { value: 0, message: "Minimum is 0" },
                  })}
                />
              </div>
              {errors.maxSupply && (
                <p className="mt-2 text-sm text-red-600">
                  {errors.maxSupply.message}
                </p>
              )}
            </div>
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

            <div>
              <div className="mt-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Attributes
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Attributes appended to the external metadata of your NFT.
                </p>
              </div>
              <Attributes control={control} register={register} />
            </div>
          </>
        )}

        <div>
          <div className="mt-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Creators
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              There can be up to 5 creators. The shares must add up to 100.
              Creators other than yourself will be unverified.
              <a
                href="https://docs.metaplex.com/programs/token-metadata/accounts#creators"
                rel="noreferrer"
                target="_blank"
              >
                <QuestionMarkCircleIcon className="ml-1 inline h-4 w-4 text-gray-400" />
              </a>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <div className="flex flex-col gap-y-2">
                {fields.map((field, idx) => (
                  <fieldset key={field.id}>
                    <legend className="sr-only">
                      Creator address and share
                    </legend>
                    <div className="mt-1 -space-y-px rounded-md bg-white shadow-sm">
                      <div className="grid grid-cols-9 -space-x-px">
                        {idx === 0 && (
                          <>
                            <span className="col-span-6 mb-1 pl-1 text-sm text-gray-600">
                              Creator address
                            </span>
                            <span className="col-span-3 mb-1 pl-1 text-sm tracking-tight text-gray-600">
                              Royalties share
                            </span>
                          </>
                        )}
                        <div className="col-span-6 flex-1">
                          <label htmlFor={`creator-${idx}`} className="sr-only">
                            Creator
                          </label>
                          <input
                            id={`creator-${idx}`}
                            type="text"
                            {...register(`creators.${idx}.address` as const, {
                              required: true,
                              validate: {
                                pubkey: isPublicKey,
                              },
                            })}
                            defaultValue=""
                            className={cn(
                              "relative block w-full rounded-none rounded-bl-md rounded-tl-md border-gray-300 bg-transparent pr-6",
                              "focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                              errors?.creators?.[idx]?.address &&
                                "border-red-500 focus:border-red-600 focus:ring-red-500",
                            )}
                            placeholder="Creator address"
                          />
                        </div>
                        <div className="col-span-2 flex-1">
                          <label htmlFor={`share-${idx}`} className="sr-only">
                            Share
                          </label>
                          <input
                            id={`share-${idx}`}
                            type="number"
                            {...register(`creators.${idx}.share` as const, {
                              required: true,
                              min: 0,
                              max: 100,
                            })}
                            className={cn(
                              "relative block w-full rounded-none border-gray-300 bg-transparent",
                              "focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                              errors?.creators?.[idx]?.share &&
                                "border-red-500 focus:border-red-600 focus:ring-red-500",
                            )}
                            placeholder="Share"
                          />
                        </div>
                        <div className="col-span-1">
                          <label htmlFor={`remove-${idx}`} className="sr-only">
                            Remove creator
                          </label>
                          <button
                            id={`remove-${idx}`}
                            className="inline-flex h-full w-full items-center justify-center rounded-none rounded-br-md rounded-tr-md border border-gray-300 bg-red-500"
                            type="button"
                            onClick={() => remove(idx)}
                          >
                            <XMarkIcon className="h-5 w-5 font-semibold text-white" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </fieldset>
                ))}
                <div className="mt-2">
                  {isCreatorAddable && (
                    <Button
                      color="indigo"
                      onClick={() => append({ address: "", share: 0 })}
                      type="button"
                      className="h-10 w-full"
                    >
                      Add Creator
                      <PlusCircleIcon
                        className="-mr-1 ml-3 h-5 w-5"
                        aria-hidden="true"
                      />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <InputGroup
              className="sm:col-span-4"
              label="Royalties"
              description={<>(in percentages)</>}
              leading="%"
              type="number"
              placeholder="100.00"
              step={0.01}
              {...register("sellerFeePercentage", {
                min: {
                  value: 0,
                  message: "Royalties must be between 0 and 100%",
                },
                max: {
                  value: 100,
                  message: "Royalties must be between 0 and 100%",
                },
                valueAsNumber: true,
                required: true,
              })}
              error={errors?.sellerFeePercentage}
            />
          </div>
        </div>

        <div>
          <div className="mt-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Flags
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Flags control certain properties of your token.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <div className="sm:col-span-5">
              <Switch.Group
                as="div"
                className="flex items-center justify-between"
              >
                <span className="flex flex-grow flex-col">
                  <Switch.Label
                    as="span"
                    className="text-sm font-medium text-gray-900"
                    passive
                  >
                    Is mutable
                  </Switch.Label>
                  <Switch.Description
                    as="span"
                    className="text-sm text-gray-500"
                  >
                    If this flag is changed to false, it wont be possible to
                    change the metadata anymore.
                  </Switch.Description>
                </span>
                <Controller
                  control={control}
                  name="isMutable"
                  render={({ field: { value, ...rest } }) => (
                    <Switch
                      {...rest}
                      className={cn(
                        value ? "bg-indigo-600" : "bg-gray-200",
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          value ? "translate-x-5" : "translate-x-0",
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        )}
                      />
                    </Switch>
                  )}
                />
              </Switch.Group>
            </div>

            <div className="sm:col-span-5">
              <Switch.Group
                as="div"
                className="flex items-center justify-between"
              >
                <span className="flex flex-grow flex-col">
                  <Switch.Label
                    as="span"
                    className="text-sm font-medium text-gray-900"
                    passive
                  >
                    Is Collection
                  </Switch.Label>
                  <Switch.Description
                    as="span"
                    className="text-sm text-gray-500"
                  >
                    Does this token represent a collection NFT?
                    <a
                      href="https://docs.metaplex.com/programs/token-metadata/certified-collections"
                      rel="noreferrer"
                      target="_blank"
                    >
                      <QuestionMarkCircleIcon className="mb-0.5 ml-2 inline h-4 w-4 text-gray-400" />
                    </a>
                  </Switch.Description>
                </span>
                <Controller
                  control={control}
                  name="isCollection"
                  rules={{
                    onChange: (e) =>
                      !e.target.value && setValue("collectionIsSized", false),
                  }}
                  render={({ field: { value, ...rest } }) => (
                    <Switch
                      {...rest}
                      className={cn(
                        value ? "bg-indigo-600" : "bg-gray-200",
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          value ? "translate-x-5" : "translate-x-0",
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        )}
                      />
                    </Switch>
                  )}
                />
              </Switch.Group>
            </div>

            <div className="sm:col-span-5">
              <Switch.Group
                as="div"
                className="flex items-center justify-between"
              >
                <span className="flex flex-grow flex-col">
                  <Switch.Label
                    as="span"
                    className="text-sm font-medium text-gray-900"
                    passive
                  >
                    Is a sized collection
                  </Switch.Label>
                  <Switch.Description
                    as="span"
                    className="text-sm text-gray-500"
                  >
                    Is this a &quot;sized&quot; collection NFT?
                    <a
                      href="https://docs.metaplex.com/programs/token-metadata/certified-collections"
                      rel="noreferrer"
                      target="_blank"
                    >
                      <QuestionMarkCircleIcon className="mb-0.5 ml-2 inline h-4 w-4 text-gray-400" />
                    </a>
                  </Switch.Description>
                </span>

                <Controller
                  control={control}
                  name="collectionIsSized"
                  render={({ field: { value, ...rest } }) => (
                    <Switch
                      {...rest}
                      disabled={!watchedIsCollection}
                      className={cn(
                        value ? "bg-indigo-600" : "bg-gray-200",
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          value ? "translate-x-5" : "translate-x-0",
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        )}
                      />
                    </Switch>
                  )}
                />
              </Switch.Group>
            </div>
          </div>
        </div>

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
