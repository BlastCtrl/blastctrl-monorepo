import { getBase64Decoder, type Address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  decodeFeature,
  FEATURE_PROGRAM_ADDRESS,
  readRentGates,
  readRentReductionStatus,
  RENT_REDUCTION_STEPS,
  rentExemptMinimum,
  type RentReductionRpc,
} from "./rent-reduction";

/** A feature account as `getMultipleAccounts` returns it in base64. */
function feature(
  activationSlot: bigint | null,
  owner: Address = FEATURE_PROGRAM_ADDRESS,
) {
  const data = new Uint8Array(9);
  if (activationSlot !== null) {
    data[0] = 1;
    new DataView(data.buffer).setBigUint64(1, activationSlot, true);
  }
  return {
    data: [getBase64Decoder().decode(data), "base64"],
    executable: false,
    lamports: 953_520n,
    owner,
    space: 9n,
  };
}

type RpcAccount = ReturnType<typeof feature> | null;

// Mainnet in late November 2026: steps 1 and 2 live, the rest not scheduled.
const twoLive: RpcAccount[] = [
  feature(444_096_000n),
  feature(446_256_000n),
  null,
  null,
  null,
];

/** Kit's RPC shape: each method returns a request whose `send` resolves. */
function fixture({
  accounts = twoLive,
  lamportsPerByte = 5080n,
  failing = [] as string[],
} = {}) {
  const requested: Address[][] = [];
  const request = <T>(method: string, value: () => T) => ({
    send: async () => {
      if (failing.includes(method)) throw new Error(`${method} failed`);
      return value();
    },
  });
  const rpc = {
    getMultipleAccounts: (addresses: Address[]) =>
      request("getMultipleAccounts", () => {
        requested.push(addresses);
        return { context: { slot: 1n }, value: accounts };
      }),
    getMinimumBalanceForRentExemption: (size: bigint) =>
      request(
        "getMinimumBalanceForRentExemption",
        () => (size + 128n) * lamportsPerByte,
      ),
    getEpochInfo: () =>
      request("getEpochInfo", () => ({
        absoluteSlot: 471_666_935n,
        epoch: 1091n,
        slotIndex: 354_935n,
        slotsInEpoch: 432_000n,
      })),
  } as unknown as RentReductionRpc;
  return { rpc, requested };
}

describe("decodeFeature", () => {
  it("reads the activation slot of an activated feature", () => {
    const data = new Uint8Array(9);
    data[0] = 1;
    new DataView(data.buffer).setBigUint64(1, 444_096_000n, true);
    expect(decodeFeature(data)).toBe(444_096_000n);
  });

  it("returns null for a feature that isn't activated yet", () => {
    expect(decodeFeature(new Uint8Array(9))).toBeNull();
    expect(decodeFeature(new Uint8Array([0]))).toBeNull();
  });
});

describe("rentExemptMinimum", () => {
  it("charges for the storage overhead on top of the data", () => {
    expect(rentExemptMinimum(165, 6960)).toBe(2_039_280);
    expect(rentExemptMinimum(165, 5080)).toBe(1_488_440);
  });
});

describe("readRentGates", () => {
  it("reads every step's gate in one request, in step order", async () => {
    const { rpc, requested } = fixture();
    const gates = await readRentGates(rpc);
    expect(requested).toEqual([RENT_REDUCTION_STEPS.map((s) => s.featureId)]);
    expect(gates.map((g) => [g.step, g.status, g.activationSlot])).toEqual([
      [1, "active", 444_096_000n],
      [2, "active", 446_256_000n],
      [3, "not-scheduled", null],
      [4, "not-scheduled", null],
      [5, "not-scheduled", null],
    ]);
  });

  it("treats a feature account without a slot as scheduled", async () => {
    const { rpc } = fixture({
      accounts: [...twoLive.slice(0, 2), feature(null), null, null],
    });
    const gates = await readRentGates(rpc);
    expect(gates[2]).toMatchObject({
      status: "scheduled",
      activationSlot: null,
    });
  });

  it("ignores an account at a gate's address that isn't a feature", async () => {
    const { rpc } = fixture({
      accounts: [
        ...twoLive.slice(0, 2),
        feature(1n, "11111111111111111111111111111111" as Address),
        null,
        null,
      ],
    });
    expect((await readRentGates(rpc))[2]!.status).toBe("not-scheduled");
  });
});

describe("readRentReductionStatus", () => {
  it("returns the live rate, each gate and when the epoch ends", async () => {
    const { rpc } = fixture();
    const status = await readRentReductionStatus(rpc, { now: () => 1_000 });
    expect(status).toEqual({
      readAt: 1_000,
      lamportsPerByte: 5080,
      gates: [
        "active",
        "active",
        "not-scheduled",
        "not-scheduled",
        "not-scheduled",
      ],
      nextEpochAt: 1_000 + (432_000 - 354_935) * 400,
    });
    // It crosses from a server to the browser as JSON.
    expect(JSON.parse(JSON.stringify(status))).toEqual(status);
  });

  it("still returns the rate when the gates can't be read", async () => {
    for (const method of ["getMultipleAccounts", "getEpochInfo"]) {
      const { rpc } = fixture({ failing: [method], lamportsPerByte: 2575n });
      expect(await readRentReductionStatus(rpc, { now: () => 5 })).toEqual({
        readAt: 5,
        lamportsPerByte: 2575,
        gates: null,
        nextEpochAt: null,
      });
    }
  });

  it("fails when the rate can't be read", async () => {
    const { rpc } = fixture({ failing: ["getMinimumBalanceForRentExemption"] });
    await expect(readRentReductionStatus(rpc)).rejects.toThrow();
  });
});
