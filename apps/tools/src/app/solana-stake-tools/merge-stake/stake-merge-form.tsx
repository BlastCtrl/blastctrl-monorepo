import { compress } from "@/lib/solana";
import { lamportsToSolString } from "@/lib/solana/common";
import { useCurrentEpoch } from "@/state/queries/use-epoch";
import { useUserStakeAccounts } from "@/state/queries/use-user-stake-accounts";
import type { StakeAccountType } from "@/state/queries/use-user-stake-accounts";
import { useValidatorData } from "@/state/queries/use-validator-data";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import type { Address } from "@solana/kit";
import { useState } from "react";
import { Box } from "./box";
import { useMergeStakesMutation } from "./merge-mutation";
import { lamportsToSol } from "@solana/kit";
import { decimalFixedPointToString } from "@solana/fixed-points";

export function StakeMergeForm({ owner }: { owner: Address }) {
  const epochQuery = useCurrentEpoch();
  const stakeAccountsQuery = useUserStakeAccounts(owner);
  const { mutate, isPending } = useMergeStakesMutation();

  const [selectedPrimary, setSelectedPrimary] =
    useState<StakeAccountType | null>(null);
  const [selectedSecondary, setSelectedSecondary] =
    useState<StakeAccountType | null>(null);

  const handlePrimarySelection = (account: StakeAccountType) => {
    setSelectedPrimary(account);
    setSelectedSecondary(null);
  };

  const reset = () => {
    setSelectedPrimary(null);
    setSelectedSecondary(null);
  };

  if (!!epochQuery.error || !!stakeAccountsQuery.error) {
    return (
      <Box className="mt-4 grid place-content-center">
        <div className="py-10 text-center">
          {epochQuery.error && "There was an error loading the current epoch"}
          {stakeAccountsQuery.error &&
            "There was an error loading stake accounts"}
        </div>
      </Box>
    );
  }

  if (epochQuery.isPending || stakeAccountsQuery.isPending) {
    return (
      <Box className="mt-4">
        <div className="py-10">
          <SpinnerIcon className="mx-auto size-6 animate-spin" />
        </div>
      </Box>
    );
  }

  const data = stakeAccountsQuery.data;
  const stakeAccounts = selectedPrimary
    ? getMergeableStakeAccounts(data, selectedPrimary, epochQuery.data.epoch)
    : [...data].sort((a, b) => Number(b.lamports - a.lamports));

  const accountRow = (
    stake: StakeAccountType,
    onSelect: (stake: StakeAccountType) => void,
  ) => (
    <button
      key={stake.address}
      className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-y-1 rounded-md bg-gray-50 p-4 ring-2 ring-black/10 hover:ring-2 hover:ring-indigo-600"
      onClick={() => onSelect(stake)}
    >
      <span className="justify-self-start">{compress(stake.address, 4)}</span>
      <span className="justify-self-end text-right">
        {decimalFixedPointToString(lamportsToSol(stake.lamports))} SOL
      </span>
      <div className="justify-self-start">
        <ValidatorInfo account={stake} />
      </div>
      <div className="flex flex-wrap items-start justify-end gap-1 justify-self-end">
        {stake.meta.authorized.withdrawer === owner && (
          <AuthorityBadge>Withdrawer</AuthorityBadge>
        )}
        {stake.meta.authorized.staker === owner && (
          <AuthorityBadge>Staker</AuthorityBadge>
        )}
      </div>
    </button>
  );

  return (
    <Box className="scroller mt-4 max-h-[500px]">
      {!selectedPrimary ? (
        <div>
          <p className="-mt-1 font-medium sm:text-sm/6">
            Select the primary stake account (the one that you&apos;ll keep)
          </p>

          <div className="mt-4 space-y-2.5">
            {stakeAccounts.length === 0 && (
              <div className="text-zinc-500">No stake accounts were found</div>
            )}
            {stakeAccounts.map((stake) =>
              accountRow(stake, handlePrimarySelection),
            )}
          </div>
        </div>
      ) : !selectedSecondary ? (
        <div>
          <p className="-mt-1 font-medium sm:text-sm/6">
            Select the secondary stake account (the one that will be merged)
          </p>

          <div className="mt-4 space-y-2.5">
            {stakeAccounts.length === 0 && (
              <div className="text-sm text-zinc-500">
                No mergeable stake accounts were found
                <Button
                  type="button"
                  onClick={reset}
                  className="ml-2 inline-block"
                >
                  Reset
                </Button>
              </div>
            )}
            {stakeAccounts.map((stake) =>
              accountRow(stake, setSelectedSecondary),
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg bg-indigo-100 p-4 shadow-xs">
            <div>
              <p className="text-sm font-medium">Secondary</p>
              <p className="text-xs">
                {compress(selectedSecondary.address, 4)}
              </p>
              <p className="text-sm font-bold">
                {lamportsToSolString(selectedSecondary.lamports)} SOL
              </p>
              <ValidatorInfo account={selectedSecondary} />
            </div>
            <ChevronRightIcon className="size-7 shrink-0 text-indigo-600" />
            <div>
              <p className="text-sm font-medium">Primary</p>
              <p className="text-xs">{compress(selectedPrimary.address, 4)}</p>
              <p className="text-sm font-bold">
                {lamportsToSolString(selectedPrimary.lamports)} SOL
              </p>
              <ValidatorInfo account={selectedPrimary} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Merged Amount</p>
            <p className="text-2xl font-bold text-indigo-600">
              {lamportsToSolString(
                selectedPrimary.lamports + selectedSecondary.lamports,
              )}{" "}
              SOL
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={reset}
              color="dark/zinc"
              className="flex-1"
            >
              Reset
            </Button>
            <Button
              onClick={() => {
                mutate(
                  {
                    sourceStake: selectedSecondary.address,
                    destinationStake: selectedPrimary.address,
                  },
                  {
                    onSuccess: () => {
                      reset();
                      setTimeout(() => {
                        void stakeAccountsQuery.refetch();
                      }, 200);
                    },
                  },
                );
              }}
              type="button"
              color="indigo"
              className="flex-1"
              disabled={isPending}
            >
              {isPending && (
                <SpinnerIcon className="mr-1 -ml-1 inline size-[1em] animate-spin" />
              )}
              Submit
            </Button>
          </div>
        </div>
      )}
    </Box>
  );
}

function AuthorityBadge({ children }: { children: string }) {
  return (
    <span className="rounded-sm border border-gray-400 bg-gray-100 px-1 py-0.5 text-[10px]/3 font-semibold text-gray-700 uppercase">
      {children}
    </span>
  );
}

function ValidatorInfo({ account }: { account: StakeAccountType }) {
  const { data, error, isPending } = useValidatorData(
    account.stake?.delegation.voterPubkey,
  );

  if (account.stake === null) {
    return (
      <div className="text-left text-sm">
        This stake account isn&apos;t delegated
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="h-8 w-full animate-pulse rounded-md bg-indigo-200" />
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
    <div className="flex items-start space-x-2 text-left text-pretty">
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

/**
 * Accounts that the stake program would accept as a merge source for
 * `primary`. Mirrors the program's checks: same authorities, compatible
 * lockups, same vote account when both are delegated, and an inactive account
 * may only merge with another inactive one or one still in its activation
 * epoch.
 */
function getMergeableStakeAccounts(
  accounts: StakeAccountType[],
  primary: StakeAccountType,
  currentEpoch: number,
): StakeAccountType[] {
  const epoch = BigInt(currentEpoch);
  return accounts.filter((acc) => {
    if (acc.address === primary.address) return false;

    if (
      primary.meta.authorized.staker !== acc.meta.authorized.staker ||
      primary.meta.authorized.withdrawer !== acc.meta.authorized.withdrawer
    ) {
      return false;
    }

    const sameLockup =
      primary.meta.lockup.custodian === acc.meta.lockup.custodian &&
      primary.meta.lockup.epoch === acc.meta.lockup.epoch &&
      primary.meta.lockup.unixTimestamp === acc.meta.lockup.unixTimestamp;
    const neitherLockupInForce =
      !isLockupInForce(primary.meta.lockup, epoch) &&
      !isLockupInForce(acc.meta.lockup, epoch);
    if (!sameLockup && !neitherLockupInForce) return false;

    if (
      primary.stake &&
      acc.stake &&
      primary.stake.delegation.voterPubkey !== acc.stake.delegation.voterPubkey
    ) {
      return false;
    }

    if (
      primary.stake === null &&
      acc.stake !== null &&
      acc.stake.delegation.activationEpoch !== epoch
    ) {
      return false;
    }
    if (
      acc.stake === null &&
      primary.stake !== null &&
      primary.stake.delegation.activationEpoch !== epoch
    ) {
      return false;
    }

    return true;
  });
}

function isLockupInForce(
  lockup: StakeAccountType["meta"]["lockup"],
  currentEpoch: bigint,
): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return lockup.unixTimestamp > now || lockup.epoch > currentEpoch;
}
