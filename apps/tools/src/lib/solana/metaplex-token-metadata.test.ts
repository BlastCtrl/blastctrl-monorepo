import {
  getCreateV1InstructionDataSerializer,
  getMetadataAccountDataSerializer,
  getUnverifyCollectionV1InstructionDataSerializer,
  getUpdateV1InstructionDataSerializer,
  getVerifyCollectionV1InstructionDataSerializer,
  TokenStandard,
  type MetadataAccountDataArgs,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Decoder,
  getProgramDerivedAddress,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { toUmiPublicKey } from "./metaplex-umi";
import {
  addToCollectionInstructions,
  createNftInstructions,
  fetchTokenMetadata,
  fetchTokenMetadatas,
  findMetadataAddress,
  removeFromCollectionInstructions,
  updateNftInstructions,
} from "./metaplex-token-metadata";

const TOKEN_METADATA_PROGRAM = address(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const wallet = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const mint = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
const other = address("So11111111111111111111111111111111111111112");

const nftFields = {
  name: "Test",
  symbol: "TST",
  uri: "https://arweave.net/x",
  sellerFeeBasisPoints: 550,
  isMutable: true,
  isCollection: false,
  maxSupply: 0,
};

describe("findMetadataAddress", () => {
  it("is the Token Metadata PDA of the mint", async () => {
    const encoder = getAddressEncoder();
    const [expected] = await getProgramDerivedAddress({
      programAddress: TOKEN_METADATA_PROGRAM,
      seeds: [
        "metadata",
        encoder.encode(TOKEN_METADATA_PROGRAM),
        encoder.encode(mint),
      ],
    });
    expect(findMetadataAddress(mint)).toBe(expected);
  });
});

describe("createNftInstructions", () => {
  it("creates then mints, with the mint keypair attached as a signer", async () => {
    const mintSigner = await generateKeyPairSigner();
    const [create, mintTo, ...rest] = createNftInstructions(
      wallet,
      mintSigner,
      nftFields,
    );

    expect(rest).toEqual([]);
    expect(create?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(mintTo?.programAddress).toBe(TOKEN_METADATA_PROGRAM);

    // createV1: metadata, masterEdition, mint, authority, payer, updateAuthority, …
    expect(create?.accounts?.[0]?.address).toBe(
      findMetadataAddress(mintSigner.address),
    );
    expect(create?.accounts?.[2]).toMatchObject({
      address: mintSigner.address,
      role: AccountRole.WRITABLE_SIGNER,
      signer: mintSigner,
    });
    expect(create?.accounts?.slice(3, 6)).toEqual([
      { address: wallet, role: AccountRole.READONLY_SIGNER },
      { address: wallet, role: AccountRole.WRITABLE_SIGNER },
      { address: wallet, role: AccountRole.READONLY },
    ]);

    // mintV1: token, tokenOwner, metadata, masterEdition, tokenRecord, mint, authority, …
    expect(mintTo?.accounts?.[1]).toEqual({
      address: wallet,
      role: AccountRole.READONLY,
    });
    expect(mintTo?.accounts?.[5]).toEqual({
      address: mintSigner.address,
      role: AccountRole.WRITABLE,
    });
    expect(mintTo?.accounts?.[6]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
    });
  });

  it("encodes the fields, defaulting creators to the verified wallet", async () => {
    const mintSigner = await generateKeyPairSigner();
    const [create] = createNftInstructions(wallet, mintSigner, nftFields);
    const [data] = getCreateV1InstructionDataSerializer().deserialize(
      new Uint8Array(create!.data!),
    );

    expect(data.name).toBe("Test");
    expect(data.symbol).toBe("TST");
    expect(data.uri).toBe("https://arweave.net/x");
    expect(data.sellerFeeBasisPoints.basisPoints).toBe(550n);
    expect(data.tokenStandard).toBe(TokenStandard.NonFungible);
    expect(data.isMutable).toBe(true);
    expect(data.creators).toEqual({
      __option: "Some",
      value: [{ address: wallet, share: 100, verified: true }],
    });
    expect(data.collectionDetails).toEqual({ __option: "None" });
    expect(data.printSupply).toEqual({
      __option: "Some",
      value: { __kind: "Zero" },
    });
  });

  it("encodes custom creators, a sized collection and a print limit", async () => {
    const mintSigner = await generateKeyPairSigner();
    const [create] = createNftInstructions(wallet, mintSigner, {
      ...nftFields,
      isMutable: false,
      isCollection: true,
      maxSupply: 10,
      creators: [
        { address: wallet, share: 60, verified: true },
        { address: other, share: 40, verified: false },
      ],
    });
    const [data] = getCreateV1InstructionDataSerializer().deserialize(
      new Uint8Array(create!.data!),
    );

    expect(data.isMutable).toBe(false);
    expect(data.creators).toEqual({
      __option: "Some",
      value: [
        { address: wallet, share: 60, verified: true },
        { address: other, share: 40, verified: false },
      ],
    });
    expect(data.collectionDetails.__option).toBe("Some");
    expect(data.printSupply).toEqual({
      __option: "Some",
      value: { __kind: "Limited", fields: [10n] },
    });
  });
});

describe("updateNftInstructions", () => {
  it("targets the metadata PDA with the wallet as authority and payer", () => {
    const [update, ...rest] = updateNftInstructions(wallet, mint, {});

    expect(rest).toEqual([]);
    expect(update?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    // updateV1: authority, delegateRecord, token, mint, metadata, edition, payer, …
    expect(update?.accounts?.[0]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
    });
    expect(update?.accounts?.[3]).toEqual({
      address: mint,
      role: AccountRole.READONLY,
    });
    expect(update?.accounts?.[4]).toEqual({
      address: findMetadataAddress(mint),
      role: AccountRole.WRITABLE,
    });
    expect(update?.accounts?.[6]).toEqual({
      address: wallet,
      role: AccountRole.WRITABLE_SIGNER,
    });
  });

  it("leaves omitted fields untouched and encodes the given ones", () => {
    const deserialize = (fields: Parameters<typeof updateNftInstructions>[2]) =>
      getUpdateV1InstructionDataSerializer().deserialize(
        new Uint8Array(updateNftInstructions(wallet, mint, fields)[0]!.data!),
      )[0];

    const untouched = deserialize({});
    expect(untouched.data).toEqual({ __option: "None" });
    expect(untouched.newUpdateAuthority).toEqual({ __option: "None" });
    expect(untouched.isMutable).toEqual({ __option: "None" });
    expect(untouched.primarySaleHappened).toEqual({ __option: "None" });

    const changed = deserialize({
      data: {
        name: "New",
        symbol: "NEW",
        uri: "https://arweave.net/y",
        sellerFeeBasisPoints: 100,
        creators: null,
      },
      newUpdateAuthority: other,
      isMutable: false,
      primarySaleHappened: true,
    });
    expect(changed.data).toEqual({
      __option: "Some",
      value: {
        name: "New",
        symbol: "NEW",
        uri: "https://arweave.net/y",
        sellerFeeBasisPoints: 100,
        creators: { __option: "None" },
      },
    });
    expect(changed.newUpdateAuthority).toEqual({
      __option: "Some",
      value: other,
    });
    expect(changed.isMutable).toEqual({ __option: "Some", value: false });
    expect(changed.primarySaleHappened).toEqual({
      __option: "Some",
      value: true,
    });
  });
});

/** An account's RPC shape, as `getAccountInfo` and `getMultipleAccounts` give it. */
const rpcAccount = (data: Uint8Array) => ({
  data: [getBase64Decoder().decode(data), "base64"] as const,
  executable: false,
  lamports: 1n,
  owner: TOKEN_METADATA_PROGRAM,
  rentEpoch: 0n,
  space: BigInt(data.length),
});

/** A metadata account as the program stores it, null-padded strings and all. */
const metadataAccount = (fields: Partial<MetadataAccountDataArgs> = {}) =>
  getMetadataAccountDataSerializer().serialize({
    updateAuthority: toUmiPublicKey(wallet),
    mint: toUmiPublicKey(mint),
    name: "Test".padEnd(32, "\0"),
    symbol: "TST".padEnd(10, "\0"),
    uri: "https://arweave.net/x".padEnd(200, "\0"),
    sellerFeeBasisPoints: 550,
    creators: [{ address: toUmiPublicKey(wallet), share: 100, verified: true }],
    primarySaleHappened: false,
    isMutable: true,
    editionNonce: null,
    tokenStandard: TokenStandard.NonFungible,
    collection: null,
    uses: null,
    collectionDetails: null,
    programmableConfig: null,
    ...fields,
  });

describe("fetchTokenMetadata", () => {
  const rpcWith = (data: Uint8Array | null) =>
    ({
      getAccountInfo: () => ({
        send: async () => ({
          context: { slot: 0n },
          value: data && rpcAccount(data),
        }),
      }),
    }) as unknown as Rpc<GetAccountInfoApi>;

  it("is null when the mint has no metadata account", async () => {
    expect(await fetchTokenMetadata(rpcWith(null), mint)).toBeNull();
  });

  it("decodes the account; Umi strips the program's null padding", async () => {
    expect(await fetchTokenMetadata(rpcWith(metadataAccount()), mint)).toEqual({
      updateAuthority: wallet,
      name: "Test",
      symbol: "TST",
      uri: "https://arweave.net/x",
      sellerFeeBasisPoints: 550,
      creators: [{ address: wallet, share: 100, verified: true }],
      collection: null,
    });
  });

  it("reads the collection link", async () => {
    const encoded = metadataAccount({
      collection: { key: toUmiPublicKey(other), verified: true },
    });
    expect(await fetchTokenMetadata(rpcWith(encoded), mint)).toMatchObject({
      collection: { key: other, verified: true },
    });
  });
});

describe("fetchTokenMetadatas", () => {
  it("asks a hundred accounts per request, in order, null for the missing", async () => {
    const requests: number[] = [];
    const rpc = {
      getMultipleAccounts: (addresses: Address[]) => ({
        send: async () => {
          requests.push(addresses.length);
          return {
            context: { slot: 0n },
            value: addresses.map((account) =>
              account === findMetadataAddress(mint)
                ? rpcAccount(metadataAccount())
                : null,
            ),
          };
        },
      }),
    } as unknown as Rpc<GetMultipleAccountsApi>;
    const mints = [
      ...Array.from({ length: 149 }, (_, i) =>
        getAddressDecoder().decode(new Uint8Array(32).fill(i + 1)),
      ),
      mint,
    ];

    const result = await fetchTokenMetadatas(rpc, mints);

    expect(requests).toEqual([100, 50]);
    expect(result).toHaveLength(150);
    expect(result.slice(0, 149).every((m) => m === null)).toBe(true);
    expect(result[149]).toMatchObject({
      updateAuthority: wallet,
      name: "Test",
    });
  });
});

describe("addToCollectionInstructions", () => {
  const collection = other;
  const [update, verify, ...rest] = addToCollectionInstructions(
    wallet,
    mint,
    collection,
  );

  it("sets the collection, unverified, then verifies it", () => {
    expect(rest).toEqual([]);
    expect(update?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(verify?.programAddress).toBe(TOKEN_METADATA_PROGRAM);

    const [data] = getUpdateV1InstructionDataSerializer().deserialize(
      new Uint8Array(update!.data!),
    );
    expect(data.collection).toEqual({
      __kind: "Set",
      fields: [{ key: collection, verified: false }],
    });
    expect(data.data).toEqual({ __option: "None" });
    expect(verify?.data).toEqual(
      getVerifyCollectionV1InstructionDataSerializer().serialize({}),
    );
  });

  it("has the wallet sign both, as the NFT's and then the collection's authority", async () => {
    // updateV1: authority, delegateRecord, token, mint, metadata, edition, payer, …
    expect(update?.accounts?.[0]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
    });
    expect(update?.accounts?.[3]).toEqual({
      address: mint,
      role: AccountRole.READONLY,
    });
    expect(update?.accounts?.[4]).toEqual({
      address: findMetadataAddress(mint),
      role: AccountRole.WRITABLE,
    });
    expect(update?.accounts?.[6]).toEqual({
      address: wallet,
      role: AccountRole.WRITABLE_SIGNER,
    });

    // verifyCollectionV1: authority, delegateRecord, metadata, collectionMint,
    // collectionMetadata, collectionMasterEdition, …
    const encoder = getAddressEncoder();
    const [masterEdition] = await getProgramDerivedAddress({
      programAddress: TOKEN_METADATA_PROGRAM,
      seeds: [
        "metadata",
        encoder.encode(TOKEN_METADATA_PROGRAM),
        encoder.encode(collection),
        "edition",
      ],
    });
    expect(verify?.accounts?.slice(0, 6)).toEqual([
      { address: wallet, role: AccountRole.READONLY_SIGNER },
      { address: TOKEN_METADATA_PROGRAM, role: AccountRole.READONLY },
      { address: findMetadataAddress(mint), role: AccountRole.WRITABLE },
      { address: collection, role: AccountRole.READONLY },
      { address: findMetadataAddress(collection), role: AccountRole.WRITABLE },
      { address: masterEdition, role: AccountRole.READONLY },
    ]);
  });
});

describe("removeFromCollectionInstructions", () => {
  it("unverifies the link, with the wallet as the collection's authority", () => {
    const [unverify, ...rest] = removeFromCollectionInstructions(
      wallet,
      mint,
      other,
    );

    expect(rest).toEqual([]);
    expect(unverify?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(unverify?.data).toEqual(
      getUnverifyCollectionV1InstructionDataSerializer().serialize({}),
    );
    // unverifyCollectionV1: authority, delegateRecord, metadata, collectionMint, collectionMetadata, …
    expect(unverify?.accounts?.slice(0, 5)).toEqual([
      { address: wallet, role: AccountRole.READONLY_SIGNER },
      { address: TOKEN_METADATA_PROGRAM, role: AccountRole.READONLY },
      { address: findMetadataAddress(mint), role: AccountRole.WRITABLE },
      { address: other, role: AccountRole.READONLY },
      { address: findMetadataAddress(other), role: AccountRole.WRITABLE },
    ]);
  });
});
