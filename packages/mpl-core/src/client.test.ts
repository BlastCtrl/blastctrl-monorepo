import {
  address,
  createNoopSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  none,
  some,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import {
  CREATE_V1_DISCRIMINATOR,
  DataState,
  findAssetSignerPda,
  getAssetV1Codec,
  getAssetV1Decoder,
  getAssetV1Encoder,
  getCreateV1Instruction,
  getCreateV1InstructionDataDecoder,
  identifyMplCoreAccount,
  Key,
  MPL_CORE_PROGRAM_ADDRESS,
  MplCoreAccount,
} from "./index";

// No validator or network: everything here is pure encoding and PDA math.
const ASSET = address("9Lk5y6Gm6Tp4o3FTQUa9Jk2URXMbmzbfHTX6tLySb4WB");
const PAYER = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");
const OWNER = address("BPFLoaderUpgradeab1e11111111111111111111111");

describe("@blastctrl/mpl-core generated client", () => {
  it("targets the Core program", () => {
    expect(MPL_CORE_PROGRAM_ADDRESS).toBe(
      "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
    );
  });

  it("derives the asset signer PDA from mpl-core-execute and the asset", async () => {
    const expected = await getProgramDerivedAddress({
      programAddress: MPL_CORE_PROGRAM_ADDRESS,
      seeds: [
        getUtf8Encoder().encode("mpl-core-execute"),
        getAddressEncoder().encode(ASSET),
      ],
    });
    expect(await findAssetSignerPda({ asset: ASSET })).toEqual(expected);
  });

  it("builds createV1 from plain inputs, defaulting plugins and dataState", () => {
    const instruction = getCreateV1Instruction({
      asset: createNoopSigner(ASSET),
      payer: createNoopSigner(PAYER),
      name: "Smoke test",
      uri: "https://example.com/asset.json",
    });

    expect(instruction.programAddress).toBe(MPL_CORE_PROGRAM_ADDRESS);
    expect(instruction.data.length).toBeGreaterThan(0);
    expect(instruction.data[0]).toBe(CREATE_V1_DISCRIMINATOR);
    expect(instruction.accounts[0]?.address).toBe(ASSET);

    const data = getCreateV1InstructionDataDecoder().decode(instruction.data);
    expect(data).toMatchObject({
      dataState: DataState.AccountState,
      name: "Smoke test",
      uri: "https://example.com/asset.json",
      plugins: some([]),
    });
  });

  it("round-trips AssetV1 account data and identifies it by its key", () => {
    // The encoder is generated, so this is an encode -> decode round trip;
    // the encoder fills `key` with Key.AssetV1 (the account discriminator).
    const bytes = getAssetV1Encoder().encode({
      owner: OWNER,
      updateAuthority: { __kind: "Address", fields: [PAYER] },
      name: "Smoke test",
      uri: "https://example.com/asset.json",
      seq: none(),
    });

    expect(bytes[0]).toBe(Key.AssetV1);
    expect(identifyMplCoreAccount(bytes)).toBe(MplCoreAccount.AssetV1);
    expect(getAssetV1Decoder().decode(bytes)).toEqual({
      key: Key.AssetV1,
      owner: OWNER,
      updateAuthority: { __kind: "Address", fields: [PAYER] },
      name: "Smoke test",
      uri: "https://example.com/asset.json",
      seq: none(),
    });
    expect(getAssetV1Codec().encode(getAssetV1Codec().decode(bytes))).toEqual(
      bytes,
    );
  });
});
