import {
  getCreateV1InstructionDataDecoder,
  getUpdateMetadataAccountV2InstructionDataDecoder,
  getMetadataEncoder,
  getUnverifyCollectionV1InstructionDataEncoder,
  getUpdateV1InstructionDataDecoder,
  getVerifyCollectionV1InstructionDataEncoder,
  getVerifyCreatorV1InstructionDataEncoder,
  TokenStandard,
  type MetadataArgs,
} from "@blastctrl/mpl-token-metadata";
import {
  AccountRole,
  address,
  createNoopSigner,
  generateKeyPairSigner,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Decoder,
  getProgramDerivedAddress,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  addToCollectionInstructions,
  createMetadataInstructions,
  createNftInstructions,
  fetchTokenMetadata,
  fetchTokenMetadatas,
  findMetadataAddress,
  removeFromCollectionInstructions,
  updateMetadataInstructions,
  updateNftInstructions,
  verifyCreatorInstructions,
} from "./metaplex-token-metadata";

const TOKEN_METADATA_PROGRAM = address(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const wallet = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const mint = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
const other = address("So11111111111111111111111111111111111111112");
/**
 * Stands in for the wallet's signer (`client.payer` in the app); the builders
 * must attach this very object wherever the wallet signs.
 */
const walletSigner = createNoopSigner(wallet);

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
    expect(await findMetadataAddress(mint)).toBe(expected);
  });
});

