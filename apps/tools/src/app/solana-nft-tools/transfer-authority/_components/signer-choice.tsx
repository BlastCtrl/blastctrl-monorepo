import { useAppRpc } from "@/connector/app-rpc";
import { fetchSquadsMultisig } from "@/lib/solana/squads-multisig";
import { address, isAddress } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AddressInput, Label } from "./address-input";

/**
 * Who signs a step: the connected wallet, or a Squads vault through one
 * batch proposal its members create, approve and execute.
 */
export type SignerMode = "wallet" | "squads";

type Option = { label: string; description: string };

export function SignerModePicker({
  name,
  legend,
  value,
  onChange,
  options,
  disabled,
}: {
  name: string;
  legend: string;
  value: SignerMode;
  onChange: (mode: SignerMode) => void;
  options: Record<SignerMode, Option>;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">{legend}</legend>
      <div className="mt-2 space-y-2">
        {(["wallet", "squads"] as const).map((mode) => (
          <label key={mode} className="flex gap-3 text-sm">
            <input
              type="radio"
              name={name}
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              disabled={disabled}
              className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span className="font-medium text-gray-900">
                {options[mode].label}
              </span>
              <span className="block text-gray-500">
                {options[mode].description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A multisig's settings, and what's wrong with the address if anything. */
export function useSquadsMultisigInfo(candidate: string, enabled: boolean) {
  const { rpc, network } = useAppRpc();
  const query = useQuery({
    queryKey: ["squads-info", network, candidate],
    queryFn: () => {
      if (!rpc) throw Error("RPC not available");
      return fetchSquadsMultisig(rpc, address(candidate));
    },
    enabled: enabled && !!rpc && isAddress(candidate),
  });
  const error = !candidate
    ? "Enter the multisig address"
    : !isAddress(candidate)
      ? "Not a valid address"
      : query.isPending
        ? "Checking the address"
        : query.error
          ? `Couldn't read the address: ${query.error.message}`
          : !query.data
            ? "That's not a Squads multisig account. Use the multisig's address from its settings in the Squads app, not the vault."
            : null;
  return { multisig: query.data ?? null, error };
}

export function SquadsMultisigField({
  id,
  value,
  onChange,
  error,
  vault,
  hint,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  /** The multisig's vault, shown once the address checks out. */
  vault: string | undefined;
  hint: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>Squads multisig address</Label>
      <p className="text-xs text-gray-500">
        In the Squads app, it&apos;s in the multisig&apos;s settings. {hint}
      </p>
      <AddressInput
        id={id}
        value={value}
        onChange={onChange}
        error={value ? error : null}
        placeholder="Multisig address"
        disabled={disabled}
      />
      {vault && (
        <p className="mt-1 text-xs text-gray-500">
          Vault:{" "}
          <span className="font-mono break-all text-gray-700">{vault}</span>
        </p>
      )}
    </div>
  );
}
