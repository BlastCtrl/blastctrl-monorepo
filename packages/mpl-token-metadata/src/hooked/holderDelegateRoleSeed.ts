// Ported from metaplex-foundation/mpl-token-metadata clients/js-kit/src/hooked/holderDelegateRoleSeed.ts (Apache-2.0).
import { getUtf8Encoder, transformEncoder, type Encoder } from "@solana/kit";

import { HolderDelegateRole } from "../generated/types/holderDelegateRole";

export type HolderDelegateRoleSeed = "print_delegate";

export type HolderDelegateRoleSeedArgs =
  HolderDelegateRoleSeed | HolderDelegateRole;

/**
 * Encodes a holder delegate role as the string the program uses in the
 * holder delegate record PDA seeds.
 */
export function getHolderDelegateRoleSeedEncoder(): Encoder<HolderDelegateRoleSeedArgs> {
  return transformEncoder(
    getUtf8Encoder(),
    (role: HolderDelegateRoleSeedArgs): string =>
      holderDelegateRoleToSeedString(role),
  );
}

function holderDelegateRoleToSeedString(
  role: HolderDelegateRoleSeedArgs,
): string {
  if (typeof role === "string") return role;
  switch (role) {
    case HolderDelegateRole.PrintDelegate:
      return "print_delegate";
    default:
      throw new Error(`Invalid HolderDelegateRole: ${String(role)}`);
  }
}
