import { useUserStakeAccounts } from "@/state/queries/use-user-stake-accounts";
import type { StakeAccountType } from "@/state/queries/use-user-stake-accounts";
import { Box } from "./box";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { compress } from "@/lib/solana";
import { lamportsToSol, lamportsToSolString } from "@/lib/solana/common";
import { useState } from "react";
import { useValidatorData } from "@/state/queries/use-validator-data";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { currentEpochQuery } from "@/state/queries/use-epoch";
import { useQuery } from "@tanstack/react-query";
import { useMergeStakesMutation } from "./merge-mutation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function StakeMergeForm() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const epochQuery = useQuery(currentEpochQuery(connection));
  const stakeAccountsQuery = useUserStakeAccounts(publicKey ?? undefined);
  const { mutate, isPending } = useMergeStakesMutation();

  const [selectedPrimary, setSelectedPrimary] =
    useState<StakeAccountType | null>(null);
  const [selectedSecondary, setSelectedSecondary] =
    useState<StakeAccountType | null>(null);

  const handlePrimarySelection = (account: StakeAccountType) => {
    setSelectedPrimary(account);
    setSelectedSecondary(null);
  };

  const handleSecondarySelection = (account: StakeAccountType) => {
    setSelectedSecondary(account);
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
    ? getMergableStakeAccounts(data, selectedPrimary, epochQuery.data.epoch)
    : data;

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
            {stakeAccounts
              .sort((a, b) => b.lamports - a.lamports)
              .map((stake) => (
                <button
                  key={stake.accountId.toString()}
                  className="w-full flex-col items-start justify-between rounded-md bg-gray-50 p-4 ring-2 ring-black/10 hover:ring-2 hover:ring-indigo-600"
                  onClick={() => handlePrimarySelection(stake)}
                >
                  <div className="flex w-full justify-between">
                    <span>{compress(stake.accountId.toString(), 4)}</span>
                    <span>{lamportsToSol(stake.lamports)} SOL</span>
                  </div>
                  <ValidatorInfo account={stake} />
                </button>
              ))}
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
                  onClick={() => void setSelectedPrimary(null)}
                  className="ml-2 inline-block"
                >
                  Reset
                </Button>
              </div>
            )}
            {stakeAccounts.map((stake) => (
              <button
                key={stake.accountId.toString()}
                className="w-full flex-col items-start justify-between rounded-md bg-gray-50 p-4 shadow ring-1 ring-black/5 hover:ring-2 hover:ring-indigo-600"
                onClick={() => handleSecondarySelection(stake)}
              >
                <div className="flex w-full justify-between">
                  <span>{compress(stake.accountId.toString(), 4)}</span>
                  <span>{lamportsToSol(stake.lamports)} SOL</span>
                </div>
                <ValidatorInfo account={stake} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg bg-indigo-100 p-4 shadow-sm">
            <div>
              <p className="text-sm font-medium">Secondary</p>
              <p className="text-xs">
                {compress(selectedSecondary.accountId.toString(), 4)}
              </p>
              <p className="text-sm font-bold">
                {lamportsToSolString(selectedSecondary.lamports)} SOL
              </p>
              <ValidatorInfo account={selectedSecondary} />
            </div>
            <ChevronRightIcon className="size-7 shrink-0 text-indigo-600" />
            <div>
              <p className="text-sm font-medium">Primary</p>
              <p className="text-xs">
                {compress(selectedPrimary.accountId.toString(), 4)}
              </p>
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

          {!publicKey ? (
            <div className="flex justify-end">
              <Button
                onClick={() => void setVisible(true)}
                type="button"
                color="indigo"
              >
                Connect your wallet
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setSelectedPrimary(null);
                  setSelectedSecondary(null);
                }}
                color="dark/zinc"
                className="flex-1"
              >
                Reset
              </Button>
              <Button
                onClick={() => {
                  mutate(
                    {
                      sourceStakePubKey: selectedSecondary.accountId,
                      stakePubkey: selectedPrimary.accountId,
                    },
                    {
                      onSuccess: () => {
                        setSelectedPrimary(null);
                        setSelectedSecondary(null);
                        setTimeout(() => {
                          void stakeAccountsQuery.refetch();
                        }, 200);
                      },
                    },
                  );
                }}
                type="button"
                color="indigo"
                className={`flex-1 ${isPending ? "pointer-events-none" : ""}`}
              >
                {isPending && (
                  <SpinnerIcon className="-ml-1 mr-1 inline size-[1em] animate-spin" />
                )}
                Submit
              </Button>
            </div>
          )}
        </div>
      )}
    </Box>
  );
}

function ValidatorInfo({ account }: { account: StakeAccountType }) {
  const { data, error, isPending } = useValidatorData(
    account.data.info.stake?.delegation.voter,
  );

  if (account.data.info.stake === null) {
    return (
      <div className="mt-3 text-left text-sm">
        This stake account isn&apos;t delegated
      </div>
    );
  }

  if (isPending) {
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

function getMergableStakeAccounts(
  accounts: StakeAccountType[],
  primary: StakeAccountType,
  currentEpoch: number,
): StakeAccountType[] {
  return accounts.filter((acc) => {
    if (acc.accountId === primary.accountId) {
      return false;
    }

    // First constraints - authorized field must match
    if (
      primary.data.info.meta.authorized.staker !==
        acc.data.info.meta.authorized.staker ||
      primary.data.info.meta.authorized.withdrawer !==
        acc.data.info.meta.authorized.withdrawer
    ) {
      return false;
    }

    // Second constraint - if the lockup fields differ, stakes can only merge if neither lockup is in-force
    const canMergeLockups =
      (primary.data.info.meta.lockup.custodian ===
        acc.data.info.meta.lockup.custodian &&
        primary.data.info.meta.lockup.epoch ===
          acc.data.info.meta.lockup.epoch &&
        primary.data.info.meta.lockup.unixTimestamp ===
          acc.data.info.meta.lockup.unixTimestamp) ||
      (!isLockupInForce(primary.data.info.meta.lockup, currentEpoch) &&
        !isLockupInForce(primary.data.info.meta.lockup, currentEpoch));

    if (!canMergeLockups) {
      return false;
    }

    // Third constraint - if the accounts are delegated, the vote pubkey must match
    if (
      primary.data.info.stake?.delegation &&
      acc.data.info.stake?.delegation
    ) {
      if (
        primary.data.info.stake.delegation.voter !==
        primary.data.info.stake.delegation.voter
      ) {
        return false;
      }
    }

    // Fourth constraint - if one of the accounts is inactive, the other account must also be inactive, or it must be in its activation period
    if (primary.data.info.stake === null) {
      if (
        acc.data.info?.stake !== null &&
        acc.data.info.stake.delegation.activationEpoch !== String(currentEpoch)
      ) {
        return false;
      }
    }
    if (acc.data.info.stake === null) {
      if (
        primary.data.info?.stake !== null &&
        primary.data.info.stake.delegation.activationEpoch !==
          String(currentEpoch)
      ) {
        return false;
      }
    }

    return true;
  });
}

function isLockupInForce(
  lockup: StakeAccountType["data"]["info"]["meta"]["lockup"],
  currentEpoch: number,
): boolean {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  return lockup.unixTimestamp > currentTimestamp || lockup.epoch > currentEpoch;
}
