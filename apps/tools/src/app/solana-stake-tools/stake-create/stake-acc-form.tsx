"use client";

import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/description-list";
import { InfoTooltip } from "@/components/info-tooltip";
import { notify } from "@/components/notification";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
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
import {
  getAuthorizeInstruction,
  getDelegateStakeInstruction,
  getInitializeInstruction,
  STAKE_PROGRAM_ADDRESS,
  StakeAuthorize,
  type LockupArgs,
} from "@solana-program/stake";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  address,
  generateKeyPairSigner,
  isAddress,
  lamports,
  sol,
  solToLamports,
  type Instruction,
} from "@solana/kit";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

/** Minimum delegation under SIMD-0490 (Stake v5), in SOL. */
const MIN_STAKE_SOL = 1;
/** Size of a `StakeStateV2` account. */
const STAKE_ACCOUNT_SIZE = 200n;

const addressField = z
  .string()
  .trim()
  .refine(isAddress, { error: "Not a valid public key" })
  .transform(address);

/** Kept as a string: `sol()` parses decimal strings exactly, a float would not. */
const amountField = z
  .string()
  .trim()
  .min(1, { error: "Amount is required" })
  .regex(/^\d+(\.\d{1,9})?$/, {
    error: "Amount must be a number with at most 9 decimals",
  })
  .refine((v) => Number(v) > 0, { error: "Amount must be greater than 0" })
  // SIMD-0490 (Stake v5) raises the minimum delegation to 1 SOL, and new
  // accounts can't be created below it. The amount here is the delegation;
  // the rent-exempt reserve is funded on top of it.
  .refine((v) => Number(v) >= MIN_STAKE_SOL, {
    error: `Minimum stake is ${MIN_STAKE_SOL} SOL (SIMD-0490)`,
  });

/** `datetime-local` carries no zone; the tool treats the value as UTC. Outputs unix seconds. */
const lockTimeField = z
  .string()
  .min(1, { error: "Unlock date is required" })
  .transform((v) => Date.parse(`${v}Z`))
  .refine((ms) => !Number.isNaN(ms), { error: "Not a valid date" })
  .refine((ms) => ms > Date.now(), {
    error: "Unlock date must be in the future",
  })
  .transform((ms) => Math.floor(ms / 1000));

type Toggles = {
  useDelegate: boolean;
  useAuthorities: boolean;
  useLockup: boolean;
};

/**
 * A field that is validated only while its switch is on; otherwise it is
 * ignored. `.optional()` matters: a bare `.transform()` still rejects a key
 * that was never registered ("expected nonoptional").
 */
const when = <T extends z.ZodType>(enabled: boolean, field: T) =>
  (enabled
    ? field
    : z
        .unknown()
        .optional()
        .transform(() => undefined)) as unknown as z.ZodType<
    z.output<T> | undefined,
    z.input<T> | undefined
  >;

// The switches live outside the form, so the schema is rebuilt from them on
// every validation (see the resolver below). Inline `required` rules on
// `register` would be ignored once a resolver is in place.
const createFormSchema = (t: Toggles) =>
  z.object({
    amount: amountField,
    voteAddress: when(t.useDelegate, addressField),
    withdrawAuth: when(t.useAuthorities, addressField),
    stakerAuth: when(t.useAuthorities, addressField),
    lockTime: when(t.useLockup, lockTimeField),
  });

type FormSchema = ReturnType<typeof createFormSchema>;
type FormSchemaFields = z.input<FormSchema>;
type FormSchemaOutput = z.output<FormSchema>;

