"use client";

import { notify } from "@/components";
import { useOwnerAssets } from "@/state/queries/use-owner-assets";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useForm } from "react-hook-form";
import bs58 from "bs58";
import { TokenList } from "./_components/token-list";

type FormValues = {
  privateKey: string;
};

export default function RemoveTokens() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [targetWallet, setTargetWallet] = useState<Keypair | null>(null);
  const { data, isFetching, refetch } = useOwnerAssets(
    targetWallet?.publicKey.toString() ?? "",
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      privateKey: "",
    },
  });

  const parsePrivateKey = (input: string): Uint8Array | null => {
    const trimmed = input.trim();

    // Try to parse as byte array first (e.g., [202,64,201,...])
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (
          Array.isArray(parsed) &&
          parsed.every((n) => typeof n === "number" && n >= 0 && n <= 255)
        ) {
          return Uint8Array.from(parsed);
        }
      } catch {
        // Fall through to error
      }
    }

    // Try to parse as base58
    try {
      return bs58.decode(trimmed);
    } catch {
      // Fall through to error
    }

    return null;
  };

  const onSubmit = async (formData: FormValues) => {
    if (!connected) {
      setVisible(true);
      return;
    }

    const secretKey = parsePrivateKey(formData.privateKey);

    if (!secretKey) {
      notify({
        type: "error",
        title: "Invalid private key",
        description:
          "Please enter a valid base58 encoded private key or byte array (e.g., [202,64,201,...])",
      });
      return;
    }

    try {
      const keypair = Keypair.fromSecretKey(secretKey);
      const address = keypair.publicKey.toString();

      setTargetWallet(keypair);
      await refetch();

      // Fetch the tokens for this wallet
    } catch (err) {
      notify({
        type: "error",
        title: "Invalid private key",
        description: "The provided key could not be used to create a keypair",
      });
    }
  };

  const handleConnectWallet = () => {
    setVisible(true);
  };

  const handleGoBack = () => {
    setTargetWallet(null);
  };

  const buttonText = () => {
    if (!connected) return "Connect your wallet";
    if (isFetching)
      return (
        <>
          <SpinnerIcon className="-ml-1 mr-2 size-5 animate-spin" />
          Loading tokens
        </>
      );

    return "Load tokens";
  };

  return (
    <div
      className={cn(
        "mx-auto w-[min(100%,theme(screens.md))] overflow-visible bg-white px-4 pb-5 sm:rounded-lg sm:p-6 sm:shadow",
        !!data && "!pb-0",
      )}
    >
      <h1 className="font-display mb-4 text-3xl font-semibold">
        Token Hoover 🧹
      </h1>

      {!data && (
        <>
          <div className="space-y-2 text-sm text-gray-500">
            <p className="text-pretty">
              This tool allows you to remove tokens from a wallet by either
              transferring them to your connected wallet or burning them
              permanently.
            </p>
            <p className="text-pretty">
              First, connect your main wallet which will receive tokens from the
              secondary wallet. Then enter the private key of the secondary
              wallet containing the tokens you want to remove. Burning tokens is
              <em>irreversible</em>, so be very careful if you choose this
              option.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="privateKey"
                  className="mb-1 block text-sm font-medium text-gray-600"
                >
                  Private Key of the Secondary Wallet (Base58 or Byte Array)
                </label>
                <input
                  id="privateKey"
                  // type="password"
                  autoComplete="off"
                  className={cn(
                    "block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                    !!errors?.privateKey &&
                      "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-none focus:ring-red-500",
                  )}
                  placeholder="Base58 string or [202,64,201,...]"
                  {...register("privateKey", {
                    required: "Private key is required",
                  })}
                />
                {errors?.privateKey && (
                  <p className="mt-2 text-sm text-red-600">
                    {errors.privateKey.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 pb-2 pt-8">
              {!connected ? (
                <Button
                  color="indigo"
                  type="button"
                  onClick={handleConnectWallet}
                >
                  Connect your wallet
                </Button>
              ) : (
                <Button color="indigo" type="submit" disabled={isFetching}>
                  {buttonText()}
                </Button>
              )}
            </div>
          </form>
        </>
      )}

      {data && targetWallet && (
        <>
          <div className="-ml-3 mb-4 flex items-center justify-between">
            <Button plain onClick={handleGoBack}>
              Back to private key input
            </Button>
          </div>
          <TokenList
            tokenAccounts={data.filter((a) => a.balance > 0n)}
            sourceWallet={targetWallet}
          />
        </>
      )}
    </div>
  );
}
