"use client";

import { AccountList } from "./account-list";
import { Box } from "./box";

export default function WithdrawRewards() {
  return (
    <>
      <Box className="max-w-2xl">
        <header className="border-b border-gray-200 pb-4">
          <h1 className="font-display text-3xl font-semibold">
            Withdraw MEV rewards
          </h1>
          <p className="mt-4 text-sm text-gray-500">
            You can use this tool to withdraw any additional SOL on your stake
            accounts which isn&apos;t delegated, except for the lamports which
            are used for rent. You can withdraw the funds to any wallet as long
            as you sign with the withdraw authority.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            This is how MEV (Jito) rewards are distributed for non-JitoSOL{" "}
            <i>(also called native)</i> stake accounts. If your chosen validator
            is running the Jito client, available rewards will be displayed
            here.
          </p>
        </header>
      </Box>
      <AccountList />
    </>
  );
}
