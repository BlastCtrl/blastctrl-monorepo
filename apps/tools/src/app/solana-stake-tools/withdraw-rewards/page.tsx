import { AccountList } from "./account-list";

export default function WithdrawRewards() {
  return (
    <div className="mx-auto max-w-2xl overflow-visible bg-white pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="font-display text-3xl font-semibold">
          Withdraw MEV rewards
        </h1>
        <p className="mt-4 text-sm text-gray-500">
          You can use this to withdraw any additional SOL on your stake accounts
          which isn't delegated, except for the lamports which are used for
          rent.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          This is how MEV (Jito) rewards are distributed for non-JitoSOL{" "}
          <i>(also called native)</i> stake accounts. If your chosen validator
          is running the Jito client, available rewards will be displayed here.
        </p>
      </header>

      {/* <StakeAccountForm /> */}
      <AccountList />
    </div>
  );
}
