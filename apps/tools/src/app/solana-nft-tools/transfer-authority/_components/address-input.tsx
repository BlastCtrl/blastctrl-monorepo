import { cn } from "@blastctrl/ui";
import type { ReactNode } from "react";

export function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
      {children}
    </label>
  );
}

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error: string | null;
  placeholder?: string;
  /**
   * Set when the address is a Squads multisig account: its vault, which is
   * the address to use instead.
   */
  multisigVault?: string | null;
};

export function AddressInput({
  id,
  value,
  onChange,
  disabled,
  error,
  placeholder = "Wallet address",
  multisigVault,
}: Props) {
  return (
    <>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        className={cn(
          "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-50",
          (error || multisigVault) && "border-red-300 text-red-900",
        )}
      />
      {multisigVault ? (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          <p>
            This is a Squads multisig account. It can never sign anything, so
            NFTs given to it are stuck for good. Use the multisig&apos;s vault
            instead:{" "}
            <span className="font-mono break-all">{multisigVault}</span>
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(multisigVault)}
            className="mt-1 font-medium underline underline-offset-2 hover:text-red-950"
          >
            Use the vault address
          </button>
        </div>
      ) : (
        error && <p className="mt-1 text-xs text-red-700">{error}</p>
      )}
    </>
  );
}
