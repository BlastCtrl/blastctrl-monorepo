/* eslint-disable @typescript-eslint/no-unsafe-call */
"use client";

import {
  InputGroup,
  InputMultiline,
  Select,
  notify,
  notifyPromise,
} from "@/components";
import { IrysStorage } from "@/lib/irys";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { useWalletConnection } from "@/state/use-wallet-connection";
import {
  createMetadataInstruction,
  updateMetadataInstruction,
} from "@/lib/solana";
import { compress, isPublicKey } from "@/lib/solana/common";
import { cn } from "@blastctrl/ui";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { WalletError } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { TransactionInstruction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { UploadFile } from "./_components/upload-file";
import useUmi from "@/lib/hooks/use-umi";
import type { Instruction, TransactionBuilder } from "@metaplex-foundation/umi";
import { publicKey } from "@metaplex-foundation/umi";
import * as base58 from "bs58";

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
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { simulateVersionedTransaction } = useWalletConnection();
  const { network } = useNetworkConfigurationStore();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Actions>(actions[0]);
  const {
    register,
    formState: { errors },
    handleSubmit,
    setValue,
  } = useForm<TokenData>({});
  const umi = useUmi();

  const onSubmit = async (data: TokenData) => {
    if (!wallet.publicKey) {
      setVisible(true);
      return;
    }

    setIsConfirming(true);
    const irys = await IrysStorage.makeWebIrys(network, wallet);

    // Test if creating metadata is possible
    const ixs: Instruction[] =
      selectedAction === "Add"
        ? createMetadataInstruction(
            umi,
            publicKey(wallet.publicKey.toBase58()),
            publicKey(data.mint),
            {},
          ).getInstructions()
        : updateMetadataInstruction(
            umi,
            publicKey(wallet.publicKey.toBase58()),
            publicKey(data.mint),
            {},
          ).getInstructions();
    const { value } = await simulateVersionedTransaction(
      ixs.map(
        (ix) =>
          new TransactionInstruction({
            keys: ix.keys.map((key) => ({
              ...key,
              pubkey: new PublicKey(key.pubkey),
            })),
            programId: new PublicKey(ix.programId),
            data: Buffer.from(ix.data),
          }),
      ),
    );

    if (value.err) {
      setIsConfirming(false);

      return notify({
        type: "error",
        title: `${selectedAction} Metadata Error`,
        description: (
          <>
            <p className="mb-1.5">
              {selectedAction === "Add" ? "Adding" : "Updating"} metadata to
              this token is not possible due to the error:{" "}
            </p>
            <code className="break-all py-6">{JSON.stringify(value.err)}</code>
          </>
        ),
      });
    }

    // Upload image
    let imageUri: string | undefined;

    if (data.image) {
      imageUri = await notifyPromise(
        irys.uploadFile(data.image).then((r) => `https://arweave.net/${r.id}`),
        {
          loading: { description: "Uploading image to Arweave..." },
          success: { description: "Image upload complete" },
          error: (err: any) => {
            setIsConfirming(false);
            console.log(err);
            return {
              title: "Image Upload Error",
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
            };
          },
        },
      );
    }

    const json = {
      name: data.name,
      symbol: data.symbol,
      image: imageUri,
      description: data?.description,
      external_url: data.external_url,
    };
    const metadataFile = new File([JSON.stringify(json)], "metadata.json", {
      type: "application/json",
    });

    const metadataUri = await notifyPromise(
      irys.uploadFile(metadataFile).then((r) => `https://arweave.net/${r.id}`),
      {
        loading: { description: "Uploading metadata file to Arweave..." },
        success: { description: "JSON upload complete" },
        error: (err: any) => {
          setIsConfirming(false);
          console.log({ err });
          return {
            title: "JSON upload error",
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
                    /storage
                  </Link>{" "}
                  page.
                </p>
              </div>
            ),
          };
        },
      },
    );

    try {
      let tx: TransactionBuilder;
      if (selectedAction === "Add") {
        tx = createMetadataInstruction(
          umi,
          publicKey(wallet.publicKey),
          publicKey(data.mint),
          {
            name: data.name,
            symbol: data.symbol,
            uri: metadataUri,
          },
        );
      } else {
        tx = updateMetadataInstruction(
          umi,
          publicKey(wallet.publicKey),
          publicKey(data.mint),
          {
            name: data.name,
            symbol: data.symbol,
            uri: metadataUri,
          },
        );
      }
      await notifyPromise(tx.sendAndConfirm(umi), {
        loading: { description: "Confirming transaction" },
        success: (value) => ({
          txid: base58.encode(value.signature),
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
          description: err?.message,
        }),
      });
    } catch (err: any) {
      if (err instanceof WalletError) {
        // The onError callback in the walletconnect context will handle it
        return;
      }
      console.log({ err });
      notify({
        type: "error",
        title: "Error Creating Metadata",
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
        className="space-y-8 divide-y divide-gray-200"
      >
        <div>
          <div className="mt-4 ">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
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
                      isPublicKey(value) ?? "Not a valid public key",
                  },
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
                  message: "Max symbol length is",
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
              error={errors?.symbol}
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
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Image
            </h3>
            <ul className="mb-3 mt-1 list-disc text-sm text-gray-500 sm:ml-5">
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

            <div className="bg-secondary group inline-flex min-w-fit rounded-md">
              <button
                type="submit"
                disabled={isConfirming}
                className="bg-secondary hover:bg-secondary-focus focus:ring-secondary-focus disabled:bg-secondary-focus inline-flex min-w-fit items-center rounded-l-md px-4 py-2 text-base text-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
              >
                {selectedAction} metadata
              </button>

              <Select
                value={selectedAction}
                onChange={(v) => setSelectedAction(v)}
              >
                <Select.Button className="hover:bg-secondary-focus h-full rounded-r-md px-2 text-gray-50">
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
