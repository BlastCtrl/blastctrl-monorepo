"use client";

import {
  InputGroup,
  InputMultiline,
  Select,
  notify,
  notifyPromise,
} from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import {
  simulateUnsigned,
  simulationFailureMessage,
} from "@/connector/simulate";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useArweaveUploader } from "@/lib/hooks/use-arweave-uploader";
import { compress } from "@/lib/solana/common";
import { maxBytes } from "@/lib/solana/metaplex-form-rules";
import {
  createMetadataInstructions,
  fetchTokenMetadata,
  updateMetadataInstructions,
  type TokenMetadata,
  type TokenMetadataFields,
} from "@/lib/solana/metaplex-token-metadata";
import { isMintAccountData } from "@/lib/solana/token-2022";
import { Button, cn } from "@blastctrl/ui";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { address, fetchEncodedAccount, isAddress } from "@solana/kit";
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

/**
 * What an update resets: `updateMetadataAccountV2` replaces the whole data
 * struct, and this form only has name, symbol and URI, so the rest goes back
 * to its defaults. Human-readable, for the warning; empty when nothing is
 * lost.
 */
function wipedByUpdate(current: TokenMetadata): string[] {
  const wiped: string[] = [];
  if (current.creators?.length) {
    wiped.push(
      `${current.creators.length} creator${current.creators.length > 1 ? "s" : ""}`,
    );
  }
  if (current.sellerFeeBasisPoints > 0) {
    wiped.push(`royalties of ${current.sellerFeeBasisPoints / 100}%`);
  }
  if (current.collection) {
    wiped.push(`the collection ${compress(current.collection.key, 4)}`);
  }
  return wiped;
}

export default function CreateToken() {
  const { client } = useKitClient();
  const upload = useArweaveUploader();
  const { setOpen } = useConnectorDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Actions>(actions[0]);
  const [wipeWarning, setWipeWarning] = useState<{
    fields: string[];
    answer: (proceed: boolean) => void;
  } | null>(null);
  /** Opens the warning and resolves with the user's choice. */
  const confirmWipe = (fields: string[]) =>
    new Promise<boolean>((resolve) => {
      setWipeWarning({
        fields,
        answer: (proceed) => {
          setWipeWarning(null);
          resolve(proceed);
        },
      });
    });
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

      // The mint's program (Token or Token-2022) goes into the instruction.
      const mintAccount = await fetchEncodedAccount(client.rpc, mint);
      if (!mintAccount.exists || !isMintAccountData(mintAccount.data)) {
        notify({
          type: "error",
          title: "Not a token mint",
          description: `${compress(data.mint, 4)} is not a token mint account.`,
        });
        return;
      }
      const build = (fields: Partial<TokenMetadataFields>) =>
        selectedAction === "Add"
          ? createMetadataInstructions(
              owner,
              mint,
              fields,
              mintAccount.programAddress,
            )
          : updateMetadataInstructions(owner, mint, fields);

      // Simulate with empty fields first: this fails fast when the wallet is
      // not the authority, before anything is uploaded.
      const simulation = await simulateUnsigned(client, await build({}));
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
                {simulationFailureMessage(simulation)}
              </code>
            </>
          ),
        });
        return;
      }

      // An update rewrites the whole data struct; say what that resets.
      if (selectedAction === "Update") {
        const current = await fetchTokenMetadata(client.rpc, mint);
        const wiped = current ? wipedByUpdate(current) : [];
        if (wiped.length > 0 && !(await confirmWipe(wiped))) return;
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
          await build({
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
              {selectedAction === "Add"
                ? "You need to be the mint authority of the token."
                : "You need to be the update authority of the token's metadata."}
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
                validate: maxBytes(32),
              })}
              error={errors?.name}
            />
            <InputGroup
              label="Symbol"
              description="Shorter name (e.g. USDC)"
              type="text"
              {...register("symbol", {
                required: true,
                validate: maxBytes(10),
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
      <Dialog
        open={wipeWarning !== null}
        onClose={() => wipeWarning?.answer(false)}
        className="relative z-50"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/50 transition duration-300 data-closed:opacity-0"
        />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition data-closed:scale-95 data-closed:opacity-0"
          >
            <DialogTitle className="text-lg font-medium text-gray-900">
              This update resets other fields
            </DialogTitle>
            <p className="mt-2 text-sm text-gray-600">
              Updating writes the whole metadata, and this form only sets the
              name, symbol and URI. The token currently has{" "}
              {formatList(wipeWarning?.fields ?? [])}, which will be removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button outline onClick={() => wipeWarning?.answer(false)}>
                Cancel
              </Button>
              <Button color="red" onClick={() => wipeWarning?.answer(true)}>
                Update anyway
              </Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}

/** "a", "a and b", "a, b and c". */
const formatList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
