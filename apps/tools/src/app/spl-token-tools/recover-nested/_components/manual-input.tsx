import { notify } from "@/components";
import { useAppRpc } from "@/connector/app-rpc";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import {
  compress,
  lamportsToSolString,
  normalizeTokenAmount,
} from "@/lib/solana/common";
import { useSolBalance } from "@/state/queries/use-sol-balance";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { Dialog, Transition } from "@headlessui/react";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import {
  fetchAllMaybeToken,
  fetchMaybeToken,
  fetchMint,
  findAssociatedTokenPda,
  getTokenSize,
  type Token,
} from "@solana-program/token";
import { useConnector } from "@solana/connector/react";
import {
  address,
  isAddress,
  type Address,
  type MaybeAccount,
  lamports,
  lamportsToSol,
} from "@solana/kit";
import { Fragment, useState } from "react";
import { useForm } from "react-hook-form";
import {
  isAssociatedTokenAccount,
  recoverNestedInstructions,
  type TokenAccount,
} from "../_utils";
import {
  decimalFixedPointToNumber,
  decimalFixedPointToString,
} from "@solana/fixed-points";

type FormValues = {
  parentAta: string;
  nestedAta: string;
};

/** Everything the confirmation dialog shows, loaded and validated on submit. */
type Preview = {
  parent: TokenAccount;
  nested: TokenAccount;
  decimals: number;
  destination: { address: Address; amount: bigint; exists: boolean };
  /** Rent the wallet pays when the destination ATA has to be created. */
  destinationRent: bigint;
};

/** Base fee of the single-signature recover transaction. */
const TRANSACTION_FEE = 5000n;

