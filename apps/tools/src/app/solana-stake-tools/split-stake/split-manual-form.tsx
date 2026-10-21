import { notify } from "@/components/notification";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { lamportsToSolString } from "@/lib/solana/common";
import { parseJsonKeypair } from "@/lib/solana/parse-keypair";
import { STAKE_ACCOUNT_SIZE } from "@/lib/solana/stake-account";
import { useRentQuery } from "@/state/queries/use-rent";
import { useStakeAccount } from "@/state/queries/use-stake-account";
import { Button, cn, SpinnerIcon } from "@blastctrl/ui";
import {
  Description,
  Field,
  Fieldset,
  Input,
  type InputProps,
  Label,
} from "@headlessui/react";
import {
  address,
  generateKeyPairSigner,
  isAddress,
  type KeyPairSigner,
  type Lamports,
} from "@solana/kit";
import { type FormEvent, useState } from "react";
import { Box } from "./box";
import {
  parseSolInput,
  splitAmountError,
  splitInstructions,
  splittableLamports,
} from "./split-plan";

type Field = string;
type Message = string;
type FormError = Record<Field, Message>;

export function SplitManualForm() {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();

  const [accountToSplit, setAccountToSplit] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [keypairFile, setKeypairFile] = useState<File | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [formErrors, setFormErrors] = useState<FormError>({});
  const [formSuccess, setFormSuccess] = useState("");

  const debouncedAccountToSplit = useDebounce(accountToSplit, 300);
  const { data, refetch } = useStakeAccount(
    isAddress(debouncedAccountToSplit) ? debouncedAccountToSplit : undefined,
    false,
  );
  const { data: rentExemption } = useRentQuery(STAKE_ACCOUNT_SIZE);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client || data === undefined || rentExemption === undefined) return;
    if (!isAddress(accountToSplit)) return;

    setFormErrors({});

    if (newAccountBalance === "") {
      setFormErrors({ balance: "New stake amount is required." });
      return;
    }
    const amount = parseSolInput(newAccountBalance);
    if (amount === null) {
      setFormErrors({ balance: "Enter a SOL amount with at most 9 decimals." });
      return;
    }
    // The program's own rules, checked before anything reaches the wallet.
    const amountError = splitAmountError(data, amount, rentExemption);
    if (amountError) {
      setFormErrors({ balance: amountError });
      return;
    }

    let splitStake: KeyPairSigner;
    if (keypairFile) {
      const parsed = await parseJsonKeypair(keypairFile);
      if (!parsed.success) {
        setFormErrors({ keypair: `Invalid keypair format: ${parsed.error}` });
        return;
      }
      splitStake = parsed.signer;
    } else {
      splitStake = await generateKeyPairSigner();
    }

    setIsConfirming(true);
    try {
      // The destination is funded with its rent by the wallet, then the
      // amount moves out of the source (see split-plan.ts for the rules).
      const result = await client.sendTransaction(
        splitInstructions({
          source: address(accountToSplit),
          destination: splitStake,
          authority: client.payer,
          amount,
          rent: rentExemption,
        }),
      );

      notify({
        type: "success",
        title: "Transaction confirmed",
        txid: result.context.signature,
      });
      setFormSuccess(splitStake.address);
      void refetch();
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
    <Box className="mt-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <Field className="w-full">
          <Label className="font-medium sm:text-sm/6">
            Stake Account to split
          </Label>
          <StyledInput
            autoCorrect="false"
            value={accountToSplit}
            onChange={({ target }) => setAccountToSplit(target.value)}
            invalid={accountToSplit !== "" && !isAddress(accountToSplit)}
            placeholder="Account address"
          />
        </Field>

        <FormInner
          newAccountBalance={newAccountBalance}
          setNewAccountBalance={setNewAccountBalance}
          accountToSplit={debouncedAccountToSplit}
          keypairFile={keypairFile}
          setKeypairFile={setKeypairFile}
          formError={formErrors}
          rentExemption={rentExemption}
        />
        {data &&
          (!client ? (
            <div>
              <Button
                onClick={() => setOpen(true)}
                type="button"
                color="indigo"
                className="w-full"
              >
                Connect your wallet
              </Button>
            </div>
          ) : (
            <div>
              <Button
                type="submit"
                color="indigo"
                className="w-full"
                disabled={isConfirming}
              >
                {isConfirming && (
                  <SpinnerIcon className="mr-1 -ml-1 inline size-[1em] animate-spin" />
                )}
                Submit
              </Button>
            </div>
          ))}
      </form>
      {formSuccess && (
        <div className="mt-8 flex items-center gap-2 rounded-lg p-4 shadow-sm ring-1 ring-black/5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-5 text-green-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            New staking account created:{" "}
            <strong className="text-blue-500">{formSuccess}</strong>
          </span>
        </div>
      )}
    </Box>
  );
}

