import { findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  getUmi,
  toKitInstruction,
  toUmiPublicKey,
  toUmiSigner,
} from "./metaplex-umi";
import {
  createMetadataInstructions,
  updateMetadataInstructions,
} from "./metaplex-token-metadata";

const TOKEN_METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const wallet = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const mint = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");

describe("metaplex-umi", () => {
  it("builds without touching an RPC and reuses one Umi", () => {
    expect(getUmi()).toBe(getUmi());
    expect(() => getUmi().rpc.getEndpoint()).toThrow();
    expect(() => getUmi().eddsa.generateKeypair()).toThrow("builder-only");
  });

  it("derives PDAs like kit, synchronously", async () => {
    const umi = getUmi();
    const program = address(TOKEN_METADATA_PROGRAM);
    const encoder = getAddressEncoder();
    const [expected, bump] = await getProgramDerivedAddress({
      programAddress: program,
      seeds: ["metadata", encoder.encode(program), encoder.encode(mint)],
    });
    expect(findMetadataPda(umi, { mint: toUmiPublicKey(mint) })).toEqual([
      expected,
      bump,
    ]);
    expect(umi.eddsa.isOnCurve(toUmiPublicKey(wallet))).toBe(true);
    expect(umi.eddsa.isOnCurve(toUmiPublicKey(expected))).toBe(false);
  });

  it("maps a Umi instruction field for field", () => {
    const [instruction] = createMetadataInstructions(wallet, mint, {
      name: "Test",
      symbol: "TST",
      uri: "https://arweave.net/x",
    });

    expect(instruction?.programAddress).toBe(TOKEN_METADATA_PROGRAM);
    expect(instruction?.data?.length).toBeGreaterThan(0);
    // The wallet appears three times: mint authority (read-only signer),
    // payer (writable signer) and update authority (read-only). The kit
    // compiler merges those into one writable signer. No kit signer is
    // attached: the fee payer signs for itself.
    const walletMetas =
      instruction?.accounts?.filter((a) => a.address === wallet) ?? [];
    expect(walletMetas.map((a) => a.role)).toEqual([
      AccountRole.READONLY_SIGNER,
      AccountRole.WRITABLE_SIGNER,
      AccountRole.READONLY,
    ]);
    expect(walletMetas.some((a) => "signer" in a)).toBe(false);
    // The mint is only read.
    expect(instruction?.accounts?.find((a) => a.address === mint)?.role).toBe(
      AccountRole.READONLY,
    );
  });

  it("attaches a kit signer to a signer-role account that matches", async () => {
    const extra = await generateKeyPairSigner();
    const umiInstruction = {
      programId: getUmi().programs.getPublicKey("mplTokenMetadata"),
      keys: [
        {
          pubkey: toUmiSigner(extra.address).publicKey,
          isSigner: true,
          isWritable: false,
        },
        {
          pubkey: toUmiSigner(wallet).publicKey,
          isSigner: true,
          isWritable: true,
        },
      ],
      data: new Uint8Array([1, 2, 3]),
    };

    const [withSigner, walletOnly] =
      toKitInstruction(umiInstruction, [extra]).accounts ?? [];
    expect(withSigner).toMatchObject({
      address: extra.address,
      role: AccountRole.READONLY_SIGNER,
      signer: extra,
    });
    expect(walletOnly).toEqual({
      address: wallet,
      role: AccountRole.WRITABLE_SIGNER,
    });
  });

  it("update targets the metadata PDA with the wallet as update authority", () => {
    const [create] = createMetadataInstructions(wallet, mint, {});
    const [update] = updateMetadataInstructions(wallet, mint, {});
    const createPda = create?.accounts?.[0]?.address;
    const updatePda = update?.accounts?.[0]?.address;

    expect(updatePda).toBe(createPda);
    expect(update?.accounts?.[1]).toEqual({
      address: wallet,
      role: AccountRole.READONLY_SIGNER,
    });
  });
});