describe("createMetadataInstructions", () => {
  it("is a fungible createV1 on the given token program, the wallet as mint authority, payer and update authority, no creators", async () => {
    const tokenProgram = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    const [instruction, ...rest] = await createMetadataInstructions(
      walletSigner,
      mint,
      { name: "Test", symbol: "TST", uri: "https://arweave.net/x" },
      tokenProgram,
    );

    expect(rest).toEqual([]);
    expect(instruction?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    const byAddress = (a: Address) =>
      instruction?.accounts?.filter((account) => account.address === a);
    expect(byAddress(await findMetadataAddress(mint))).toEqual([
      { address: await findMetadataAddress(mint), role: AccountRole.WRITABLE },
    ]);
    // createV1 marks the mint writable (it would create it if it didn't exist).
    expect(byAddress(mint)).toEqual([
      { address: mint, role: AccountRole.WRITABLE },
    ]);
    // Authority and payer sign with the wallet's own signer object.
    expect(
      byAddress(wallet)?.map((a) => ({
        role: a.role,
        signer: (a as { signer?: unknown }).signer,
      })),
    ).toEqual([
      { role: AccountRole.READONLY_SIGNER, signer: walletSigner },
      { role: AccountRole.WRITABLE_SIGNER, signer: walletSigner },
      { role: AccountRole.READONLY, signer: undefined },
    ]);
    expect(byAddress(tokenProgram)).toHaveLength(1);

    const data = getCreateV1InstructionDataDecoder().decode(instruction!.data!);
    expect(data.tokenStandard).toBe(TokenStandard.Fungible);
    expect(data.name).toBe("Test");
    expect(data.creators.__option).toBe("None");
    expect(data.collectionDetails.__option).toBe("None");
    expect(data.isMutable).toBe(true);
  });
});

describe("updateMetadataInstructions", () => {
  it("targets the metadata PDA with the wallet as update authority, leaving the flags alone", async () => {
    const [update, ...rest] = await updateMetadataInstructions(
      walletSigner,
      mint,
      {},
    );

    expect(rest).toEqual([]);
    const data = getUpdateMetadataAccountV2InstructionDataDecoder().decode(
      update!.data!,
    );
    expect(data.isMutable.__option).toBe("None");
    expect(data.primarySaleHappened.__option).toBe("None");
    expect(update?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    // updateMetadataAccountV2: metadata, updateAuthority
    expect(update?.accounts).toEqual([
      { address: await findMetadataAddress(mint), role: AccountRole.WRITABLE },
      {
        address: wallet,
        role: AccountRole.READONLY_SIGNER,
        signer: walletSigner,
      },
    ]);
  });
});

describe("createNftInstructions", () => {
  it("creates then mints, with the mint keypair attached as a signer", async () => {
    const mintSigner = await generateKeyPairSigner();
    const [create, mintTo, ...rest] = await createNftInstructions(
      walletSigner,
      mintSigner,
      nftFields,
    );

    expect(rest).toEqual([]);
    expect(create?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(mintTo?.programAddress).toBe(TOKEN_METADATA_PROGRAM);

    // createV1: metadata, masterEdition, mint, authority, payer, updateAuthority, …
    expect(create?.accounts?.[0]?.address).toBe(
      await findMetadataAddress(mintSigner.address),
    );
    expect(create?.accounts?.[2]).toMatchObject({
      address: mintSigner.address,
      role: AccountRole.WRITABLE_SIGNER,
      signer: mintSigner,
    });
    expect(create?.accounts?.slice(3, 6)).toEqual([
      {
        address: wallet,
        role: AccountRole.READONLY_SIGNER,
        signer: walletSigner,
      },
      {
        address: wallet,
        role: AccountRole.WRITABLE_SIGNER,
        signer: walletSigner,
      },
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
      signer: walletSigner,
    });
  });

  it("encodes the fields, defaulting creators to the verified wallet", async () => {
    const mintSigner = await generateKeyPairSigner();
    const [create] = await createNftInstructions(
      walletSigner,
      mintSigner,
      nftFields,
    );
    const data = getCreateV1InstructionDataDecoder().decode(create!.data!);

    expect(data.name).toBe("Test");
    expect(data.symbol).toBe("TST");
    expect(data.uri).toBe("https://arweave.net/x");
    expect(data.sellerFeeBasisPoints).toBe(550);
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

  it("encodes custom creators, a collection parent and a print limit", async () => {
    const mintSigner = await generateKeyPairSigner();
    const [create] = await createNftInstructions(walletSigner, mintSigner, {
      ...nftFields,
      isMutable: false,
      isCollection: true,
      maxSupply: 10,
      creators: [
        { address: wallet, share: 60, verified: true },
        { address: other, share: 40, verified: false },
      ],
    });
    const data = getCreateV1InstructionDataDecoder().decode(create!.data!);

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
  it("targets the metadata PDA with the wallet as authority and payer", async () => {
    const [update, ...rest] = await updateNftInstructions(
      walletSigner,
      mint,
      {},
    );

    expect(rest).toEqual([]);
    expect(update?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    // updateV1: authority, delegateRecord, token, mint, metadata, edition, payer, …
    expect(update?.accounts?.[0]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
      signer: walletSigner,
    });
    expect(update?.accounts?.[3]).toEqual({
      address: mint,
      role: AccountRole.READONLY,
    });
    expect(update?.accounts?.[4]).toEqual({
      address: await findMetadataAddress(mint),
      role: AccountRole.WRITABLE,
    });
    expect(update?.accounts?.[6]).toEqual({
      address: wallet,
      role: AccountRole.WRITABLE_SIGNER,
      signer: walletSigner,
    });
  });

  it("leaves omitted fields untouched and encodes the given ones", async () => {
    const decode = async (
      fields: Parameters<typeof updateNftInstructions>[2],
    ) =>
      getUpdateV1InstructionDataDecoder().decode(
        (await updateNftInstructions(walletSigner, mint, fields))[0]!.data!,
      );

    const untouched = await decode({});
    expect(untouched.data).toEqual({ __option: "None" });
    expect(untouched.newUpdateAuthority).toEqual({ __option: "None" });
    expect(untouched.isMutable).toEqual({ __option: "None" });
    expect(untouched.primarySaleHappened).toEqual({ __option: "None" });

    const changed = await decode({
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
const rpcAccount = (data: ReadonlyUint8Array) => ({
  data: [getBase64Decoder().decode(data), "base64"] as const,
  executable: false,
  lamports: 1n,
  owner: TOKEN_METADATA_PROGRAM,
  rentEpoch: 0n,
  space: BigInt(data.length),
});

/** A metadata account as the program stores it, null-padded strings and all. */
const metadataAccount = (fields: Partial<MetadataArgs> = {}) =>
  getMetadataEncoder().encode({
    updateAuthority: wallet,
    mint,
    name: "Test".padEnd(32, "\0"),
    symbol: "TST".padEnd(10, "\0"),
    uri: "https://arweave.net/x".padEnd(200, "\0"),
    sellerFeeBasisPoints: 550,
    creators: [{ address: wallet, share: 100, verified: true }],
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
  const rpcWith = (data: ReadonlyUint8Array | null) =>
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

  it("decodes the account; kit strips the program's null padding", async () => {
    expect(await fetchTokenMetadata(rpcWith(metadataAccount()), mint)).toEqual({
      updateAuthority: wallet,
      name: "Test",
      symbol: "TST",
      uri: "https://arweave.net/x",
      sellerFeeBasisPoints: 550,
      creators: [{ address: wallet, share: 100, verified: true }],
      isMutable: true,
      primarySaleHappened: false,
      tokenStandard: TokenStandard.NonFungible,
      collection: null,
    });
  });

  it("reads the collection link", async () => {
    const encoded = metadataAccount({
      collection: { key: other, verified: true },
    });
    expect(await fetchTokenMetadata(rpcWith(encoded), mint)).toMatchObject({
      collection: { key: other, verified: true },
    });
  });
});

describe("fetchTokenMetadatas", () => {
  it("asks a hundred accounts per request, in order, null for the missing", async () => {
    const metadataAddress = await findMetadataAddress(mint);
    const requests: number[] = [];
    const rpc = {
      getMultipleAccounts: (addresses: Address[]) => ({
        send: async () => {
          requests.push(addresses.length);
          return {
            context: { slot: 0n },
            value: addresses.map((account) =>
              account === metadataAddress
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
  const built = addToCollectionInstructions(walletSigner, mint, collection);

  it("sets the collection, unverified, then verifies it", async () => {
    const [update, verify, ...rest] = await built;
    expect(rest).toEqual([]);
    expect(update?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(verify?.programAddress).toBe(TOKEN_METADATA_PROGRAM);

    const data = getUpdateV1InstructionDataDecoder().decode(update!.data!);
    expect(data.collection).toEqual({
      __kind: "Set",
      fields: [{ key: collection, verified: false }],
    });
    expect(data.data).toEqual({ __option: "None" });
    expect(verify?.data).toEqual(
      getVerifyCollectionV1InstructionDataEncoder().encode({}),
    );
  });

  it("has the wallet sign both, as the NFT's and then the collection's authority", async () => {
    const [update, verify] = await built;
    // updateV1: authority, delegateRecord, token, mint, metadata, edition, payer, …
    expect(update?.accounts?.[0]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
      signer: walletSigner,
    });
    expect(update?.accounts?.[3]).toEqual({
      address: mint,
      role: AccountRole.READONLY,
    });
    expect(update?.accounts?.[4]).toEqual({
      address: await findMetadataAddress(mint),
      role: AccountRole.WRITABLE,
    });
    expect(update?.accounts?.[6]).toEqual({
      address: wallet,
      role: AccountRole.WRITABLE_SIGNER,
      signer: walletSigner,
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
      {
        address: wallet,
        role: AccountRole.READONLY_SIGNER,
        signer: walletSigner,
      },
      { address: TOKEN_METADATA_PROGRAM, role: AccountRole.READONLY },
      { address: await findMetadataAddress(mint), role: AccountRole.WRITABLE },
      { address: collection, role: AccountRole.READONLY },
      {
        address: await findMetadataAddress(collection),
        role: AccountRole.WRITABLE,
      },
      { address: masterEdition, role: AccountRole.READONLY },
    ]);
  });
});

describe("removeFromCollectionInstructions", () => {
  it("unverifies the link, with the wallet as the collection's authority", async () => {
    const [unverify, ...rest] = await removeFromCollectionInstructions(
      walletSigner,
      mint,
      other,
    );

    expect(rest).toEqual([]);
    expect(unverify?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(unverify?.data).toEqual(
      getUnverifyCollectionV1InstructionDataEncoder().encode({}),
    );
    // unverifyCollectionV1: authority, delegateRecord, metadata, collectionMint, collectionMetadata, …
    expect(unverify?.accounts?.slice(0, 5)).toEqual([
      {
        address: wallet,
        role: AccountRole.READONLY_SIGNER,
        signer: walletSigner,
      },
      { address: TOKEN_METADATA_PROGRAM, role: AccountRole.READONLY },
      { address: await findMetadataAddress(mint), role: AccountRole.WRITABLE },
      { address: other, role: AccountRole.READONLY },
      { address: await findMetadataAddress(other), role: AccountRole.WRITABLE },
    ]);
  });
});

describe("verifyCreatorInstructions", () => {
  it("has the creator sign for the NFT's metadata account", async () => {
    const [verify, ...rest] = await verifyCreatorInstructions(
      walletSigner,
      mint,
    );

    expect(rest).toEqual([]);
    expect(verify?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(verify?.data).toEqual(
      getVerifyCreatorV1InstructionDataEncoder().encode({}),
    );
    // verifyCreatorV1: authority, delegateRecord, metadata, …
    expect(verify?.accounts?.[0]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
      signer: walletSigner,
    });
    expect(verify?.accounts?.[2]).toEqual({
      address: await findMetadataAddress(mint),
      role: AccountRole.WRITABLE,
    });
  });
});
