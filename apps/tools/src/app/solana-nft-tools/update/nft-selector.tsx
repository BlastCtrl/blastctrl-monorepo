import { useOwnerNfts } from "@/state/queries/use-owner-nfts";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import type { FieldError, UseControllerProps } from "react-hook-form";
import { useController } from "react-hook-form";
import type { FormInputs } from "./page";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { cn } from "@blastctrl/ui";
import { isPublicKey } from "@/lib/solana/common";

export const NftSelector = ({ control }: UseControllerProps<FormInputs>) => {
  const { publicKey } = useWallet();
  const [query, setQuery] = useState("");
  const { data } = useOwnerNfts(publicKey?.toString() ?? "");

  const {
    field,
    fieldState: { error },
  } = useController({
    name: "mint",
    control,
    rules: {
      required: "Select an NFT or enter the mint address",
      validate: (value) => isPublicKey(value ?? "") || "Not a valid address",
    },
  });

  const filteredTokens = data?.filter((nft) =>
    nft.content?.metadata?.name?.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <Combobox
        as="div"
        ref={field.ref}
        name={"mint"}
        onChange={(value) => field.onChange(value)}
      >
        <NftComboboxInput
          selectedMint={field.value}
          onChange={setQuery}
          error={error}
        />

        <ComboboxOptions
          anchor="bottom"
          className="max-h-56 w-[var(--input-width)] overflow-auto rounded-lg border border-gray-300 bg-white p-1 [--anchor-gap:6px] empty:hidden"
        >
          {query.length > 0 && (
            <ComboboxOption
              value={query}
              className="group relative w-full select-none truncate rounded py-2 pl-3 pr-9 text-gray-900 data-[focus]:bg-indigo-600 data-[focus]:text-white"
            >
              Use <span className="font-bold">{query}</span>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 hidden items-center pr-4 group-data-[selected]:flex"
              >
                <CheckIcon className="size-5" />
              </span>
            </ComboboxOption>
          )}
          {filteredTokens?.map((userNft) => (
            <ComboboxOption
              key={userNft.id}
              value={userNft.id}
              className="group relative select-none rounded py-2 pl-3 pr-9 text-gray-900 data-[focus]:bg-indigo-600 data-[focus]:text-white"
            >
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={userNft.content.links.image}
                  alt=""
                  height={24}
                  width={24}
                  className="size-5 rounded-full"
                />
                {userNft.content.metadata.name}
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 hidden items-center pr-4 group-data-[selected]:flex"
              >
                <CheckIcon className="size-5" />
              </span>
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>
      {error && (
        <div className="mt-1 text-red-500 sm:text-sm/5">{error?.message}</div>
      )}
    </>
  );
};

// This component wraps the headlessui ComboboxInput
// If the entered address of an nft in the user's wallet,
// display the nft name instead of the mint address
const NftComboboxInput = ({
  onChange,
  selectedMint,
  error,
}: {
  onChange: (value: string) => void;
  selectedMint: string;
  error?: FieldError;
}) => {
  const { publicKey } = useWallet();
  const { data } = useOwnerNfts(publicKey?.toString() ?? "");

  const selectedNft = data?.find(({ id }) => id === selectedMint);

  return (
    <div className="relative">
      <ComboboxInput
        onChange={({ target }) => onChange(target.value)}
        displayValue={(mint: string) => {
          return selectedNft?.content?.metadata?.name ?? mint;
        }}
        className={cn(
          "block w-full rounded-md border-gray-300 pr-9 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
          error && "border-red-600 focus:border-red-500 focus:ring-red-600",
        )}
      />
      <ComboboxButton className="group absolute inset-y-0 right-0 px-2.5">
        <ChevronUpDownIcon className="size-4 text-gray-500 group-data-[hover]:text-gray-900" />
      </ComboboxButton>
    </div>
  );
};