export const ManualInput = () => {
  const { account } = useConnector();
  const { rpc } = useAppRpc();
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: balance, refetch } = useSolBalance();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const {
    register,
    reset,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      parentAta: "",
      nestedAta: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    if (!account || !rpc) {
      setOpen(true);
      return;
    }

    setIsProcessing(true);
    setPreview(null);
    try {
      const parentAddress = address(data.parentAta);
      const nestedAddress = address(data.nestedAta);

      let accounts: MaybeAccount<Token>[];
      try {
        accounts = await fetchAllMaybeToken(rpc, [
          parentAddress,
          nestedAddress,
        ]);
      } catch {
        throw new Error(
          "Could not decode the accounts. Have you entered valid token accounts?",
        );
      }
      const [parent, nested] = accounts;
      if (!parent?.exists) {
        throw new Error(
          `Parent account ${compress(parentAddress, 4)} not found`,
        );
      }
      if (!nested?.exists) {
        throw new Error(
          `Nested account ${compress(nestedAddress, 4)} not found`,
        );
      }

      if (!(await isAssociatedTokenAccount(parent, parent.data.owner))) {
        throw new Error(
          "The parent account is not an associated token account",
        );
      }
      if (nested.data.owner !== parent.address) {
        throw new Error(
          `The nested account is owned by ${compress(nested.data.owner, 4)}, not by the parent account`,
        );
      }
      if (!(await isAssociatedTokenAccount(nested, parent.address))) {
        throw new Error(
          "The nested account is not an associated token account of the parent, so it cannot be recovered",
        );
      }

      const mint = await fetchMint(rpc, nested.data.mint);
      const [destinationAddress] = await findAssociatedTokenPda({
        owner: account,
        mint: nested.data.mint,
        tokenProgram: nested.programAddress,
      });
      const destination = await fetchMaybeToken(rpc, destinationAddress);
      const destinationRent = destination.exists
        ? 0n
        : await rpc
            .getMinimumBalanceForRentExemption(BigInt(getTokenSize()))
            .send();

      setPreview({
        parent,
        nested,
        decimals: mint.data.decimals,
        destination: {
          address: destinationAddress,
          amount: destination.exists ? destination.data.amount : 0n,
          exists: destination.exists,
        },
        destinationRent,
      });
      setOpenDialog(true);
    } catch (error) {
      notify({
        type: "error",
        title: "Error loading account info",
        description: (
          <span className="break-all">
            {error instanceof Error ? error.message : String(error)}
          </span>
        ),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecover = async () => {
    if (!client) {
      setOpen(true);
      return;
    }
    if (!preview) return;

    setConfirming(true);
    try {
      const result = await client.sendTransaction(
        await recoverNestedInstructions(
          client.payer,
          preview.parent,
          preview.nested,
        ),
      );
      notify({
        type: "success",
        title: "Recover nested success",
        description: (
          <>
            Successfully recovered{" "}
            <span className="font-medium text-blue-300">
              {normalizeTokenAmount(
                preview.nested.data.amount.toString(),
                preview.decimals,
              )}
            </span>{" "}
            tokens.
          </>
        ),
        txid: result.context.signature,
      });
      reset();
    } catch (error) {
      notify({
        type: "error",
        title: "Error recovering nested account",
        description: (
          <span className="break-all">{transactionErrorMessage(error)}</span>
        ),
      });
    } finally {
      setPreview(null);
      setConfirming(false);
      setOpenDialog(false);
      void refetch();
    }
  };

  // What the wallet nets: the nested account's rent, minus the fee and the
  // rent of the destination ATA if it has to be created.
  const solChange = preview
    ? preview.nested.lamports - TRANSACTION_FEE - preview.destinationRent
    : 0n;
  const solChangeAbs = solChange < 0n ? -solChange : solChange;
  const solChangeSol =
    (solChange < 0n ? -1 : 1) *
    decimalFixedPointToNumber(lamportsToSol(lamports(solChangeAbs)));

  return (
    <>
      <div className="border-b border-gray-200 pb-4">
        <p className="text-sm text-gray-500">
          Enter the addresses of both the &quot;parent&quot;{" "}
          <abbr title="Associated Token Account">ATA</abbr> and the nested ATA
          to recover funds. The nested account will be deleted and its tokens
          will be transferred to your ATA of the same mint as the nested
          account, while the rent will be transferred to your wallet.
        </p>
      </div>

      <div className="my-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-x-2 gap-y-6 border-b border-gray-200 pb-6 sm:grid-cols-6">
            <div className="relative mt-1 sm:col-span-6">
              <label
                className="mb-1 block text-sm font-medium text-gray-600"
                htmlFor="parentAta"
              >
                Parent associated token account
              </label>
              <input
                id="parentAta"
                className={cn(
                  "block w-full rounded-md border border-gray-300 px-3 py-2 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                  !!errors?.parentAta &&
                    "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500 focus:outline-hidden",
                )}
                aria-invalid={errors?.parentAta ? "true" : "false"}
                {...register("parentAta", {
                  required: true,
                  validate: (value) =>
                    isAddress(value) || "Not a valid address",
                })}
                type="text"
              />
              {errors?.parentAta && (
                <p
                  className="mt-2 text-sm text-red-600"
                  id={errors?.parentAta.type}
                >
                  {errors?.parentAta.message}
                </p>
              )}
            </div>

            <div className="relative mt-1 sm:col-span-6">
              <label
                className="mb-1 block text-sm font-medium text-gray-600"
                htmlFor="nestedAta"
              >
                Nested associated token account
              </label>

              <input
                id="nestedAta"
                className={cn(
                  "block w-full rounded-md border border-gray-300 px-3 py-2 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                  !!errors?.nestedAta &&
                    "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500 focus:outline-hidden",
                )}
                aria-invalid={errors?.nestedAta ? "true" : "false"}
                {...register("nestedAta", {
                  required: true,
                  validate: {
                    address: (value) =>
                      isAddress(value) || "Not a valid address",
                    notEqualToParent: (value) => {
                      const { parentAta } = getValues();
                      return (
                        value !== parentAta ||
                        "Parent and nested ATA should not be the same"
                      );
                    },
                  },
                })}
                type="text"
              />
              {errors?.nestedAta && (
                <p
                  className="mt-2 text-sm text-red-600"
                  id={errors?.nestedAta.type}
                >
                  {errors?.nestedAta.message}
                </p>
              )}
            </div>
          </div>

          <div className="my-6">
            <div className="flex justify-end gap-2">
              <Button plain type="button" onClick={() => reset()}>
                Clear
              </Button>

              <Button color="indigo" type="submit" disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <SpinnerIcon className="mr-1 -ml-2 h-5 w-5 animate-spin" />
                    Confirming
                  </>
                ) : (
                  "Recover"
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>

      <Transition.Root show={openDialog} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={confirming ? () => {} : setOpenDialog}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="absolute top-[20vh] max-w-[92%] transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:relative sm:top-auto sm:my-8 sm:w-full sm:max-w-xl sm:p-6">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                      <CheckCircleIcon
                        className="h-6 w-6 text-indigo-600"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <Dialog.Title
                        as="h3"
                        className="text-lg leading-6 font-medium text-gray-900"
                      >
                        Recover nested account available
                      </Dialog.Title>
                      {account && preview && (
                        <div className="flex flex-col gap-y-6">
                          <div className="my-3">
                            <p className="text-left text-sm text-gray-600">
                              Balance changes after recovering
                            </p>
                            <div className="mt-4 flex-col">
                              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                                <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                                  <div className="overflow-hidden shadow-sm ring-1 ring-black/5 md:rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-300">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          {[
                                            "Address",
                                            "Token",
                                            "Change",
                                            "Post Balance",
                                          ].map((col) => (
                                            <th
                                              key={col}
                                              className="px-2 pr-3 pl-4 text-left text-sm font-semibold whitespace-nowrap text-gray-900"
                                              scope="col"
                                            >
                                              {col}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200 bg-white">
                                        <tr>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {compress(account, 4)}
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            ◎ SOL
                                          </td>
                                          <td>
                                            <span
                                              className={cn(
                                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                                solChange >= 0n
                                                  ? "bg-green-100 text-green-800"
                                                  : "bg-amber-100 text-amber-800",
                                              )}
                                            >
                                              {solChange >= 0n ? "+" : "-"}
                                              {lamportsToSolString(
                                                solChangeAbs,
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {(balance ?? 0) + solChangeSol}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {compress(
                                              preview.destination.address,
                                              4,
                                            )}
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {compress(
                                              preview.nested.data.mint,
                                              4,
                                            )}
                                          </td>
                                          <td>
                                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                              +
                                              {normalizeTokenAmount(
                                                preview.nested.data.amount.toString(),
                                                preview.decimals,
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {normalizeTokenAmount(
                                              (
                                                preview.destination.amount +
                                                preview.nested.data.amount
                                              ).toString(),
                                              preview.decimals,
                                            )}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {compress(
                                              preview.nested.address,
                                              4,
                                            )}
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            ◎ SOL
                                          </td>
                                          <td>
                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                              -
                                              {decimalFixedPointToString(
                                                lamportsToSol(
                                                  preview.nested.lamports,
                                                ),
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            0
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {compress(
                                              preview.nested.address,
                                              4,
                                            )}
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            {compress(
                                              preview.nested.data.mint,
                                              4,
                                            )}
                                          </td>
                                          <td>
                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                              -
                                              {normalizeTokenAmount(
                                                preview.nested.data.amount.toString(),
                                                preview.decimals,
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6">
                                            0
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {!preview.destination.exists && (
                              <p className="mt-4 text-left text-sm text-gray-600">
                                Your associated token account for this mint
                                doesn&apos;t exist yet. It will be created in
                                the same transaction, which costs{" "}
                                {lamportsToSolString(preview.destinationRent)}{" "}
                                SOL in rent.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <button
                      type="button"
                      disabled={confirming}
                      className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-xs hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden sm:ml-3 sm:w-auto sm:text-sm"
                      onClick={handleRecover}
                    >
                      {confirming && (
                        <SpinnerIcon className="mr-1 -ml-2 h-5 w-5 animate-spin" />
                      )}
                      {confirming ? "Confirming" : "Recover"}
                    </button>
                    <button
                      type="button"
                      disabled={confirming}
                      className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-xs hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden sm:mt-0 sm:w-auto sm:text-sm"
                      onClick={() => setOpenDialog(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
};