function FormInner({
  newAccountBalance,
  setNewAccountBalance,
  keypairFile,
  setKeypairFile,
  accountToSplit,
  formError,
  rentExemption,
}: {
  newAccountBalance: string;
  setNewAccountBalance: (value: string) => void;
  keypairFile: File | null;
  setKeypairFile: (file: File) => void;
  accountToSplit: string;
  formError: FormError;
  rentExemption: Lamports | undefined;
}) {
  const { data, isLoading, error } = useStakeAccount(
    isAddress(accountToSplit) ? accountToSplit : undefined,
  );

  if (!isLoading && data === undefined) return null;

  if (error) {
    return <div>{error.message}</div>;
  }

  const splittable =
    data && rentExemption !== undefined
      ? splittableLamports(data, rentExemption)
      : undefined;

  return (
    <Fieldset disabled={isLoading || data === undefined}>
      <Field className="w-full">
        <Label className="font-medium sm:text-sm/6">
          Stake to move into the new account
        </Label>
        {!!data && (
          <Description className="text-zinc-500">
            {data.stake
              ? `Delegated stake: ${lamportsToSolString(data.stake.delegation.stake)} SOL`
              : `Balance: ${lamportsToSolString(data.lamports)} SOL`}
            {splittable !== undefined &&
              ` · available to split: ${lamportsToSolString(splittable)} SOL`}
            {rentExemption !== undefined &&
              `. The new account's rent-exempt reserve (${lamportsToSolString(rentExemption)} SOL) is paid by your wallet on top.`}
            {data.stake &&
              " A delegated account must keep at least 1 SOL of stake on each side."}
          </Description>
        )}
        <StyledInput
          type="text"
          autoCorrect="false"
          inputMode="decimal"
          value={newAccountBalance}
          invalid={!!formError?.balance}
          onChange={({ target }) => {
            if (/^\d*\.?\d{0,9}$/.test(target.value)) {
              setNewAccountBalance(target.value);
            }
          }}
          placeholder="Enter SOL amount"
        />
        {formError?.balance && (
          <Description className="text-red-600 data-disabled:opacity-50 sm:text-sm/6">
            {formError.balance}
          </Description>
        )}
      </Field>

      <Field className="mt-8">
        <div className="font-medium sm:text-sm/6">
          Address of the new account
          <span className="text-zinc-500"> (Optional)</span>
        </div>

        <div className="grid items-start gap-4 min-[435px]:grid-cols-2">
          <label
            aria-disabled={data === undefined || data === null}
            className="my-1 block w-full truncate rounded-lg bg-indigo-500 px-4 py-1.5 text-center font-semibold text-white ring-1 ring-indigo-300 ring-inset hover:bg-indigo-400 aria-disabled:opacity-50"
          >
            {keypairFile ? keypairFile.name : "Upload a keypair"}

            <Input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={({ target }) => {
                if (target.files && target.files[0]) {
                  setKeypairFile(target.files[0]);
                }
              }}
            />
          </label>
          <Description className="text-sm/6 text-zinc-500">
            You can optionally upload a JSON keypair file which will be used as
            the address of the new staking account.
          </Description>
        </div>

        {formError?.keypair && (
          <Description className="text-red-600 sm:text-sm/6">
            {formError.keypair}
          </Description>
        )}
      </Field>
    </Fieldset>
  );
}

function StyledInput({ className, ...props }: InputProps) {
  return (
    <Input
      className={cn(
        "mt-1 block w-full",
        "rounded-lg border-0 bg-white py-1.5 text-zinc-900 shadow-xs ring-1 ring-gray-300 ring-inset sm:text-sm/6",
        "focus:outline-hidden data-focus:ring-2 data-focus:ring-indigo-600 data-focus:ring-inset",
        "data-disabled:bg-zinc-100 data-disabled:text-zinc-500",
        "data-invalid:border-red-600 data-invalid:text-red-600",
        className,
      )}
      {...props}
    />
  );
}
