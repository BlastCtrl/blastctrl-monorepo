"use client";

import { InputGroup, InputMultiline, notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useArweaveUploader } from "@/lib/hooks/use-arweave-uploader";
import { uploadNftMetadata } from "@/lib/solana/metaplex-json-metadata";
import { createNftInstructions } from "@/lib/solana/metaplex-token-metadata";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { Switch } from "@headlessui/react";
import {
  PlusCircleIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { address, generateKeyPairSigner, isAddress } from "@solana/kit";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Attributes } from "./_components/attributes";
import { MediaFiles } from "./_components/media-files";

const MAX_CREATORS = 5;

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
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const upload = useArweaveUploader();
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
    if (!client || !upload) {
      setOpen(true);
      return;
    }

    // The program rejects other totals; check before paying for uploads.
    const shareTotal = data.creators.reduce((sum, { share }) => sum + share, 0);
    if (data.creators.length > 0 && shareTotal !== 100) {
      setFocus("creators.0.share");
      notify({
        type: "error",
        description: "Creator total shares must equal 100.",
      });
      return;
    }

    setIsConfirming(true);
    try {
      // The uploader's toasts report a failed upload; stop quietly after one.
      const uri = createJson
        ? await uploadNftMetadata(data, upload).catch(() => null)
        : data.uri;
      if (uri === null) return;

      const wallet = client.payer.address;
      const mint = await generateKeyPairSigner();
      const { name, symbol, isMutable, isCollection, collectionIsSized } = data;
      const sellerFeePercentage =
        dirtyFields.sellerFeePercentage &&
        Number.isFinite(data.sellerFeePercentage)
          ? data.sellerFeePercentage
          : 0;

      const result = await client.sendTransaction(
        createNftInstructions(wallet, mint, {
          name,
          symbol,
          uri,
          isMutable,
          isCollection: isCollection && collectionIsSized,
          maxSupply: data.maxSupply,
          sellerFeeBasisPoints: Math.round(sellerFeePercentage * 100),
          // Only the wallet can vouch for itself; everyone else stays unverified.
          creators: dirtyFields.creators
            ? data.creators.map((creator) => ({
                address: address(creator.address),
                share: creator.share,
                verified: creator.address === wallet,
              }))
            : undefined,
        }),
      );

      notify({
        title: "NFT mint successful",
        description: (
          <>
            The <span className="font-medium text-blue-300">{name}</span> NFT
            has been minted to your wallet.
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
                <input
                  id="use-json"
                  name="use-json"
                  type="checkbox"
                  checked={!createJson}
                  onChange={() => {
                    setCreateJson((prev) => !prev);
                  }}
                  className="h-4 w-4 rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                    "block w-full rounded-md border border-gray-300 px-3 py-2 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                    !!errors.maxSupply &&
                      "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500 focus:outline-hidden",
                  )}
                  aria-invalid={errors.maxSupply ? "true" : "false"}
                  {...register("maxSupply", {
                    setValueAs: (value: string) =>
                      value === "" ? 0 : Number(value),
                    validate: (value) =>
                      (Number.isInteger(value) && value >= 0) ||
                      "Must be a whole number, 0 or more",
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

            <div>
              <div className="mt-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
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
            <h3 className="text-lg leading-6 font-medium text-gray-900">
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
                    <div className="mt-1 -space-y-px rounded-md bg-white shadow-xs">
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
                                pubkey: isAddress,
                              },
                            })}
                            defaultValue=""
                            className={cn(
                              "relative block w-full rounded-none rounded-tl-md rounded-bl-md border border-gray-300 bg-transparent px-3 py-2 pr-6",
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
                              valueAsNumber: true,
                            })}
                            className={cn(
                              "relative block w-full rounded-none border border-gray-300 bg-transparent px-3 py-2",
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
                            className="inline-flex h-full w-full items-center justify-center rounded-none rounded-tr-md rounded-br-md border border-gray-300 bg-red-500"
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
            <h3 className="text-lg leading-6 font-medium text-gray-900">
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
                <span className="flex grow flex-col">
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
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          value ? "translate-x-5" : "translate-x-0",
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
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
                <span className="flex grow flex-col">
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
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          value ? "translate-x-5" : "translate-x-0",
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
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
                <span className="flex grow flex-col">
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
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          value ? "translate-x-5" : "translate-x-0",
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
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
