import {
  compress,
  lamportsToSol,
  lamportsToSolString,
} from "@/lib/solana/common";
import type { StakeAccountType } from "@/state/queries/use-user-stake-accounts";
import { useValidatorData } from "@/state/queries/use-validator-data";
import {
  CloseButton,
  Dialog,
  DialogBackdrop,
  DialogPanel,
} from "@headlessui/react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/16/solid";
import { useWallet } from "@solana/wallet-adapter-react";

import { useState } from "react";

type PickerDialogProps = {
  data: StakeAccountType[] | undefined;
  selectedAccount: StakeAccountType | null;
  setSelectedAccount: (account: StakeAccountType | null) => void;
};

export function PickerDialog({
  data,
  selectedAccount,
  setSelectedAccount,
}: PickerDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { publicKey } = useWallet();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-between gap-x-2 rounded-lg border border-zinc-950/10 px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] text-base/6 font-medium text-zinc-950 data-[active]:bg-zinc-950/[2.5%] data-[hover]:bg-zinc-950/[2.5%] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] sm:text-sm/6"
      >
        {selectedAccount === null ? (
          <div className="opacity-50">Select&hellip;</div>
        ) : (
          <div className="flex w-full items-center gap-2.5 overflow-hidden">
            <span className="min-w-0 grow truncate text-left">
              {compress(selectedAccount.accountId.toString(), 4)}
            </span>
            <span className="whitespace-nowrap">
              ({lamportsToSolString(selectedAccount.lamports)} SOL)
            </span>
          </div>
        )}
        <ChevronUpDownIcon className="-mr-1 ml-2 size-4 shrink-0 text-zinc-700" />
      </button>
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="relative z-50"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/50 transition duration-300 data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 w-screen overflow-y-auto p-6 sm:p-0">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel
              transition
              className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
            >
              <div className="space-y-4">
                {data
                  ?.sort((a, b) => b.lamports - a.lamports)
                  ?.map((stake) => (
                    <CloseButton
                      key={stake.accountId.toString()}
                      className="w-full flex-col items-start justify-between rounded-md bg-gray-50 p-4 ring-2 ring-black/10 hover:ring-2 hover:ring-indigo-600"
                      onClick={() => {
                        setSelectedAccount(stake);
                      }}
                    >
                      <div className="flex w-full justify-between">
                        <div className="flex flex-wrap items-center gap-y-1">
                          <span className="mr-1.5">
                            {compress(stake.accountId.toString(), 4)}
                          </span>
                          {stake.data.info.meta.authorized.withdrawer ===
                            publicKey?.toString() && (
                            <span className="mr-0.5 rounded border border-gray-400 bg-gray-100 px-1 py-0.5 text-[10px]/3 font-semibold uppercase text-gray-700">
                              Withdrawer
                            </span>
                          )}
                          {stake.data.info.meta.authorized.staker ===
                            publicKey?.toString() && (
                            <span className="rounded border border-gray-400 bg-gray-100 px-1 py-0.5 text-[10px]/3 font-semibold uppercase text-gray-700">
                              Staker
                            </span>
                          )}
                        </div>
                        <span>{lamportsToSol(stake.lamports)} SOL</span>
                      </div>
                      <ValidatorInfo account={stake} />
                    </CloseButton>
                  ))}
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function ValidatorInfo({ account }: { account: StakeAccountType }) {
  const { data, error } = useValidatorData(
    account.data.info.stake?.delegation.voter,
  );

  if (account.data.info.stake === null) {
    return (
      <div className="mt-3 text-left text-sm">
        This stake account isn&apos;t delegated
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-3 h-8 w-full animate-pulse rounded-md bg-indigo-200" />
    );
  }

  if (error) {
    return (
      <p className="text-left text-xs text-red-500">
        Failed to load validator data
      </p>
    );
  }

  return (
    <div className="mt-3 flex items-center space-x-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.image}
        alt={data.name}
        width={24}
        height={24}
        className="size-8 rounded-full"
      />
      {data.website && (
        <a
          href={data.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-sm">{data.name}</span>

          <ArrowTopRightOnSquareIcon className="ml-1 inline-block size-5 -translate-y-0.5" />
        </a>
      )}
    </div>
  );
}
