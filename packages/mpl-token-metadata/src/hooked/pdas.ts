// Ported from metaplex-foundation/mpl-token-metadata clients/js-kit/src/hooked/pdas.ts (Apache-2.0).
/**
 * PDAs the generated code links to that Codama cannot derive itself: the
 * associated token account (another program) and the edition marker for an
 * edition number (a computed seed).
 *
 * Like the generated PDA helpers, address seeds accept an `Address` or
 * anything carrying one (a signer, say), because instruction builders pass
 * their `Address | HasAddress` arguments straight through.
 */
import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
  type HasAddress,
  type ProgramDerivedAddress,
} from "@solana/kit";

import { MPL_TOKEN_METADATA_PROGRAM_ADDRESS } from "../generated/programs";

/** SPL Token program (the original one). */
export const SPL_TOKEN_PROGRAM_ADDRESS =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address<"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA">;

/** SPL Token 2022 program (Token Extensions). */
export const SPL_TOKEN_2022_PROGRAM_ADDRESS =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address<"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb">;

/** SPL Associated Token Account program. */
export const SPL_ASSOCIATED_TOKEN_PROGRAM_ADDRESS =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address<"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL">;

/**
 * Finds the associated token account of `owner` for `mint`, under the SPL
 * Token program unless `tokenProgram` says otherwise.
 */
export async function findAssociatedTokenPda(params: {
  owner: Address | HasAddress;
  mint: Address | HasAddress;
  tokenProgram?: Address | HasAddress;
}): Promise<ProgramDerivedAddress> {
  const tokenProgram = params.tokenProgram ?? SPL_TOKEN_PROGRAM_ADDRESS;
  const addressEncoder = getAddressEncoder();

  return await getProgramDerivedAddress({
    programAddress: SPL_ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      addressEncoder.encode(params.owner),
      addressEncoder.encode(tokenProgram),
      addressEncoder.encode(params.mint),
    ],
  });
}

/**
 * Finds the edition marker PDA that tracks `editionNumber` of a master
 * edition.
 *
 * Markers cover 248 editions each, and the program seeds the marker number as
 * a decimal string (`edition_number.to_string().as_bytes()`), not as a u64.
 */
export async function findEditionMarkerFromEditionNumberPda(params: {
  mint: Address | HasAddress;
  editionNumber: number | bigint;
  programAddress?: Address | HasAddress;
}): Promise<ProgramDerivedAddress> {
  const programAddressInput =
    params.programAddress ?? MPL_TOKEN_METADATA_PROGRAM_ADDRESS;
  const programAddress =
    typeof programAddressInput === "string"
      ? programAddressInput
      : programAddressInput.address;
  const editionMarkerNumber = BigInt(params.editionNumber) / 248n;
  const utf8Encoder = getUtf8Encoder();
  const addressEncoder = getAddressEncoder();

  return await getProgramDerivedAddress({
    programAddress,
    seeds: [
      utf8Encoder.encode("metadata"),
      addressEncoder.encode(programAddress),
      addressEncoder.encode(params.mint),
      utf8Encoder.encode("edition"),
      utf8Encoder.encode(editionMarkerNumber.toString()),
    ],
  });
}
