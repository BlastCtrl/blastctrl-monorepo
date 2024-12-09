"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Box } from "./box";
import { StakeMergeForm } from "./stake-merge-form";
import { Button } from "@blastctrl/ui";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export default function StakeLockupManagement() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <>
      <Box>
        <header>
          <h1 className="font-display text-3xl font-semibold">
            Merge stake accounts
          </h1>
          <div className="mt-3 text-sm text-gray-500">
            <p>
              Merge two stake accounts with matching authorities and lockup into
              one. Compatible combinations include:
            </p>
            <ul className="mt-1 list-disc pl-4 font-medium">
              <li>two deactivated stakes,</li>
              <li>
                an inactive stake into an activating stake during its activation
                epoch.
              </li>
            </ul>
            <p className="mt-5">
              For the following cases (active stakes), voter pubkey and vote
              credits observed must match:
            </p>
            <ul className="mt-1 list-disc pl-4 font-medium">
              <li>two activated stakes,</li>
              <li>
                two activating accounts that share an activation epoch, during
                the activation epoch
              </li>
            </ul>
            <p className="mt-5">
              Other combinations or transient states are not supported.
            </p>
          </div>
        </header>
      </Box>
      {publicKey ? (
        <StakeMergeForm />
      ) : (
        <Box className="mt-4">
          <Button
            color="indigo"
            type="button"
            className="w-full"
            onClick={() => setVisible(true)}
          >
            Connect your wallet
          </Button>
        </Box>
      )}
    </>
  );
}
