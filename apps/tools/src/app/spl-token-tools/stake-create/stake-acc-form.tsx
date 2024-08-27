"use client";

import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/description-list";
import { notify } from "@/components/notification";
import { isPublicKey } from "@/lib/solana/common";
import { retryWithBackoff } from "@/lib/utils";
import { Button, cn, SpinnerIcon, Switch, SwitchGroup } from "@blastctrl/ui";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Field,
  Fieldset,
  Input,
  Label,
} from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  Lockup,
  PublicKey,
  StakeAuthorizationLayout,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .transform((v) => +v)
    .refine((amount) => !isNaN(amount), { message: "Amount must be a number" })
    .refine((amount) => amount > 0, {
      message: "Amount must be greater than 0",
    }),
  voteAddress: z
    .string()
    .refine((v) => isPublicKey(v), { message: "Not a valid public key" })
    .transform((v) => new PublicKey(v))
    .optional()
    .or(z.literal("")),
  withdrawAuth: z
    .string()
    .refine((v) => isPublicKey(v), { message: "Not a valid public key" })
    .transform((v) => new PublicKey(v))
    .optional()
    .or(z.literal("")),
  stakerAuth: z
    .string()
    .refine((v) => isPublicKey(v), { message: "Not a valid public key" })
    .transform((v) => new PublicKey(v))
    .optional()
    .or(z.literal("")),
  lockTime: z
    .string()
    // TODO: need to do better validation here
    .transform((v) => v + "Z")
    .optional()
    .or(z.literal("")),
});

type FormSchemaFields = z.input<typeof formSchema>;
type FormSchemaOutput = z.output<typeof formSchema>;

