// Ported from the Squads v4 SDK, Squads-Protocol/v4 sdk/multisig/src/types.ts
// (`Permission`, `Permissions`) (MIT, per sdk/multisig/package.json).
/**
 * A member's permissions are a bit mask (the generated `Permissions`
 * type's `mask`); the IDL doesn't name the bits.
 */
import type { Permissions } from "../generated";

export const Permission = {
  Initiate: 0b001,
  Vote: 0b010,
  Execute: 0b100,
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** Whether `permissions` grants `permission`. */
export function hasPermission(
  permissions: Permissions,
  permission: Permission,
): boolean {
  return (permissions.mask & permission) === permission;
}

/** The `Permissions` granting each of `list`. */
export function permissionsFromList(list: readonly Permission[]): Permissions {
  return { mask: list.reduce<number>((mask, bit) => mask | bit, 0) };
}

/** Initiate, vote and execute. */
export function allPermissions(): Permissions {
  return permissionsFromList(Object.values(Permission));
}
