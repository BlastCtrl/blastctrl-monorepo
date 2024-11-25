import { notify } from "@/components/notification";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { isPublicKey, lamportsToSol } from "@/lib/solana/common";
import { retryWithBackoff } from "@/lib/utils";
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
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { type FormEvent, useState } from "react";
import { useRentQuery } from "./rent-query";
import { parseJsonKeypair } from "@/lib/solana/parse-keypair";
import { Box } from "./box";

type Field = string;
type Message = string;
type FormError = Record<Field, Message>;

export function SplitManualForm() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [accountToSplit, setAccountToSplit] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [keypairFile, setKeypairFile] = useState<File | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [formErrors, setFormErrors] = useState<FormError>({});
  const [formSuccess, setFormSuccess] = useState("");

  const debouncedAccountToSplit = useDebounce(accountToSplit, 300);
  const { data, refetch } = useStakeAccount(
    isPublicKey(debouncedAccountToSplit) ? debouncedAccountToSplit : undefined,
    false,
  );
  const { data: rentExemption } = useRentQuery(StakeProgram.space);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!publicKey || !sendTransaction) return;
    if (data === undefined) return;
    if (rentExemption === undefined) return;

    if (!isPublicKey(accountToSplit)) return;

    setFormErrors({});

    if (newAccountBalance === "") {
      setFormErrors({ balance: "New stake amount is required." });
      return;
    }
    if (lamportsToSol(rentExemption) >= Number(newAccountBalance)) {
      setFormErrors({
        balance: `New stake amount must be higher than the minimum rent (${rentExemption} lamports).`,
      });
      return;
    }
    if (Number(newAccountBalance) >= lamportsToSol(data.lamports)) {
      setFormErrors({
        balance: `New amount is higher than the original stake balance (${lamportsToSol(data.lamports)});`,
      });
      return;
    }

    try {
      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      const tx = new Transaction();
      let stakeAccount;
      if (keypairFile) {
        const parsed = await parseJsonKeypair(keypairFile);
        if (parsed.success) {
          stakeAccount = parsed.keypair;
        } else {
          setFormErrors({ keypair: `Invalid keypair format: ${parsed.error}` });
          return;
        }
      } else {
        stakeAccount = Keypair.generate();
      }

      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1e6 }),
        StakeProgram.split(
          {
            authorizedPubkey: publicKey,
            stakePubkey: new PublicKey(accountToSplit),
            splitStakePubkey: stakeAccount.publicKey,
            lamports: Number(newAccountBalance) * 1e9,
          },
          0,
        ),
      );

      tx.feePayer = publicKey;
      tx.recentBlockhash = value.blockhash;
      tx.partialSign(stakeAccount);
      const signature = await sendTransaction(tx, connection, {
        minContextSlot: context.slot,
        maxRetries: 0,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });
      if (!isConfirming) {
        setIsConfirming(true);
      }

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
      setFormSuccess(stakeAccount.publicKey.toString());
      refetch();
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
            invalid={accountToSplit !== "" && !isPublicKey(accountToSplit)}
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
        />
        {data &&
          (!publicKey ? (
            <div>
              <Button
                onClick={() => void setVisible(true)}
                type="button"
                color="indigo"
                className="w-full"
              >
                Connect your wallet
              </Button>
            </div>
          ) : (
            <div>
              <Button type="submit" color="indigo" className="w-full">
                {isConfirming && (
                  <SpinnerIcon className="-ml-1 mr-1  inline size-[1em] animate-spin" />
                )}
                Submit
              </Button>
            </div>
          ))}
      </form>
      {formSuccess && (
        <div className="mt-8 flex items-center gap-2 rounded-lg p-4 shadow ring-1 ring-black/5">
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
}: {
  newAccountBalance: string;
  setNewAccountBalance: (value: string) => void;
  keypairFile: File | null;
  setKeypairFile: (file: File) => void;
  accountToSplit: string;
  formError: FormError;
}) {
  const { data, isLoading, error } = useStakeAccount(
    isPublicKey(accountToSplit) ? accountToSplit : undefined,
  );

  if (!isLoading && data === undefined) return null;

  if (error) {
    return <div>{error.message}</div>;
  }

  return (
    <Fieldset disabled={isLoading || data === undefined}>
      <Field className="w-full">
        <Label className="font-medium sm:text-sm/6">
          Balance of the new account
        </Label>
        {!!data && (
          <Description className="text-zinc-500">
            Original account balance: {lamportsToSol(data?.lamports)}
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
          <Description className="text-red-600 data-[disabled]:opacity-50 sm:text-sm/6">
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
            className="my-1 block w-full truncate rounded-lg bg-indigo-500 px-4 py-1.5 text-center font-semibold text-white ring-1 ring-inset ring-indigo-300 hover:bg-indigo-400 aria-disabled:opacity-50"
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
        "rounded-lg border-0 bg-white py-1.5 text-zinc-900 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm/6",
        "focus:outline-none data-[focus]:ring-2 data-[focus]:ring-inset data-[focus]:ring-indigo-600",
        "data-[disabled]:bg-zinc-100 data-[disabled]:text-zinc-500",
        "data-[invalid]:border-red-600 data-[invalid]:text-red-600",
        className,
      )}
      {...props}
    />
  );
}
