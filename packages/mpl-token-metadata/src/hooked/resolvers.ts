// Ported from metaplex-foundation/mpl-token-metadata clients/js-kit/src/hooked/resolvers.ts (Apache-2.0).
/**
 * Resolvers the generated instruction builders call to compute default
 * values. Each receives the builder's resolver scope:
 * `{ programAddress, accounts, args }`.
 */
import {
  isProgramDerivedAddress,
  isSignerRole,
  isTransactionSigner,
  type Address,
  type OptionOrNullable,
} from "@solana/kit";
import type { ResolvedInstructionAccount } from "@solana/kit/program-client-core";

import type { CollectionDetailsArgs } from "../generated/types/collectionDetails";
import type { CreatorArgs } from "../generated/types/creator";
import type { PrintSupplyArgs } from "../generated/types/printSupply";
import { TokenStandard } from "../generated/types/tokenStandard";

type AccountValue = ResolvedInstructionAccount["value"];

/** The address of a resolved account value, or null when it is unset. */
function getAddressFromAccount(
  value: AccountValue | undefined,
): Address | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (isProgramDerivedAddress(value)) return value[0];
  return value.address;
}

/**
 * Whether a resolved account value will sign: a transaction signer, or an
 * account meta carrying a signer role. Matches how
 * `@solana/kit/program-client-core` decides it when building account metas.
 */
function isSignerAccount(value: AccountValue | undefined): boolean {
  if (
    value == null ||
    typeof value === "string" ||
    isProgramDerivedAddress(value)
  ) {
    return false;
  }
  if ("role" in value && typeof value.role === "number") {
    return isSignerRole(value.role);
  }
  return isTransactionSigner(value);
}

// Constants for size calculations.
const MINT_SIZE = 82;
const METADATA_SIZE = 607;
const MASTER_EDITION_SIZE = 20;
const ACCOUNT_HEADER_SIZE = 128;

/** Whether a token standard is one of the non-fungible ones. */
export function isNonFungible(tokenStandard: TokenStandard): boolean {
  return (
    tokenStandard === TokenStandard.NonFungible ||
    tokenStandard === TokenStandard.NonFungibleEdition ||
    tokenStandard === TokenStandard.ProgrammableNonFungible
  );
}

/** Resolved instruction accounts, keyed by account name. */
type ResolverAccounts = Readonly<
  Record<string, ResolvedInstructionAccount | undefined>
>;

/** Arguments carrying a token standard. */
interface TokenStandardArgs {
  tokenStandard?: TokenStandard;
}

/** Arguments carrying the isCollection flag. */
interface IsCollectionArgs {
  isCollection?: boolean;
}

/** The single parameter the generated builders pass to every resolver. */
interface ResolverScope<TArgs = unknown> {
  programAddress?: Address;
  accounts: ResolverAccounts;
  args: TArgs;
}

function getTokenStandard(scope: ResolverScope<TokenStandardArgs>) {
  if (scope.args.tokenStandard === undefined) {
    throw new Error("tokenStandard is required");
  }
  return scope.args.tokenStandard;
}

/** Collection details from the isCollection flag. */
export function resolveCollectionDetails(
  scope: ResolverScope<IsCollectionArgs>,
): OptionOrNullable<CollectionDetailsArgs> {
  if (scope.args.isCollection) {
    return {
      __kind: "V2",
      padding: new Uint8Array(8),
    };
  }
  return null;
}

/** Whether the token standard is non-fungible. */
export function resolveIsNonFungible(
  scope: ResolverScope<TokenStandardArgs>,
): boolean {
  return isNonFungible(getTokenStandard(scope));
}

/** Decimals from the token standard: none for non-fungibles, else 0. */
export function resolveDecimals(
  scope: ResolverScope<TokenStandardArgs>,
): OptionOrNullable<number> {
  return isNonFungible(getTokenStandard(scope)) ? null : 0;
}

/** Print supply from the token standard: zero for non-fungibles, else none. */
export function resolvePrintSupply(
  scope: ResolverScope<TokenStandardArgs>,
): OptionOrNullable<PrintSupplyArgs> {
  return isNonFungible(getTokenStandard(scope)) ? { __kind: "Zero" } : null;
}

/** The authority as the sole, verified creator. */
export function resolveCreators(
  scope: ResolverScope,
): OptionOrNullable<CreatorArgs[]> {
  const authorityAddress = getAddressFromAccount(
    scope.accounts.authority?.value,
  );
  if (!authorityAddress) {
    throw new Error("authority account is required");
  }
  return [
    {
      address: authorityAddress,
      share: 100,
      verified: true,
    },
  ];
}

/** Bytes a CreateV1 instruction allocates. */
export function resolveCreateV1Bytes(
  scope: ResolverScope<TokenStandardArgs>,
): number {
  const base = MINT_SIZE + METADATA_SIZE + 2 * ACCOUNT_HEADER_SIZE;
  if (
    scope.args.tokenStandard !== undefined &&
    isNonFungible(scope.args.tokenStandard)
  ) {
    return base + MASTER_EDITION_SIZE + ACCOUNT_HEADER_SIZE;
  }
  return base;
}

/**
 * The token owner, defaulting to the authority's address. The result is
 * spread over the resolved account.
 */
export function resolveOptionalTokenOwner(scope: ResolverScope): {
  value: Address | null;
} {
  const authorityAddress = getAddressFromAccount(
    scope.accounts.authority?.value,
  );
  return { value: authorityAddress };
}

/** Whether the token standard is non-fungible or the mint signs. */
export function resolveIsNonFungibleOrIsMintSigner(
  scope: ResolverScope<TokenStandardArgs>,
): boolean {
  if (
    scope.args.tokenStandard !== undefined &&
    isNonFungible(scope.args.tokenStandard)
  ) {
    return true;
  }
  return isSignerAccount(scope.accounts.mint?.value);
}
