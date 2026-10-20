"use client";

import { notify } from "@/components";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { parseSecretKey } from "@/lib/solana/parse-keypair";
import { useOwnerAssets } from "@/state/queries/use-owner-assets";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { useConnector } from "@solana/connector/react";
import type { KeyPairSigner } from "@solana/kit";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { TokenList } from "./_components/token-list";

type FormValues = {
  privateKey: string;
};

export default function RemoveTokens() {
  const { isConnected } = useConnector();
  const { setOpen } = useConnectorDialog();
  const [sourceWallet, setSourceWallet] = useState<KeyPairSigner | null>(null);
  const { data, isFetching, refetch } = useOwnerAssets(
    sourceWallet?.address ?? "",
  );

  // The query is keyed by the source wallet, so load it once that is known;
  // calling refetch() right after setSourceWallet would still hit the old key.
  useEffect(() => {
    if (sourceWallet) void refetch();
  }, [sourceWallet, refetch]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      privateKey: "",
    },
  });

  const onSubmit = async (formData: FormValues) => {
    if (!isConnected) {
      setOpen(true);
      return;
    }

    const parsed = await parseSecretKey(formData.privateKey);
    if (!parsed.success) {
      notify({
        type: "error",
        title: "Invalid private key",
        description: parsed.error,
      });
      return;
    }
    setSourceWallet(parsed.signer);
  };

  const handleGoBack = () => {
    setSourceWallet(null);
  };

  const buttonText = () => {
    if (!isConnected) return "Connect your wallet";
    if (isFetching)
      return (
        <>
          <SpinnerIcon className="mr-2 -ml-1 size-5 animate-spin" />
          Loading tokens
        </>
      );

    return "Load tokens";
  };

  return (
    <div
      className={cn(
        "mx-auto w-[min(100%,var(--breakpoint-md))] overflow-visible bg-white px-4 pb-5 sm:rounded-lg sm:p-6 sm:shadow-sm",
        !!data && "pb-0!",
      )}
    >
      <h1 className="mb-4 font-display text-3xl font-semibold">
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
                  autoComplete="off"
                  className={cn(
                    "block w-full rounded-md border border-gray-300 px-3 py-2 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                    !!errors?.privateKey &&
                      "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500 focus:outline-hidden",
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

            <div className="flex flex-col items-center justify-center gap-2 pt-8 pb-2">
              {!isConnected ? (
                <Button
                  color="indigo"
                  type="button"
                  onClick={() => setOpen(true)}
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

      {data && sourceWallet && (
        <>
          <div className="mb-4 -ml-3 flex items-center justify-between">
            <Button plain onClick={handleGoBack}>
              Back to private key input
            </Button>
          </div>
          <TokenList
            tokenAccounts={data.filter((a) => a.balance > 0n)}
            sourceWallet={sourceWallet}
          />
        </>
      )}
    </div>
  );
}
