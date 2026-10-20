import { mplCore } from "@metaplex-foundation/mpl-core";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  createAmount,
  createNoopSigner,
  publicKey,
  type AccountMeta as UmiAccountMeta,
  type Amount as UmiAmount,
  type Instruction as UmiInstruction,
  type Option as UmiOption,
  type PublicKey as UmiPublicKey,
  type Signer as UmiSigner,
  type TransactionBuilder,
  type Umi,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  AccountRole,
  address,
  type AccountMeta,
  type AccountSignerMeta,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

/**
 * This is the only module that touches Metaplex Umi. Umi is used purely as an
 * instruction builder for the Metaplex programs (Token Metadata, Core): it
 * never holds a keypair, never talks to an RPC and never sends anything. The
 * kit client plans, signs and sends the mapped instructions. Hopefully we can
 * swap to native Kit program clients at some point.
 */

let umiSingleton: Umi | undefined;

/** The shared builder-only Umi. The URL is a placeholder; nothing is ever sent to it. */
export function getUmi(): Umi {
  if (!umiSingleton) {
    umiSingleton = createUmi(
      "http://umi-is-an-instruction-builder-only.invalid",
    )
      .use(mplTokenMetadata())
      .use(mplCore());
  }
  return umiSingleton;
}

export const toUmiPublicKey = (account: Address): UmiPublicKey =>
  publicKey(account);

/**
 * A Umi signer that only marks the account as a signer in the built
 * instruction. The actual signature comes from the kit side: the wallet as
 * fee payer, or a kit signer passed to {@link toKitInstruction}.
 */
export const toUmiSigner = (account: Address): UmiSigner =>
  createNoopSigner(publicKey(account));

/** Royalty basis points (0–10000) as the percent `Amount` Token Metadata builders take. */
export const toUmiBasisPoints = (basisPoints: number): UmiAmount<"%", 2> =>
  createAmount(basisPoints, "%", 2);

/** Unwraps a Umi `Option`: the value of `Some`, null for `None`. */
export const fromUmiOption = <T>(option: UmiOption<T>): T | null =>
  option.__option === "Some" ? option.value : null;

/**
 * Map a Umi instruction to a kit `Instruction`. Field-for-field: Umi carries
 * `{ programId, keys: [{ pubkey, isSigner, isWritable }], data }`, kit carries
 * `{ programAddress, accounts: [{ address, role }], data }`. A signer-role
 * account whose address matches one of `signers` gets that signer attached, so
 * the kit client signs with it (keypairs for new accounts, for instance). The
 * wallet needs no entry: as fee payer it signs for its own address anyway.
 */
export function toKitInstruction(
  instruction: UmiInstruction,
  signers: readonly TransactionSigner[] = [],
): Instruction {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.keys.map((key) => toKitAccountMeta(key, signers)),
    data: instruction.data,
  };
}

/** All instructions of a Umi transaction builder, mapped with {@link toKitInstruction}. */
export const toKitInstructions = (
  builder: TransactionBuilder,
  signers?: readonly TransactionSigner[],
): Instruction[] =>
  builder
    .getInstructions()
    .map((instruction) => toKitInstruction(instruction, signers));

function toKitAccountMeta(
  key: UmiAccountMeta,
  signers: readonly TransactionSigner[],
): AccountMeta | AccountSignerMeta {
  const account = address(key.pubkey);
  if (key.isSigner) {
    const role = key.isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
    const signer = signers.find((s) => s.address === account);
    return signer
      ? { address: account, role, signer }
      : { address: account, role };
  }
  return {
    address: account,
    role: key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
  };
}
