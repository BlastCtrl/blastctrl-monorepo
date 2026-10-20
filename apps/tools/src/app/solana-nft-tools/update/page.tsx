"use client";

import { InputGroup, notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage";
import {
  fetchTokenMetadata,
  updateNftInstructions,
  type NftCreator,
} from "@/lib/solana/metaplex-token-metadata";
import type { DasAsset } from "@/state/queries/types";
import { useOwnerNfts } from "@/state/queries/use-owner-nfts";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { Description, Label } from "@blastctrl/ui/fieldset";
import { Switch, SwitchField, SwitchGroup } from "@blastctrl/ui/switch";
import { Field } from "@headlessui/react";
import {
  ExclamationCircleIcon,
  PlusCircleIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { useConnector } from "@solana/connector/react";
import { address, isAddress } from "@solana/kit";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { NftSelector } from "./nft-selector";

export type FormToken = {
  name: string;
  mint: string;
};

const MAX_CREATORS = 5;

export type FormInputs = {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  updateAuthority: string;
  isMutable: boolean;
  primarySaleHappened: boolean;
  creators: {
    address: string;
    share: number;
  }[];
  sellerFeeBasisPoints: number;
};

const defaultValues = {
  mint: "",
  name: "",
  symbol: "",
  uri: "",
  updateAuthority: "",
  isMutable: true,
  primarySaleHappened: false,
  creators: [],
  sellerFeeBasisPoints: 0,
};

export default function Update() {
  const { client } = useKitClient();
  const { account } = useConnector();
  const { setOpen } = useConnectorDialog();
  const { data } = useOwnerNfts(account ?? "");
  const [isConfirming, setIsConfirming] = useState(false);

  const [isShowingCurrentValues, setIsShowingCurrentValues] =
    useLocalStorageState("showCurrentValues", true);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, dirtyFields },
    reset,
    setFocus,
    watch,
    control,
  } = useForm<FormInputs>({
    mode: "onSubmit",
    defaultValues,
  });
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "creators",
    rules: {
      maxLength: MAX_CREATORS,
      minLength: 0,
    },
  });

  const mint = watch("mint");
  const isCreatorAddable = fields.length < MAX_CREATORS;

  const setFormValues = (nft: DasAsset) => {
    if (nft) {
      setValue("name", nft.content?.metadata.name ?? "");
      setValue("symbol", nft.content?.metadata.symbol ?? "");
      setValue("uri", nft.content?.json_uri ?? "");
      setValue("updateAuthority", nft.authorities?.[0]?.address ?? "");
      setValue("isMutable", nft.mutable);
      setValue(
        "primarySaleHappened",
        nft.royalty?.primary_sale_happened ?? false,
      );
      setValue("sellerFeeBasisPoints", nft.royalty?.basis_points ?? 0);
      nft.creators?.forEach((creator, idx) => {
        update(idx, { address: creator.address, share: creator.share });
      });
    }
  };

  const submit = async (data: FormInputs) => {
    if (!client) {
      setOpen(true);
      return;
    }

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
      const wallet = client.payer.address;
      const mint = address(data.mint);
      const current = await fetchTokenMetadata(client.rpc, mint);

      if (!current) {
        notify({
          type: "error",
          title: "No metadata found",
          description: (
            <>
              <span className="font-medium text-blue-300">{data.mint}</span> has
              no Token Metadata account.
            </>
          ),
        });
        return;
      }
      if (current.updateAuthority !== wallet) {
        notify({
          type: "error",
          title: "Invalid update authority",
          description: (
            <>
              Your wallet is not the valid update authority. Update authority is{" "}
              <span className="font-medium text-blue-300">
                {current.updateAuthority}
              </span>
            </>
          ),
        });
        return;
      }

      // Verification is kept for creators already on the NFT and granted to
      // the wallet, which signs; the program rejects anything else.
      const creators: NftCreator[] | null = dirtyFields.creators
        ? data.creators.map((creator) => ({
            address: address(creator.address),
            share: creator.share,
            verified:
              current.creators?.find((c) => c.address === creator.address)
                ?.verified ?? creator.address === wallet,
          }))
        : current.creators;
      const isDataDirty =
        dirtyFields.name ||
        dirtyFields.symbol ||
        dirtyFields.uri ||
        dirtyFields.creators ||
        dirtyFields.sellerFeeBasisPoints;

      const result = await client.sendTransaction(
        updateNftInstructions(wallet, mint, {
          // Immutable metadata rejects a data write, even an unchanged one.
          data: isDataDirty
            ? {
                name: dirtyFields.name ? data.name : current.name,
                symbol: dirtyFields.symbol ? data.symbol : current.symbol,
                uri: dirtyFields.uri ? data.uri : current.uri,
                sellerFeeBasisPoints: dirtyFields.sellerFeeBasisPoints
                  ? data.sellerFeeBasisPoints
                  : current.sellerFeeBasisPoints,
                creators,
              }
            : undefined,
          newUpdateAuthority:
            dirtyFields.updateAuthority && data.updateAuthority
              ? address(data.updateAuthority)
              : undefined,
          isMutable: dirtyFields.isMutable ? data.isMutable : undefined,
          primarySaleHappened: dirtyFields.primarySaleHappened
            ? data.primarySaleHappened
            : undefined,
        }),
      );

      notify({
        title: "Metadata update success",
        type: "success",
        txid: result.context.signature,
      });
    } catch (err) {
      console.log({ err });
      notify({
        type: "error",
        title: "Error updating",
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
          Manual NFT update
        </h1>
        <p className="text-sm text-gray-500">
          Enter the values you wish to update on an NFT, a semi-fungible token,
          or any other token with metadata. Empty fields won&apos;t be updated.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(submit)}
        className="divide-y divide-gray-200 *:not-last:pb-8"
      >
        <div>
          <div className="mt-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Select Token
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Select an NFT or enter the mint address. You need to be its update
              authority.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-8">
            <div className="sm:col-span-5">
              <NftSelector name="mint" control={control} />
            </div>

            <Field className="flex h-full items-center gap-2 sm:col-span-3">
              <Switch
                checked={isShowingCurrentValues}
                onChange={(state) => {
                  setIsShowingCurrentValues(state);
                  if (state) {
                    // Lookup in the query cache for user nfts
                    const current = data?.find((nft) => nft.id === mint);
                    if (current) {
                      setFormValues(current);
                      return;
                    }

                    notify({
                      type: "info",
                      description: "Failed to load NFT information",
                    });
                  } else {
                    reset((formValues) => ({
                      ...defaultValues,
                      mint: formValues.mint,
                    }));
                  }
                }}
              />
              <span>Load current values</span>
            </Field>
          </div>
        </div>

        <div>
          <div className="mt-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Basic Information
            </h3>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <InputGroup
              className="sm:col-span-4"
              label="Name"
              {...register("name", {
                maxLength: {
                  value: 32,
                  message: "Max name length is 32",
                },
              })}
              error={errors?.name}
            />

            <InputGroup
              className="sm:col-span-2"
              label="Symbol"
              {...register("symbol", {
                maxLength: {
                  value: 10,
                  message: "Max symbol length is 10",
                },
              })}
              error={errors?.symbol}
            />

            <InputGroup
              className="sm:col-span-6"
              label="URI"
              {...register("uri", {
                maxLength: {
                  value: 200,
                  message: "Max URI length is 200",
                },
              })}
              error={errors?.uri}
            />
          </div>
        </div>

        <div>
          <div className="mt-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Creators
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              There can be up to 5 creators. The shares must add up to 100.
              <a
                href="https://docs.metaplex.com/programs/token-metadata/accounts#creators"
                rel="noreferrer"
                target="_blank"
              >
                <QuestionMarkCircleIcon className="mb-0.5 ml-1 inline h-4 w-4 text-gray-400" />
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
                            <span className="col-span-3 mb-1 pl-1 text-sm text-gray-600">
                              Share
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
                              "relative block w-full rounded-none rounded-tl-md rounded-bl-md border-gray-300 bg-transparent pr-6",
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
                    <button
                      onClick={() => append({ address: "", share: 0 })}
                      type="button"
                      className="inline-flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-xs hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden"
                    >
                      Add Creator
                      <PlusCircleIcon
                        className="-mr-1 ml-3 h-5 w-5"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <label
                htmlFor="sellerFeeBasisPoints"
                className="block text-sm font-medium text-gray-700"
              >
                Royalties{" "}
                <code className="text-sm tracking-tighter">
                  (sellerFeeBasisPoints [0-10000])
                </code>
              </label>
              <div className="relative mt-1">
                <input
                  id="sellerFeeBasisPoints"
                  type="number"
                  {...register("sellerFeeBasisPoints", {
                    min: 0,
                    max: 10000,
                    valueAsNumber: true,
                  })}
                  className={cn(
                    "block w-full rounded-md border border-gray-300 px-3 py-2 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                    errors?.sellerFeeBasisPoints &&
                      "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500 focus:outline-hidden",
                  )}
                  aria-invalid={errors?.sellerFeeBasisPoints ? "true" : "false"}
                />
                {errors?.sellerFeeBasisPoints && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <ExclamationCircleIcon
                      className="h-5 w-5 text-red-500"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
              {errors?.sellerFeeBasisPoints && (
                <p
                  className="mt-2 text-sm text-red-600"
                  id={errors.sellerFeeBasisPoints.type}
                >
                  Seller fee must be between 0 and 1000
                </p>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="mt-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Flags and authority
            </h3>
            <p className="mt-1 text-base text-zinc-500 sm:text-sm/6">
              Be careful when changing these. If you remove your own update
              authority, you will not be able to update this NFT anymore.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <InputGroup
              className="sm:col-span-4"
              label="Update authority"
              {...register("updateAuthority", {
                validate: {
                  pubkey: (value) =>
                    isAddress(value) || value === "" || "Not a valid pubkey",
                },
              })}
              error={errors?.updateAuthority}
            />
            <SwitchGroup className="sm:col-span-5">
              <SwitchField>
                <Label>Is mutable</Label>
                <Description>
                  If this flag is changed to false, it wont be possible to
                  change the metadata anymore.
                </Description>
                <Controller
                  control={control}
                  name="isMutable"
                  render={({ field: { onChange, value, name } }) => (
                    <Switch
                      name={name}
                      checked={value}
                      onChange={(prev) => onChange(prev)}
                    />
                  )}
                />
              </SwitchField>
              <SwitchField>
                <Label>Primary sale happened</Label>
                <Description>
                  Indicates that the first sale of this token happened. This
                  flag can be enabled only once and can affect royalty
                  distribution.
                </Description>
                <Controller
                  control={control}
                  name="primarySaleHappened"
                  render={({ field: { onChange, value, name } }) => (
                    <Switch
                      name={name}
                      checked={value}
                      onChange={(prev) => onChange(prev)}
                    />
                  )}
                />
              </SwitchField>
            </SwitchGroup>
          </div>
        </div>

        <div className="pt-5">
          <div className="flex justify-end gap-2">
            <Button plain type="button" onClick={() => reset()}>
              Clear values
            </Button>
            <Button color="indigo" type="submit">
              {isConfirming ? (
                <>
                  <SpinnerIcon className="mr-2 -ml-1 h-5 w-5 animate-spin" />
                  Confirming
                </>
              ) : (
                "Update"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
