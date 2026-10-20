import {
  DataState,
  getCreateV1InstructionDataSerializer,
} from "@metaplex-foundation/mpl-core";
import { AccountRole, address, generateKeyPairSigner } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { createCoreAssetInstructions } from "./metaplex-core";

const CORE_PROGRAM = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
const wallet = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");

describe("createCoreAssetInstructions", () => {
  it("creates the asset with its keypair attached and the wallet paying", async () => {
    const asset = await generateKeyPairSigner();
    const [create, ...rest] = createCoreAssetInstructions(wallet, asset, {
      name: "Core",
      uri: "https://arweave.net/x",
    });

    expect(rest).toEqual([]);
    expect(create?.programAddress).toBe(CORE_PROGRAM);
    // createV1: asset, collection, authority, payer, owner, updateAuthority, …
    expect(create?.accounts?.[0]).toMatchObject({
      address: asset.address,
      role: AccountRole.WRITABLE_SIGNER,
      signer: asset,
    });
    expect(create?.accounts?.[3]).toEqual({
      address: wallet,
      role: AccountRole.WRITABLE_SIGNER,
    });
    // Optional accounts left out are the program id placeholder, so the
    // program applies its defaults: wallet as authority, owner and update authority.
    for (const index of [1, 2, 4, 5]) {
      expect(create?.accounts?.[index]).toEqual({
        address: CORE_PROGRAM,
        role: AccountRole.READONLY,
      });
    }

    const [data] = getCreateV1InstructionDataSerializer().deserialize(
      new Uint8Array(create!.data!),
    );
    expect(data.name).toBe("Core");
    expect(data.uri).toBe("https://arweave.net/x");
    expect(data.dataState).toBe(DataState.AccountState);
    expect(data.plugins).toEqual({ __option: "Some", value: [] });
  });
});
