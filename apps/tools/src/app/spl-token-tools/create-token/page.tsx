"use client";

import {
  InputGroup,
  InputMultiline,
  Select,
  notify,
  notifyPromise,
} from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { simulateUnsigned } from "@/connector/simulate";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useArweaveUploader } from "@/lib/hooks/use-arweave-uploader";
import { compress } from "@/lib/solana/common";
import {
  createMetadataInstructions,
  updateMetadataInstructions,
} from "@/lib/solana/metaplex-token-metadata";
import { cn } from "@blastctrl/ui";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { address, isAddress } from "@solana/kit";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { UploadFile } from "./_components/upload-file";

type TokenData = {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  external_url?: string;
  image: File | null;
};

const actions = ["Add", "Update"] as const;
type Actions = (typeof actions)[number];

export default function CreateToken() {
  const { client } = useKitClient();
  const upload = useArweaveUploader();
  const { setOpen } = useConnectorDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Actions>(actions[0]);
  const {
    register,
    formState: { errors },
    handleSubmit,
    setValue,
  } = useForm<TokenData>({});

  const onSubmit = async (data: TokenData) => {
    if (!client || !upload) {
      setOpen(true);
      return;
    }

    setIsConfirming(true);
    try {
      const owner = client.payer;
      const mint = address(data.mint);
      const build =
        selectedAction === "Add"
          ? createMetadataInstructions
          : updateMetadataInstructions;

      // Simulate with empty fields first: this fails fast when the wallet is
      // not the authority, before anything is uploaded.
      const simulation = await simulateUnsigned(
        client,
        await build(owner, mint, {}),
      );
      if (simulation.err) {
        notify({
          type: "error",
          title: `${selectedAction} Metadata Error`,
          description: (
            <>
              <p className="mb-1.5">
                {selectedAction === "Add" ? "Adding" : "Updating"} metadata to
                this token is not possible due to the error:{" "}
              </p>
              <code className="py-6 break-all">
                {JSON.stringify(simulation.err)}
              </code>
            </>
          ),
        });
        return;
      }

      // The uploader's toasts report failures; stop quietly after one.
      let imageUri: string | undefined;
      if (data.image) {
        imageUri = await upload(data.image, "image").catch(() => undefined);
        if (!imageUri) return;
      }

      const json = {
        name: data.name,
        symbol: data.symbol,
        image: imageUri,
        description: data.description,
        external_url: data.external_url,
      };
      const metadataUri = await upload(
        new File([JSON.stringify(json)], "metadata.json", {
          type: "application/json",
        }),
        "metadata",
      ).catch(() => undefined);
      if (!metadataUri) return;

      await notifyPromise(
        client.sendTransaction(
          await build(owner, mint, {
            name: data.name,
            symbol: data.symbol,
            uri: metadataUri,
          }),
        ),
        {
          loading: { description: "Confirming transaction" },
          success: (result) => ({
            txid: result.context.signature,
            title: `${selectedAction} Metadata Success`,
            description: (
              <>
                Metadata {selectedAction === "Add" ? "created" : "updated"} for
                token{" "}
                <span className="font-medium text-blue-300">
                  {compress(data.mint, 4)}
                </span>
              </>
            ),
          }),
          error: (err) => ({
            title: "Error Creating Metadata",
            description: transactionErrorMessage(err),
          }),
        },
      ).catch(() => undefined);
    } catch (err) {
      console.log({ err });
      notify({
        type: "error",
        title: "Error Creating Metadata",
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
          Add metadata to tokens
        </h1>
        <p className="text-sm text-gray-500">
          Enter the metadata information of your token. This information will be
          uploaded to Arweave and added to your token. Uploading files will
          require multiple wallet confirmations.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="divide-y divide-gray-200 *:not-last:pb-8"
      >
        <div>
          <div className="mt-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Basic Information
            </h3>
            <p className="text-sm text-gray-500">
              You need to have the mint authority over the token.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-4">
            <div>
              <InputGroup
                label="Mint address"
                description={
                  <>
                    Address of your previously created token (
                    <a
                      className="text-blue-500"
                      href="https://spl.solana.com/token#example-creating-your-own-fungible-token"
                    >
                      e.g. with the CLI
                    </a>
                    ).
                  </>
                }
                placeholder="Public key"
                type="text"
                {...register("mint", {
                  required: true,
                  validate: {
                    isValid: (value) =>
                      isAddress(value.trim()) || "Not a valid address",
                  },
                  setValueAs: (value: string) => value.trim(),
                })}
                error={errors?.mint}
              />
            </div>
            <InputGroup
              label="Name"
              description="Full name of your token (e.g. USD Coin)"
              type="text"
              {...register("name", {
                required: true,
                maxLength: {
                  value: 32,
                  message: "Max name length is 32",
                },
              })}
              error={errors?.name}
            />
            <InputGroup
              label="Symbol"
              description="Shorter name (e.g. USDC)"
              type="text"
              {...register("symbol", {
                required: true,
                maxLength: {
                  value: 10,
                  message: "Max symbol length is 10",
                },
              })}
              error={errors?.symbol}
            />
            <InputGroup
              label="External URL"
              description={
                <>
                  Token/project homepage, optional{" "}
                  <span className="hidden sm:inline">
                    (e.g. www.bonkcoin.com)
                  </span>
                </>
              }
              type="text"
              {...register("external_url", {
                required: false,
              })}
              error={errors?.external_url}
            />
            <InputMultiline
              label="Description"
              description="Optional"
              {...register("description", {
                required: false,
              })}
              error={errors?.description}
            />
          </div>
        </div>

        <div>
          <div className="mt-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Image
            </h3>
            <ul className="mt-1 mb-3 list-disc text-sm text-gray-500 sm:ml-5">
              <li>Square aspect ratio</li>
              <li>Smaller size (e.g. 200x200 pixels)</li>
              <li>
                Fit within a circle (most wallets display token icons in a
                circle)
              </li>
            </ul>
          </div>

          <UploadFile
            onDrop={(file) => setValue("image", file)}
            onRemove={() => setValue("image", null)}
          />
        </div>

        <div className="pt-5">
          <div className="flex justify-end gap-x-4 gap-y-2">
            <p className="text-sm text-gray-700">
              You will have to approve up to{" "}
              <span className="font-bold text-blue-500">5</span> transactions
              and messages.
            </p>

            <div className="group inline-flex min-w-fit rounded-md bg-secondary">
              <button
                type="submit"
                disabled={isConfirming}
                className="inline-flex min-w-fit items-center rounded-l-md bg-secondary px-4 py-2 text-base text-gray-50 shadow-xs hover:bg-secondary-focus focus:ring-2 focus:ring-secondary-focus focus:ring-offset-2 focus:outline-hidden disabled:bg-secondary-focus"
              >
                {selectedAction} metadata
              </button>

              <Select
                value={selectedAction}
                onChange={(v) => setSelectedAction(v)}
              >
                <Select.Button className="h-full rounded-r-md px-2 text-gray-50 hover:bg-secondary-focus">
                  <ChevronUpDownIcon className="h-5 w-5" />
                </Select.Button>
                <Select.Options className="min-w-[18ch]">
                  {actions.map((value) => (
                    <Select.Option
                      key={value}
                      value={value}
                      className={({ active, selected }) =>
                        cn(
                          active && "bg-secondary-focus text-white",
                          selected && "bg-secondary text-white",
                          "cursor-pointer rounded-lg px-2 py-1",
                        )
                      }
                    >
                      {value}
                    </Select.Option>
                  ))}
                </Select.Options>
              </Select>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
