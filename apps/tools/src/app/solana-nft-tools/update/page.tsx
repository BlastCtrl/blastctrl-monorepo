"use client";

import { InputGroup, notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage";
import { maxBytes } from "@/lib/solana/metaplex-form-rules";
import {
  fetchTokenMetadata,
  updateNftInstructions,
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
import {
  planUpdate,
  updateRefusal,
  type UpdateFormValues,
} from "./update-plan";

export type FormToken = {
  name: string;
  mint: string;
};

const MAX_CREATORS = 5;

export type FormInputs = UpdateFormValues & { mint: string };

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

    formState: { errors, dirtyFields },
    reset,
    setFocus,
    watch,
    control,
  } = useForm<FormInputs>({
    mode: "onSubmit",
    defaultValues,
  });
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "creators",
    rules: {
      maxLength: MAX_CREATORS,
      minLength: 0,
    },
  });

  const mint = watch("mint");
  const isCreatorAddable = fields.length < MAX_CREATORS;

  /**
   * Loads the NFT's values as the form's new defaults, so only what the user
   * changes afterwards counts as touched (`dirtyFields`), and replaces the
   * creator rows wholesale, so none from an earlier NFT stay.
   */
  const setFormValues = (nft: DasAsset) => {
    const creators =
      nft.creators?.map(({ address, share }) => ({ address, share })) ?? [];
    reset({
      mint: nft.id,
      name: nft.content?.metadata.name ?? "",
      symbol: nft.content?.metadata.symbol ?? "",
      uri: nft.content?.json_uri ?? "",
      updateAuthority: nft.authorities?.[0]?.address ?? "",
      isMutable: nft.mutable,
      primarySaleHappened: nft.royalty?.primary_sale_happened ?? false,
      sellerFeeBasisPoints: nft.royalty?.basis_points ?? 0,
      creators,
    });
    replace(creators);
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

      // Only what the user changed, compared with the chain, is sent.
      const plan = planUpdate(data, dirtyFields, current, wallet);
      if (!plan) {
        notify({ type: "info", description: "Nothing to update." });
        return;
      }
      const refusal = updateRefusal(plan, current);
      if (refusal) {
        notify({ type: "error", title: "Not allowed", description: refusal });
        return;
      }

      const result = await client.sendTransaction(
        await updateNftInstructions(client.payer, mint, plan),
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
              {...register("name", { validate: maxBytes(32) })}
              error={errors?.name}
            />

            <InputGroup
              className="sm:col-span-2"
              label="Symbol"
              {...register("symbol", { validate: maxBytes(10) })}
              error={errors?.symbol}
            />

            <InputGroup
              className="sm:col-span-6"
              label="URI"
              {...register("uri", { validate: maxBytes(200) })}
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
              Removing every creator clears the list. Your own address stays
              verified; other creators can only verify themselves.
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
                                // The program refuses duplicate creators.
                                unique: (value, form) =>
                                  form.creators.filter(
                                    (c) => c.address === value,
                                  ).length === 1,
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
                  Seller fee must be between 0 and 10000
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
                  Indicates that the first sale of this token happened. Once on,
                  it can&apos;t be turned off again; it can affect royalty
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
