import { mplCore } from "@metaplex-foundation/mpl-core";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  createAmount,
  createBaseUmi,
  createNoopSigner,
  createNullRpc,
  publicKey,
  type AccountMeta as UmiAccountMeta,
  type Amount as UmiAmount,
  type EddsaInterface,
  type Instruction as UmiInstruction,
  type Option as UmiOption,
  type Pda as UmiPda,
  type PublicKey as UmiPublicKey,
  type RpcInterface,
  type Signer as UmiSigner,
  type TransactionBuilder,
  type Umi,
  type UmiPlugin,
} from "@metaplex-foundation/umi";
import { defaultProgramRepository } from "@metaplex-foundation/umi-program-repository";
import {
  AccountRole,
  address,
  isOffCurveAddress,
  type AccountMeta,
  type AccountSignerMeta,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { findProgramDerivedAddressSync } from "./program-derived-address";

/**
 * This is the only module that touches Metaplex Umi. Umi is used purely as an
 * instruction builder for the Metaplex programs (Token Metadata, Core): it
 * never holds a keypair, never talks to an RPC and never sends anything. The
 * kit client plans, signs and sends the mapped instructions. Hopefully we can
 * swap to native Kit program clients at some point.
 *
 * The Umi is assembled from the base and the program repository only, not
 * from `umi-bundle-defaults`, whose RPC, keypair and transaction plugins are
 * built on web3.js 1 and would put all of it in every route that builds a
 * Metaplex instruction. What a builder needs from those interfaces is PDA
 * derivation, which comes from kit here.
 */

let umiSingleton: Umi | undefined;

/** The shared builder-only Umi. */
export function getUmi(): Umi {
  if (!umiSingleton) {
    umiSingleton = createBaseUmi()
      .use(builderOnlyPlugins())
      .use(mplTokenMetadata())
      .use(mplCore());
  }
  return umiSingleton;
}

/**
 * The program repository the generated builders resolve program ids with,
 * which asks the RPC for the cluster, and PDA derivation on kit. Any other
 * interface stays the base Umi's null implementation, which throws, so a
 * builder that would need one fails loudly rather than reaching for an RPC.
 */
function builderOnlyPlugins(): UmiPlugin {
  return {
    install(umi) {
      umi.use(defaultProgramRepository());
      umi.rpc = builderOnlyRpc();
      umi.eddsa = kitEddsa();
    },
  };
}

function builderOnlyRpc(): RpcInterface {
  // Every program the app builds for is on every cluster.
  return { ...createNullRpc(), getCluster: () => "custom" };
}

/** Umi's `EddsaInterface` with the parts a builder uses, from kit. */
function kitEddsa(): EddsaInterface {
  const unsupported = (what: string) => () => {
    throw new Error(`The builder-only Umi can't ${what}; the kit client does`);
  };
  return {
    findPda: (programId, seeds) => {
      const [pda, bump] = findProgramDerivedAddressSync(
        address(programId),
        seeds,
      );
      return [publicKey(pda), bump] as unknown as UmiPda;
    },
    isOnCurve: (input) => !isOffCurveAddress(address(publicKey(input))),
    generateKeypair: unsupported("generate a keypair"),
    createKeypairFromSecretKey: unsupported("hold a secret key"),
    createKeypairFromSeed: unsupported("hold a secret key"),
    sign: unsupported("sign"),
    verify: unsupported("verify a signature"),
  };
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
