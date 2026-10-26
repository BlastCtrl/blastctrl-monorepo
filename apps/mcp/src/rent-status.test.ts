import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import {
  cacheRentStatus,
  decodeFeature,
  RENT_REDUCTION_STEPS,
  summarizeRentStatus,
  type GateState,
  type RentStatusScanResult,
} from "./rent-status";
import { createMcpServer, type Scans } from "./server";

const gate = (
  i: number,
  activationSlot: bigint | null,
  scheduled = activationSlot !== null,
): GateState => ({
  featureId: RENT_REDUCTION_STEPS[i]!.featureId,
  scheduled,
  activationSlot,
  activationBlockTime: activationSlot === null ? null : 1_788_000_000 + i,
});

// Steps 1 and 2 live, as on mainnet in late October 2026.
const twoLive: RentStatusScanResult = {
  slot: 450_000_000n,
  epoch: 1041n,
  slotsLeftInEpoch: 216_000n,
  tokenAccountRentLamports: 1_488_440n,
  gates: [
    gate(0, 444_096_000n),
    gate(1, 446_256_000n),
    gate(2, null),
    gate(3, null),
    gate(4, null),
  ],
};

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

describe("summarizeRentStatus", () => {
  it("reports live steps, the live rent and the excess of an old account", () => {
    const result = summarizeRentStatus(
      twoLive,
      new Date("2026-10-26T12:00:00Z"),
    );
    expect(result).toMatchObject({
      latestActiveStep: 2,
      moreReductionPending: true,
      current: {
        lamportsPerByte: 5080,
        reductionPercent: 27,
        tokenAccountRentLamports: "1488440",
        tokenAccountRentSol: "0.001488440",
      },
      legacyTokenAccount: {
        depositLamports: "2039280",
        excessNowLamports: "550840",
        excessAfterAllStepsLamports: "1835352",
      },
      nextStep: {
        step: 3,
        status: "not-scheduled",
        earliestActivationDate: "2026-11-09",
      },
      reclaimUrl: "https://reclaim.blastctrl.com",
    });
    expect(result.steps.map((s) => s.status)).toEqual([
      "active",
      "active",
      "not-scheduled",
      "not-scheduled",
      "not-scheduled",
    ]);
    expect(result.steps[0]).toMatchObject({
      activationSlot: "444096000",
      activatedAt: new Date(1_788_000_000_000).toISOString(),
    });
    expect(result.steps.map((s) => s.reductionPercent)).toEqual([
      9, 27, 63, 81, 90,
    ]);
    expect(result.suggestion).toContain("after 2026-11-09");
    expect(result.suggestion).toContain("https://reclaim.blastctrl.com");
    expect(result.notes.join(" ")).toContain("no earlier than 2026-11-09");
  });

  it("estimates when a scheduled step activates", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const result = summarizeRentStatus(
      {
        ...twoLive,
        gates: [
          ...twoLive.gates.slice(0, 2),
          gate(2, null, true),
          ...twoLive.gates.slice(3),
        ],
      },
      now,
    );
    expect(result.steps[2]).toMatchObject({
      status: "scheduled",
      expectedActivationAt: new Date(
        now.getTime() + 216_000 * 400,
      ).toISOString(),
    });
    expect(result.nextStep).toMatchObject({ step: 3, status: "scheduled" });
    expect(result.suggestion).not.toContain("after 2026-11-09");
  });

  it("points to the reclaim app once every step is live", () => {
    const result = summarizeRentStatus({
      ...twoLive,
      tokenAccountRentLamports: 293n * 696n,
      gates: RENT_REDUCTION_STEPS.map((_, i) =>
        gate(i, 444_096_000n + BigInt(i)),
      ),
    });
    expect(result.latestActiveStep).toBe(5);
    expect(result.moreReductionPending).toBe(false);
    expect(result.nextStep).toBeUndefined();
    expect(result.suggestion).toContain("All five");
  });

  it("flags a live rate that doesn't match the latest step", () => {
    const result = summarizeRentStatus({
      ...twoLive,
      tokenAccountRentLamports: 1_855_569n,
    });
    expect(result.notes.join(" ")).toContain("differs from the published rate");
  });
});

describe("cacheRentStatus", () => {
  it("shares one read within the window and reads again after it", async () => {
    let time = 0;
    const read = vi.fn().mockResolvedValue(twoLive);
    const scan = cacheRentStatus(read, { ttlMs: 1000, now: () => time });
    const signal = new AbortController().signal;
    await Promise.all([scan(signal), scan(signal)]);
    expect(read).toHaveBeenCalledTimes(1);
    time = 1000;
    await scan(signal);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed read instead of caching the error", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("rpc down"))
      .mockResolvedValue(twoLive);
    const scan = cacheRentStatus(read);
    const signal = new AbortController().signal;
    await expect(scan(signal)).rejects.toThrow("rpc down");
    await expect(scan(signal)).resolves.toBe(twoLive);
  });

  it("lets a caller stop waiting without cancelling the shared read", async () => {
    let finish!: (value: RentStatusScanResult) => void;
    const read = vi.fn(
      () => new Promise<RentStatusScanResult>((r) => (finish = r)),
    );
    const scan = cacheRentStatus(read);
    const controller = new AbortController();
    const first = scan(controller.signal);
    controller.abort();
    await expect(first).rejects.toThrow();
    const second = scan(new AbortController().signal);
    finish(twoLive);
    await expect(second).resolves.toBe(twoLive);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("check_rent_reduction_status", () => {
  async function call(rentStatus: Scans["rentStatus"]) {
    const server = createMcpServer({
      serviceFeeBasisPoints: 0,
      scans: {
        rent: async () => [],
        delegations: async () => ({ accounts: [], mintDecimals: {} }),
        nested: async () => ({ parentCount: 0, pairs: [], mintDecimals: {} }),
        rentStatus,
      },
    });
    const client = new Client({ name: "rent-status", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      return await client.callTool({
        name: "check_rent_reduction_status",
        arguments: {},
      });
    } finally {
      await client.close();
    }
  }

  it("returns the status and a text summary with the suggestion", async () => {
    const result = await call(async () => twoLive);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      latestActiveStep: 2,
      moreReductionPending: true,
    });
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("step 1 (9% lower");
    expect(text).toContain("0.001488440 SOL");
    expect(text).toContain("https://reclaim.blastctrl.com");
  });

  it("hides RPC errors", async () => {
    const result = await call(async () => {
      throw new Error("https://rpc.example/?api-key=SECRET");
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).toContain("No status was returned");
  });
});