export function StakeAccountForm() {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
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
  } = useForm<FormSchemaFields, Toggles, FormSchemaOutput>({
    context: { useDelegate, useAuthorities, useLockup },
    resolver: (values, context, options) =>
      zodResolver(createFormSchema(context!))(values, context, options),
    defaultValues: {
      voteAddress: "GREEDkpTvpKzcGvBu9qd36yk6BfjTWPShB67gLWuixMv",
    },
  });

  const onSubmit = async (data: FormSchemaOutput) => {
    if (!client) {
      setOpen(true);
      return;
    }
    setSubmitData(data);
  };

  const submitTransaction = async (data: FormSchemaOutput) => {
    if (!client) return;
    setIsConfirming(true);

    try {
      const owner = client.payer;
      const stake = await generateKeyPairSigner();
      // The entered amount is what gets delegated, so the rent-exempt reserve
      // is funded on top of it rather than taken out of it.
      const rentReserve = await client.getMinimumBalance(
        Number(STAKE_ACCOUNT_SIZE),
      );
      const stakeAmount = solToLamports(sol(data.amount));
      const accountLamports = lamports(stakeAmount + rentReserve);

      const lockup: LockupArgs = {
        unixTimestamp: data.lockTime ?? 0,
        epoch: 0,
        custodian: owner.address,
      };

      // Create and initialize with the owner as both authorities, delegate
      // while the owner is still the staker, then hand off the authorities.
      const instructions: Instruction[] = [
        getCreateAccountInstruction({
          payer: owner,
          newAccount: stake,
          lamports: accountLamports,
          space: STAKE_ACCOUNT_SIZE,
          programAddress: STAKE_PROGRAM_ADDRESS,
        }),
        getInitializeInstruction({
          stake: stake.address,
          arg0: { staker: owner.address, withdrawer: owner.address },
          arg1: lockup,
        }),
      ];

      if (data.voteAddress) {
        instructions.push(
          getDelegateStakeInstruction({
            stake: stake.address,
            vote: data.voteAddress,
            stakeAuthority: owner,
          }),
        );
      }

      if (data.stakerAuth) {
        instructions.push(
          getAuthorizeInstruction({
            stake: stake.address,
            authority: owner,
            arg0: data.stakerAuth,
            arg1: StakeAuthorize.Staker,
          }),
        );
      }
      if (data.withdrawAuth) {
        instructions.push(
          getAuthorizeInstruction({
            stake: stake.address,
            authority: owner,
            // Required when a lockup is in force; harmless otherwise.
            lockupAuthority: owner,
            arg0: data.withdrawAuth,
            arg1: StakeAuthorize.Withdrawer,
          }),
        );
      }

      // One transaction: the client fetches a blockhash, estimates compute
      // units, signs with the wallet and the new stake keypair, sends, and
      // waits for confirmation.
      const result = await client.sendTransaction(instructions);

      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: result.context.signature,
      });
      setSubmitData(null);
    } catch (error) {
      notify({
        type: "error",
        title: "Transaction error",
        description: transactionErrorMessage(error),
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
          {...register("amount")}
          className={inputClass}
          invalid={!!errors?.amount}
          type="text"
        />
        {errors?.amount && (
          <small className="text-red-600">{errors.amount.message}</small>
        )}
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
                {...register("withdrawAuth")}
                className={inputClass}
                invalid={!!errors?.withdrawAuth}
                placeholder="Address of the withdraw authority"
                type="text"
              />
              {errors?.withdrawAuth && (
                <small className="text-red-600">
                  {errors.withdrawAuth.message}
                </small>
              )}
            </Field>

            <Field>
              <Label className="text-sm/4 text-zinc-500">
                Stake authority can perform actions on the stake such as
                delegation, deactivation, merging and can set a new stake
                authority
              </Label>
              <Input
                {...register("stakerAuth")}
                className={inputClass}
                invalid={!!errors?.stakerAuth}
                placeholder="Address of the stake authority"
                type="text"
              />
              {errors?.stakerAuth && (
                <small className="text-red-600">
                  {errors.stakerAuth.message}
                </small>
              )}
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
              {...register("voteAddress")}
              className={inputClass}
              invalid={!!errors?.voteAddress}
              placeholder="Validator vote address"
              type="text"
            />
            {errors?.voteAddress && (
              <small className="text-red-600">
                {errors.voteAddress.message}
              </small>
            )}
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
                <InfoTooltip className="ml-1 inline-block">
                  We currently don&apos;t support modifying the staking account
                  lockup custodian during stake account creation. You can
                  however use the{" "}
                  <Link
                    href="/solana-stake-tools/set-lockup"
                    className="font-medium text-blue-400"
                  >
                    Modify stake account lockup
                  </Link>{" "}
                  tool to change the lockup settings after the account has been
                  created.
                </InfoTooltip>
              </Label>
              <div className="relative">
                <input
                  // {...register("custodian", { required: useLockup })}
                  readOnly
                  inert
                  className={inputClass}
                  placeholder="Address of the lockup custodian"
                  type="text"
                  value={client?.payer.address ?? ""}
                />
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
        {client ? (
          <Button
            disabled={isConfirming}
            color="indigo"
            type="submit"
            className="w-[min(320px,100%)]"
          >
            {isConfirming ? (
              <SpinnerIcon className="mr-1 -ml-1 inline h-5 w-5 animate-spin" />
            ) : (
              "Submit"
            )}
          </Button>
        ) : (
          <Button onClick={() => setOpen(true)} className="w-[min(320px,100%)]">
            Connect your wallet
          </Button>
        )}
      </div>

      <Dialog
        open={isConfirmDialogOpen}
        onClose={closeConfirmDialog}
        transition
        className="fixed inset-0 flex w-screen items-center justify-center bg-black/30 p-4 transition duration-300 ease-out data-closed:opacity-0"
      >
        <div className="fixed inset-0 w-screen overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="max-w-lg min-w-75 space-y-4 rounded-lg bg-white p-4 shadow-sm">
              <DialogTitle className="font-bold">
                Confirm Stake Account Creation
              </DialogTitle>

              {submitData && (
                <div>
                  <DescriptionList className="w-full">
                    <DescriptionTerm>Staked Amount</DescriptionTerm>
                    <DescriptionDetails>
                      {submitData.amount} SOL
                      <span className="block text-xs text-zinc-500">
                        The rent-exempt reserve is added on top of this.
                      </span>
                    </DescriptionDetails>
                    {submitData.voteAddress && (
                      <>
                        <DescriptionTerm>
                          Validator Vote Address
                        </DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {submitData.voteAddress}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.withdrawAuth && (
                      <>
                        <DescriptionTerm>Withdraw Authority</DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {submitData.withdrawAuth}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.stakerAuth && (
                      <>
                        <DescriptionTerm>Staker Authority</DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {submitData.stakerAuth}
                        </DescriptionDetails>
                      </>
                    )}
                    {submitData.lockTime !== undefined && (
                      <>
                        <DescriptionTerm>Lockup (UTC)</DescriptionTerm>
                        <DescriptionDetails>
                          {new Date(submitData.lockTime * 1000).toLocaleString(
                            undefined,
                            { timeZone: "UTC" },
                          )}
                        </DescriptionDetails>
                        <DescriptionTerm>Lockup (Local)</DescriptionTerm>
                        <DescriptionDetails>
                          {new Date(
                            submitData.lockTime * 1000,
                          ).toLocaleString()}
                        </DescriptionDetails>

                        <DescriptionTerm>Lockup (timestamp)</DescriptionTerm>
                        <DescriptionDetails>
                          {submitData.lockTime}
                        </DescriptionDetails>
                      </>
                    )}

                    {useLockup && (
                      <>
                        <DescriptionTerm>Lockup Custodian</DescriptionTerm>
                        <DescriptionDetails className="truncate">
                          {client?.payer.address}
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
  "focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25",
  "h-[36px] grow",
  "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
  "data-invalid:border-red-600 data-invalid:text-red-600 data-invalid:data-focus:outline-red-600",
);
