import type { TokenMetadata } from "@/lib/solana/metaplex-token-metadata";
import { TokenStandard } from "@/lib/solana/metaplex-token-metadata";
import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  planUpdate,
  updateRefusal,
  type DirtyFields,
  type UpdateFormValues,
} from "./update-plan";

const wallet = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const other = address("So11111111111111111111111111111111111111112");
const third = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");

const current: TokenMetadata = {
  updateAuthority: wallet,
  name: "Old",
  symbol: "OLD",
  uri: "https://arweave.net/old",
  sellerFeeBasisPoints: 500,
  creators: [
    { address: wallet, share: 60, verified: true },
    { address: other, share: 40, verified: false },
  ],
  isMutable: true,
  primarySaleHappened: false,
  tokenStandard: TokenStandard.NonFungible,
  collection: null,
};

/** The form as "Load current values" fills it. */
const loaded: UpdateFormValues = {
  name: current.name,
  symbol: current.symbol,
  uri: current.uri,
  updateAuthority: current.updateAuthority,
  isMutable: current.isMutable,
  primarySaleHappened: current.primarySaleHappened,
  creators: [
    { address: wallet, share: 60 },
    { address: other, share: 40 },
  ],
  sellerFeeBasisPoints: current.sellerFeeBasisPoints,
};

/** The form untouched, with the switch off. */
const empty: UpdateFormValues = {
  name: "",
  symbol: "",
  uri: "",
  updateAuthority: "",
  isMutable: true,
  primarySaleHappened: false,
  creators: [],
  sellerFeeBasisPoints: 0,
};

const allDirty: DirtyFields = {
  name: true,
  symbol: true,
  uri: true,
  updateAuthority: true,
  isMutable: true,
  primarySaleHappened: true,
  creators: true,
  sellerFeeBasisPoints: true,
};

describe("planUpdate", () => {
  it("sends nothing for loaded values, even when the form thinks they are all dirty", () => {
    expect(planUpdate(loaded, allDirty, current, wallet)).toBeNull();
  });

  it("sends nothing for an untouched form, whose defaults differ from the chain", () => {
    const immutableSold = {
      ...current,
      isMutable: false,
      primarySaleHappened: true,
    };
    expect(planUpdate(empty, {}, immutableSold, wallet)).toBeNull();
  });

  it("sends the whole data struct when one data field changes, the rest from the chain", () => {
    const plan = planUpdate(
      { ...empty, name: "New" },
      { name: true },
      current,
      wallet,
    );
    expect(plan).toEqual({
      data: { ...pickData(current), name: "New" },
      newUpdateAuthority: undefined,
      isMutable: undefined,
      primarySaleHappened: undefined,
    });
  });

  it("treats an emptied text field as untouched", () => {
    expect(
      planUpdate({ ...loaded, name: "" }, { name: true }, current, wallet),
    ).toBeNull();
  });

  it("keeps verification for creators on the NFT, grants it to the wallet, denies it to newcomers", () => {
    const plan = planUpdate(
      {
        ...loaded,
        creators: [
          { address: other, share: 50 },
          { address: wallet, share: 30 },
          { address: third, share: 20 },
        ],
      },
      { creators: true },
      current,
      wallet,
    );
    expect(plan?.data?.creators).toEqual([
      { address: other, share: 50, verified: false },
      { address: wallet, share: 30, verified: true },
      { address: third, share: 20, verified: false },
    ]);
  });

  it("writes an emptied creator list as no creators", () => {
    const plan = planUpdate(
      { ...loaded, creators: [] },
      { creators: true },
      current,
      wallet,
    );
    expect(plan?.data?.creators).toBeNull();
  });

  it("sends only the touched flag or authority, without data", () => {
    expect(
      planUpdate(
        { ...loaded, isMutable: false },
        { ...allDirty },
        current,
        wallet,
      ),
    ).toEqual({
      data: undefined,
      newUpdateAuthority: undefined,
      isMutable: false,
      primarySaleHappened: undefined,
    });
    expect(
      planUpdate(
        { ...empty, updateAuthority: other },
        { updateAuthority: true },
        current,
        wallet,
      )?.newUpdateAuthority,
    ).toBe(other);
  });
});

describe("updateRefusal", () => {
  const immutable = { ...current, isMutable: false, primarySaleHappened: true };

  it("refuses a data write, or re-enabling mutability, on immutable metadata", () => {
    expect(updateRefusal({ data: pickData(current) }, immutable)).toMatch(
      /immutable/,
    );
    expect(updateRefusal({ isMutable: true }, immutable)).toMatch(
      /made mutable again/,
    );
  });

  it("refuses turning primary sale off", () => {
    expect(updateRefusal({ primarySaleHappened: false }, immutable)).toMatch(
      /never off again/,
    );
  });

  it("allows what the program allows on immutable metadata", () => {
    expect(
      updateRefusal(
        { newUpdateAuthority: other, primarySaleHappened: true },
        { ...immutable, primarySaleHappened: false },
      ),
    ).toBeNull();
    expect(updateRefusal({ isMutable: false }, current)).toBeNull();
  });
});

const pickData = (m: TokenMetadata) => ({
  name: m.name,
  symbol: m.symbol,
  uri: m.uri,
  sellerFeeBasisPoints: m.sellerFeeBasisPoints,
  creators: m.creators,
});
