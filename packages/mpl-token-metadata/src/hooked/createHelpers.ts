// Ported from metaplex-foundation/mpl-token-metadata clients/js-kit/src/hooked/createHelpers.ts (Apache-2.0).
/**
 * Wrappers around createV1 and mintV1 for common token creation patterns.
 */
import type { Instruction } from "@solana/kit";
import { getAddressFromResolvedInstructionAccount } from "@solana/kit/program-client-core";

import {
  getCreateV1InstructionAsync,
  type CreateV1AsyncInput,
} from "../generated/instructions/createV1";
import {
  getMintV1InstructionAsync,
  type MintV1AsyncInput,
} from "../generated/instructions/mintV1";
import { TokenStandard } from "../generated/types/tokenStandard";

/** createV1 and mintV1 inputs combined. */
export type CreateAndMintInput = CreateV1AsyncInput &
  Omit<MintV1AsyncInput, "mint" | "metadata">;

/**
 * Builds createV1 and mintV1 instructions to send in one transaction.
 *
 * @returns `[createInstruction, mintInstruction]`
 *
 * @example
 * ```ts
 * const [createIx, mintIx] = await createAndMint({
 *   mint,
 *   authority,
 *   payer,
 *   name: "My NFT",
 *   uri: "https://example.com/nft.json",
 *   sellerFeeBasisPoints: 500,
 *   tokenStandard: TokenStandard.NonFungible,
 *   amount: 1,
 *   tokenOwner: owner.address,
 * });
 * ```
 */
export async function createAndMint(
  input: CreateAndMintInput,
): Promise<[Instruction, Instruction]> {
  const createInstruction = await getCreateV1InstructionAsync(input);

  // The mint may be a signer, an address, a PDA or an account meta.
  const mintAddress = getAddressFromResolvedInstructionAccount(
    "mint",
    input.mint,
  );

  const mintInstruction = await getMintV1InstructionAsync({
    ...input,
    mint: mintAddress,
    // createV1 defaults the token standard to NonFungible; mint the same.
    tokenStandard: input.tokenStandard ?? TokenStandard.NonFungible,
  });

  return [createInstruction, mintInstruction];
}

/**
 * Creates and mints a NonFungible NFT (amount 1).
 *
 * @example
 * ```ts
 * const [createIx, mintIx] = await createNft({
 *   mint,
 *   authority,
 *   payer,
 *   name: "My NFT",
 *   uri: "https://example.com/nft.json",
 *   sellerFeeBasisPoints: 500,
 *   tokenOwner: owner.address,
 * });
 * ```
 */
export async function createNft(
  input: Omit<CreateAndMintInput, "amount" | "tokenStandard">,
): Promise<[Instruction, Instruction]> {
  return createAndMint({
    ...input,
    tokenStandard: TokenStandard.NonFungible,
    amount: 1,
  });
}

/**
 * Creates and mints a ProgrammableNonFungible NFT (amount 1).
 *
 * @example
 * ```ts
 * const [createIx, mintIx] = await createProgrammableNft({
 *   mint,
 *   authority,
 *   payer,
 *   name: "My PNFT",
 *   uri: "https://example.com/pnft.json",
 *   sellerFeeBasisPoints: 500,
 *   tokenOwner: owner.address,
 * });
 * ```
 */
export async function createProgrammableNft(
  input: Omit<CreateAndMintInput, "amount" | "tokenStandard">,
): Promise<[Instruction, Instruction]> {
  return createAndMint({
    ...input,
    tokenStandard: TokenStandard.ProgrammableNonFungible,
    amount: 1,
  });
}

/**
 * Creates a Fungible token without minting any supply.
 *
 * @example
 * ```ts
 * const createIx = await createFungible({
 *   mint,
 *   authority,
 *   payer,
 *   name: "My Token",
 *   uri: "https://example.com/token.json",
 *   sellerFeeBasisPoints: 100,
 * });
 * ```
 */
export async function createFungible(
  input: Omit<CreateV1AsyncInput, "tokenStandard">,
): Promise<Instruction> {
  return getCreateV1InstructionAsync({
    ...input,
    tokenStandard: TokenStandard.Fungible,
  });
}

/**
 * Creates a FungibleAsset token without minting any supply.
 *
 * @example
 * ```ts
 * const createIx = await createFungibleAsset({
 *   mint,
 *   authority,
 *   payer,
 *   name: "My Asset",
 *   uri: "https://example.com/asset.json",
 *   sellerFeeBasisPoints: 200,
 * });
 * ```
 */
export async function createFungibleAsset(
  input: Omit<CreateV1AsyncInput, "tokenStandard">,
): Promise<Instruction> {
  return getCreateV1InstructionAsync({
    ...input,
    tokenStandard: TokenStandard.FungibleAsset,
  });
}
