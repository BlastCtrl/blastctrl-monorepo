import { lamportsToSolString } from "@/lib/solana/common";
import {
  MIN_DELEGATION_LAMPORTS,
  STAKE_ACCOUNT_SIZE,
} from "@/lib/solana/stake-account";
import type { StakeAccountType } from "@/state/queries/use-stake-account";
import {
  getSplitInstruction,
  STAKE_PROGRAM_ADDRESS,
} from "@solana-program/stake";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  sol,
  solToLamports,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Lamports,
  type TransactionSigner,
} from "@solana/kit";

/**
 * What the split tools need to know about the account being split.
 *
 * The stake program's rules for a split (solana-program/stake,
 * `process_split`):
 *
 * - A delegated source (active or activating) moves delegated stake only,
 *   lamport for lamport: free lamports such as MEV rewards stay behind. The
 *   destination must already hold its rent-exempt reserve, and both sides
 *   must keep at least the minimum delegation (1 SOL).
 * - An undelegated source only has to leave both accounts rent-exempt.
 *
 * Both forms therefore fund the destination's rent from the wallet and
 * treat the entered amount as what moves out of the source.
 */
export type SplitSource = Pick<StakeAccountType, "lamports" | "stake" | "meta">;

/** Lamports a split can move out of `source`: its delegated stake, or everything above rent when undelegated. */
export function splittableLamports(source: SplitSource, rent: bigint): bigint {
  if (source.stake) return source.stake.delegation.stake;
  const free = source.lamports - rent;
  return free > 0n ? free : 0n;
}

/** Smallest and largest amount the program accepts for `source`, or null when it can't be split at all. */
export function splitBounds(
  source: SplitSource,
  rent: bigint,
): { min: bigint; max: bigint } | null {
  const total = splittableLamports(source, rent);
  if (source.stake) {
    const max = total - MIN_DELEGATION_LAMPORTS;
    return max >= MIN_DELEGATION_LAMPORTS
      ? { min: MIN_DELEGATION_LAMPORTS, max }
      : null;
  }
  return total > 0n ? { min: 1n, max: total } : null;
}

const MIN_SOL = lamportsToSolString(MIN_DELEGATION_LAMPORTS);

/** Why `amount` lamports can't be split out of `source`, or null when the program would accept it. */
export function splitAmountError(
  source: SplitSource,
  amount: bigint,
  rent: bigint,
): string | null {
  const bounds = splitBounds(source, rent);
  if (!bounds) {
    return source.stake
      ? `A delegated account needs at least ${lamportsToSolString(2n * MIN_DELEGATION_LAMPORTS)} SOL of stake to be split: both accounts must keep ${MIN_SOL} SOL.`
      : "There is nothing above the rent-exempt reserve to split.";
  }
  if (amount <= 0n) return "The amount must be greater than 0.";
  if (amount < bounds.min) {
    return `The new account needs at least ${MIN_SOL} SOL of stake.`;
  }
  if (amount > bounds.max) {
    return source.stake
      ? `The original account must keep at least ${MIN_SOL} SOL of stake, so at most ${lamportsToSolString(bounds.max)} SOL can be split.`
      : `At most ${lamportsToSolString(bounds.max)} SOL can be split; the rent-exempt reserve stays in the original account.`;
  }
  return null;
}

/** Decimal SOL typed by the user as lamports; null when it isn't a valid amount. */
export function parseSolInput(value: string): bigint | null {
  if (!/^\d*\.?\d{0,9}$/.test(value) || value === "" || value === ".") {
    return null;
  }
  try {
    return solToLamports(sol(value));
  } catch {
    return null;
  }
}

/**
 * The two instructions a split sends: the destination allocated and funded
 * with its rent by the wallet, then `amount` moved into it.
 */
export function splitInstructions({
  source,
  destination,
  authority,
  amount,
  rent,
}: {
  source: Address;
  destination: KeyPairSigner;
  authority: TransactionSigner;
  amount: bigint;
  rent: Lamports;
}): Instruction[] {
  return [
    getCreateAccountInstruction({
      payer: authority,
      newAccount: destination,
      lamports: rent,
      space: BigInt(STAKE_ACCOUNT_SIZE),
      programAddress: STAKE_PROGRAM_ADDRESS,
    }),
    getSplitInstruction({
      stake: source,
      splitStake: destination.address,
      stakeAuthority: authority,
      args: amount,
    }),
  ];
}
