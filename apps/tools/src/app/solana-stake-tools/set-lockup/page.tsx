import { LockupFormContainer } from "./lockup-form";

export default function StakeLockupManagement() {
  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="font-display text-3xl font-semibold">
          Update stake account lockup
        </h1>
        <div className="mt-4 text-sm text-gray-500">
          Only for advanced users. Conditions for setting a lockup:
          <ul className="mt-2 list-disc pl-4 font-medium">
            <li>
              If a lockup is not active, the withdraw authority may set a new
              lockup
            </li>
            <li>
              If a lockup is active, the lockup custodian may update the lockup
              parameters
            </li>
          </ul>
        </div>
      </header>

      <LockupFormContainer />
    </div>
  );
}