export function StakeAccountForm() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [isConfirming, setIsConfirming] = useState(false);
  const [useLockup, setUseLockup] = useState(false);
  const [useDelegate, setUseDelegate] = useState(false);
  const [useAuthorities, setUseAuthorities] = useState(false);
  const [submitData, setSubmitData] = useState<FormSchemaOutput | null>(null);

  const isConfirmDialogOpen = !!submitData;
  const closeConfirmDialog = () => setSubmitData(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormSchemaFields>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      voteAddress: "GREEDkpTvpKzcGvBu9qd36yk6BfjTWPShB67gLWuixMv",
    },
  });

  const onSubmit = async (values: unknown) => {
    const data = values as FormSchemaOutput;
    setSubmitData(data);
  };

  const submitTransaction = async (data: FormSchemaOutput) => {
    if (!publicKey || !sendTransaction) return;

    try {
      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      const tx = new Transaction();
      const signer = Keypair.generate();
      const stakeAmount = data.amount * LAMPORTS_PER_SOL;

      let lockup;
      if (useLockup && data.lockTime) {
        const unixTimestamp = Math.floor(
          new Date(data.lockTime).getTime() / 1000,
        );
        lockup = new Lockup(unixTimestamp, 0, publicKey);
      }

      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1e6 }),
        StakeProgram.createAccount({
          fromPubkey: publicKey,
          lamports: stakeAmount,
          stakePubkey: signer.publicKey,
          authorized: {
            staker: publicKey,
            withdrawer: publicKey,
          },
          lockup,
        }),
      );

      if (useDelegate && data.voteAddress) {
        tx.add(
          StakeProgram.delegate({
            authorizedPubkey: publicKey,
            votePubkey: data.voteAddress,
            stakePubkey: signer.publicKey,
          }),
        );
      }

      if (useAuthorities && data.stakerAuth) {
        tx.add(
          StakeProgram.authorize({
            authorizedPubkey: publicKey,
            newAuthorizedPubkey: data.stakerAuth,
            stakePubkey: signer.publicKey,
            stakeAuthorizationType: StakeAuthorizationLayout.Staker,
            custodianPubkey: publicKey,
          }),
        );
      }
      if (useAuthorities && data.withdrawAuth) {
        tx.add(
          StakeProgram.authorize({
            authorizedPubkey: publicKey,
            newAuthorizedPubkey: data.withdrawAuth,
            stakePubkey: signer.publicKey,
            stakeAuthorizationType: StakeAuthorizationLayout.Withdrawer,
            custodianPubkey: publicKey,
          }),
        );
      }

      tx.feePayer = publicKey;
      tx.recentBlockhash = value.blockhash;
      tx.partialSign(signer);

      const signature = await sendTransaction(tx, connection, {
        minContextSlot: context.slot,
        maxRetries: 0,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });
      if (!isConfirming) {
        setIsConfirming(true);
      }

      console.log(signature);

      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: value.blockhash,
          lastValidBlockHeight: value.lastValidBlockHeight,
        },
        "confirmed",
      );

      if (result.value.err) throw Error(JSON.stringify(result.value.err));

      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: signature,
      });
      setSubmitData(null);
    } catch (error: any) {
      notify({
        type: "error",
        title: "Transaction error",
        description: error.message,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-4 flex flex-col gap-4"
    >
      <Field>
        <Label className="font-medium">Stake amount</Label>
        <Input
          {...register("amount", { required: true })}
          className={inputClass}
          invalid={!!errors?.amount}
          type="text"
        />
      </Field>

      <div className="mt-4">
        <SwitchGroup>
          <Field className="flex items-center gap-2">
            <Switch
              checked={useAuthorities}
              onChange={setUseAuthorities}
              className="shrink-0"
            />
            <Label className="font-semibold text-zinc-700">
              Modify signing authorities
            </Label>
          </Field>
        </SwitchGroup>

        {useAuthorities && (
          <Fieldset className="mt-2 space-y-4">
            <Field>
              <Label className="text-sm/4 text-zinc-500">
                Withdraw authority withdraws stake and can update withdraw AND
                staking authorities
              </Label>
              <Input
                {...register("withdrawAuth", { required: useAuthorities })}
                className={inputClass}
                invalid={!!errors?.withdrawAuth}
                placeholder="Address of the withdraw authority"
                type="text"
              />
            </Field>

            <Field>
              <Label className="text-sm/4 text-zinc-500">
                Stake authority can perform actions on the stake such as
                delegation, deactivation, merging and can set a new stake
                authority
              </Label>
              <Input
                {...register("stakerAuth", { required: useAuthorities })}
                className={inputClass}
                invalid={!!errors?.stakerAuth}
                placeholder="Address of the stake authority"
                type="text"
              />
            </Field>
          </Fieldset>
        )}
      </div>

      <div className="mt-4">
        <SwitchGroup>
          <Field className="flex items-center gap-2">
            <Switch
              checked={useDelegate}
              onChange={setUseDelegate}
              className="shrink-0"
            />
            <Label className="font-semibold text-zinc-700">
              Delegate Stake
            </Label>
          </Field>
        </SwitchGroup>

        {useDelegate && (
          <Field className="mt-2">
            <Label className="text-sm/5 text-zinc-500">
              Set the vote address of the validator to which the staked account
              will be delegated to.
            </Label>

            <Input
              {...register("voteAddress", { required: useDelegate })}
              className={inputClass}
              invalid={!!errors?.voteAddress}
              placeholder="Validator vote address"
              type="text"
            />
          </Field>
        )}
      </div>

      <div className="mt-4">
        <SwitchGroup>
          <Field className="flex items-center gap-2">
            <Switch
              checked={useLockup}
              onChange={setUseLockup}
              className="shrink-0"
            />
            <Label className="font-semibold text-zinc-700">
              Set Lockup Configuration
            </Label>
          </Field>
        </SwitchGroup>

        {useLockup && (
          <Fieldset className="mt-2 space-y-4">
            <Field>
              <Label className="text-sm/5 text-zinc-500">
                The custodian has the control over the staking account lockup
                period
              </Label>
              <div className="relative">
                <input
                  // {...register("custodian", { required: useLockup })}
                  readOnly
                  inert
                  className={inputClass}
                  placeholder="Address of the lockup custodian"
                  type="text"
                  value={publicKey?.toString() ?? ""}
                />
                {/* <Button
                  type="button"
                  onClick={() =>
                    setValue("custodian", PublicKey.default.toString())
                  }
                  className="!absolute right-0 top-0 scale-90"
                  plain
                >
                  Set to empty pubkey
                </Button> */}
              </div>
            </Field>

            <Field>
              <Label className="text-sm/5 text-zinc-500">
                Staking account unlock date (UTC)
              </Label>
              <Input
                {...register("lockTime")}
                className={inputClass}
                invalid={!!errors?.lockTime}
                type="datetime-local"
              />
              {errors?.lockTime && (
                <small className="text-red-600">
                  {errors.lockTime.message}
                </small>
              )}
            </Field>
          </Fieldset>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        {errors.withdrawAuth?.message}
        <Button
          disabled={isConfirming}
          color="indigo"
          type="submit"
          className="w-[min(320px,100%)]"
        >
          {isConfirming ? (
            <SpinnerIcon className="-ml-1 mr-1 inline h-5 w-5 animate-spin" />
          ) : (
            "Submit"
          )}
        </Button>
      </div>

      <Dialog
        open={isConfirmDialogOpen}
        onClose={closeConfirmDialog}
        transition
        className="fixed inset-0 flex w-screen items-center justify-center bg-black/30 p-4 transition duration-300 ease-out data-[closed]:opacity-0"
      >
        <div className="fixed inset-0 w-screen overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="max-w-lg space-y-4 rounded-lg bg-white p-4 shadow">
              <DialogTitle className="font-bold">
                Confirm Stake Account Creation
              </DialogTitle>

              {submitData && (
                <div>
                  <DescriptionList className="w-full">
                    <DescriptionTerm>Staked Amount</DescriptionTerm>
                    <DescriptionDetails>{submitData.amount}</DescriptionDetails>
                    {submitData.voteAddress && (
                      <>
                        <DescriptionTerm>
                          Validator Vote Address
                        </DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {submitData.voteAddress.toString()}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.withdrawAuth && (
                      <>
                        <DescriptionTerm>Withdraw Authority</DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {submitData.withdrawAuth.toString()}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.stakerAuth && (
                      <>
                        <DescriptionTerm>Staker Authority</DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {submitData.stakerAuth.toString()}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.lockTime && (
                      <>
                        <DescriptionTerm>Lockup (UTC)</DescriptionTerm>
                        <DescriptionDetails>
                          {new Date(submitData.lockTime).toLocaleString(
                            undefined,
                            {
                              timeZone: "UTC",
                            },
                          )}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.lockTime && (
                      <>
                        <DescriptionTerm>Lockup (Local)</DescriptionTerm>
                        <DescriptionDetails>
                          {new Date(submitData.lockTime).toLocaleString()}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.lockTime && (
                      <>
                        <DescriptionTerm>Lockup (timestamp)</DescriptionTerm>
                        <DescriptionDetails>
                          {Math.floor(
                            new Date(submitData.lockTime).getTime() / 1000,
                          )}
                        </DescriptionDetails>
                      </>
                    )}
                    {useLockup && (
                      <>
                        <DescriptionTerm>Lockup Custodian</DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {publicKey?.toString()}
                        </DescriptionDetails>
                      </>
                    )}
                  </DescriptionList>
                </div>
              )}

              <div className="flex justify-end gap-4">
                <Button plain onClick={closeConfirmDialog}>
                  Cancel
                </Button>
                {submitData && (
                  <Button
                    onClick={async () => {
                      const data = submitData;
                      closeConfirmDialog();
                      await submitTransaction(data);
                    }}
                    color="indigo"
                  >
                    Confirm
                  </Button>
                )}
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </form>
  );
}

const inputClass = cn(
  "mt-2 block w-full rounded-lg border border-zinc-300 bg-white/5 px-3 py-1 text-sm/6 text-zinc-900",
  "focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25",
  "h-[36px] grow",
  "data-[disabled]:bg-zinc-100 data-[disabled]:text-zinc-500",
  "data-[invalid]:border-red-600 data-[invalid]:text-red-600 data-[invalid]:data-[focus]:outline-red-600",
);
