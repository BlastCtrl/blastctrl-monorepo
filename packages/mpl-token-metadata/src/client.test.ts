import {
  address,
  createNoopSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  lamports,
  none,
  some,
  type Address,
  type EncodedAccount,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  findAssociatedTokenPda as findAssociatedTokenPdaFromTokenProgram,
  getMintEncoder,
} from "@solana-program/token";
import { describe, expect, it } from "vitest";

import {
  deserializeDigitalAsset,
  findAssociatedTokenPda,
  findMetadataPda,
  getCreateV1InstructionAsync,
  getMasterEditionEncoder,
  getMetadataDecoder,
  getMetadataEncoder,
  Key,
  MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
  TokenStandard,
  type Metadata,
} from "./index";

const MINT = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
const AUTHORITY = address("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const PAYER = address("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
const UPDATE_AUTHORITY = address(
  "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
);

function encodedAccount(
  accountAddress: Address,
  programAddress: Address,
  data: ReadonlyUint8Array,
): EncodedAccount {
  return {
    address: accountAddress,
    data: new Uint8Array(data),
    executable: false,
    lamports: lamports(1_000_000n),
    programAddress,
    space: BigInt(data.length),
  };
}

describe("@blastctrl/mpl-token-metadata", () => {
  it("targets the Token Metadata program", () => {
    expect(MPL_TOKEN_METADATA_PROGRAM_ADDRESS).toBe(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    );
  });

  it("derives the metadata PDA from ['metadata', program, mint]", async () => {
    const addressEncoder = getAddressEncoder();
    const expected = await getProgramDerivedAddress({
      programAddress: MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
      seeds: [
        getUtf8Encoder().encode("metadata"),
        addressEncoder.encode(MPL_TOKEN_METADATA_PROGRAM_ADDRESS),
        addressEncoder.encode(MINT),
      ],
    });

    expect(await findMetadataPda({ mint: MINT })).toEqual(expected);
  });

  it("derives the same associated token account as @solana-program/token", async () => {
    const [hooked] = await findAssociatedTokenPda({
      mint: MINT,
      owner: AUTHORITY,
    });
    const [fromTokenProgram] = await findAssociatedTokenPdaFromTokenProgram({
      mint: MINT,
      owner: AUTHORITY,
      tokenProgram: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    expect(hooked).toBe(fromTokenProgram);
  });

  it("builds a createV1 instruction from plain inputs", async () => {
    const instruction = await getCreateV1InstructionAsync({
      mint: MINT,
      authority: createNoopSigner(AUTHORITY),
      payer: createNoopSigner(PAYER),
      updateAuthority: UPDATE_AUTHORITY,
      name: "Jito",
      symbol: "JTO",
      uri: "https://metadata.jito.network/token/jto",
      sellerFeeBasisPoints: 0,
      tokenStandard: TokenStandard.NonFungible,
    });

    expect(instruction.programAddress).toBe(MPL_TOKEN_METADATA_PROGRAM_ADDRESS);
    expect(instruction.data.length).toBeGreaterThan(0);

    // The metadata account defaults to the mint's metadata PDA.
    const [metadata] = await findMetadataPda({ mint: MINT });
    expect(instruction.accounts[0]?.address).toBe(metadata);
    expect(instruction.accounts[2]?.address).toBe(MINT);
  });

  it("round-trips a Metadata account through its encoder and decoder", () => {
    const bytes = getMetadataEncoder().encode({
      updateAuthority: UPDATE_AUTHORITY,
      mint: MINT,
      name: "Jito",
      symbol: "JTO",
      uri: "https://metadata.jito.network/token/jto",
      sellerFeeBasisPoints: 500,
      creators: some([{ address: AUTHORITY, verified: true, share: 100 }]),
      primarySaleHappened: false,
      isMutable: true,
      editionNonce: some(254),
      tokenStandard: some(TokenStandard.Fungible),
      collection: none(),
      uses: none(),
      collectionDetails: none(),
      programmableConfig: none(),
    });

    const expected: Metadata = {
      key: Key.MetadataV1,
      updateAuthority: UPDATE_AUTHORITY,
      mint: MINT,
      name: "Jito",
      symbol: "JTO",
      uri: "https://metadata.jito.network/token/jto",
      sellerFeeBasisPoints: 500,
      creators: some([{ address: AUTHORITY, verified: true, share: 100 }]),
      primarySaleHappened: false,
      isMutable: true,
      editionNonce: some(254),
      tokenStandard: some(TokenStandard.Fungible),
      collection: none(),
      uses: none(),
      collectionDetails: none(),
      programmableConfig: none(),
    };
    expect(getMetadataDecoder().decode(bytes)).toEqual(expected);
  });

  it("attaches a master edition to a deserialized digital asset", async () => {
    const [metadataAddress] = await findMetadataPda({ mint: MINT });
    const tokenProgram = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    const asset = deserializeDigitalAsset(
      MINT,
      encodedAccount(
        MINT,
        tokenProgram,
        getMintEncoder().encode({
          mintAuthority: some(AUTHORITY),
          supply: 1n,
          decimals: 0,
          isInitialized: true,
          freezeAuthority: some(AUTHORITY),
        }),
      ),
      encodedAccount(
        metadataAddress,
        MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
        getMetadataEncoder().encode({
          updateAuthority: UPDATE_AUTHORITY,
          mint: MINT,
          name: "Edition",
          symbol: "",
          uri: "",
          sellerFeeBasisPoints: 0,
          creators: none(),
          primarySaleHappened: false,
          isMutable: true,
          editionNonce: none(),
          tokenStandard: some(TokenStandard.NonFungible),
          collection: none(),
          uses: none(),
          collectionDetails: none(),
          programmableConfig: none(),
        }),
      ),
      encodedAccount(
        PAYER,
        MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
        getMasterEditionEncoder().encode({ supply: 0n, maxSupply: some(0n) }),
      ),
    );

    expect(asset.metadata.name).toBe("Edition");
    expect(asset.edition).toMatchObject({
      isOriginal: true,
      key: Key.MasterEditionV2,
      supply: 0n,
    });
  });
});
