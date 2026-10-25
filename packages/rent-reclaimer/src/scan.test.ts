import { TOKEN_2022_PROGRAM_ADDRESS } from "@blastctrl/kit-extensions";
import { getMintEncoder, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getAddressDecoder, getBase64Decoder, type Address } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";
import {
  discoverReclaimableAccounts,
  lookupReclaimableMint,
  ScanLimitError,
  type ScanRpc,
} from "./scan";

const key = (value: number): Address =>
  getAddressDecoder().decode(new Uint8Array(32).fill(value));
const owner = key(1);

function token(id: number, mint: number, space = 165, extra = {}) {
  return {
    pubkey: key(id),
    account: {
      executable: false,
      owner: TOKEN_PROGRAM_ADDRESS,
      lamports: 2_039_280n,
      space: BigInt(space),
      data: {
        program: "spl-token",
        space: BigInt(space),
        parsed: {
          type: "account",
          info: {
            mint: key(mint),
            owner,
            isNative: false,
            state: "initialized",
            tokenAmount: { amount: "0", uiAmountString: "0" },
            ...extra,
          },
        },
      },
    },
  };
}

/** A mint as `getMultipleAccounts` / `getAccountInfo` return it in base64. */
function mint(
  authority: Address | null,
  programAddress: Address = TOKEN_PROGRAM_ADDRESS,
) {
  const data = getMintEncoder().encode({
    mintAuthority: authority,
    supply: 0n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: null,
  });
  return {
    data: [getBase64Decoder().decode(data), "base64"],
    executable: false,
    lamports: 1_461_600n,
    owner: programAddress,
    space: BigInt(data.length),
  };
}

type RpcAccount = ReturnType<typeof mint> | null;

/** Kit's RPC shape: each method returns a request whose `send` resolves. */
function fixture() {
  const calls = {
    getTokenAccountsByOwner: vi.fn(
      (_owner: Address, filter: { programId: Address }) =>
        filter.programId === TOKEN_PROGRAM_ADDRESS
          ? [token(10, 20), token(11, 20)]
          : [
              token(12, 21, 200, {
                extensions: [
                  {
                    extension: "transferFeeAmount",
                    state: { withheldAmount: "1" },
                  },
                ],
              }),
            ],
    ),
    getMultipleAccounts: vi.fn<(addresses: Address[]) => RpcAccount[]>(() => [
      mint(owner),
      mint(owner, TOKEN_2022_PROGRAM_ADDRESS),
    ]),
    getMinimumBalanceForRentExemption: vi.fn(
      (size: bigint) => (size + 128n) * 5080n,
    ),
    getAccountInfo: vi.fn<(address: Address) => RpcAccount>(() => mint(owner)),
  };
  const signals: (AbortSignal | undefined)[] = [];
  const request = <T>(value: () => T) => ({
    send: async (options?: { abortSignal?: AbortSignal }) => {
      signals.push(options?.abortSignal);
      return value();
    },
  });
  const rpc = {
    getTokenAccountsByOwner: (owner: Address, filter: { programId: Address }) =>
      request(() => ({
        context: { slot: 1n },
        value: calls.getTokenAccountsByOwner(owner, filter),
      })),
    getMultipleAccounts: (addresses: Address[]) =>
      request(() => ({
        context: { slot: 1n },
        value: calls.getMultipleAccounts(addresses),
      })),
    getMinimumBalanceForRentExemption: (size: bigint) =>
      request(() => calls.getMinimumBalanceForRentExemption(size)),
    getAccountInfo: (address: Address) =>
      request(() => ({
        context: { slot: 1n },
        value: calls.getAccountInfo(address),
      })),
  } as unknown as ScanRpc;
  return { rpc, calls, signals };
}

describe("discoverReclaimableAccounts", () => {
  it("scans both programs, deduplicates referenced mints, and gets live minima for each size", async () => {
    const { rpc, calls } = fixture();
    const accounts = await discoverReclaimableAccounts(rpc, owner);
    expect(accounts.map((a) => [a.kind, a.program, a.minimum])).toEqual([
      ["token-account", "token", 1_488_440],
      ["token-account", "token", 1_488_440],
      ["token-account", "token-2022", 1_666_240],
      ["mint", "token", 1_066_800],
      ["mint", "token-2022", 1_066_800],
    ]);
    expect(accounts[2]!.keepOpenReason).toBe(
      "Withheld transfer fees keep it open",
    );
    expect(accounts[3]).toMatchObject({
      id: `mint-${key(20)}`,
      address: key(20),
      lamports: 1_461_600,
      dataLength: 82,
    });
    expect(calls.getMultipleAccounts.mock.calls[0]![0]).toEqual([
      key(20),
      key(21),
    ]);
    expect(
      calls.getMinimumBalanceForRentExemption.mock.calls
        .map(([size]) => Number(size))
        .sort((a, b) => a - b),
    ).toEqual([82, 165, 200]);
  });

  it("excludes mints without the owner's authority and flags wrapped SOL", async () => {
    const { rpc, calls } = fixture();
    calls.getMultipleAccounts.mockReturnValue([mint(null), mint(key(2))]);
    calls.getTokenAccountsByOwner.mockReturnValue([
      token(10, 20, 165, { isNative: true }),
    ]);
    const accounts = await discoverReclaimableAccounts(rpc, owner);
    expect(accounts).toHaveLength(2);
    expect(
      accounts.every((a) => a.kind === "token-account" && !!a.blockedReason),
    ).toBe(true);
  });

  it("returns an empty successful scan without unnecessary rent or mint calls", async () => {
    const { rpc, calls } = fixture();
    calls.getTokenAccountsByOwner.mockReturnValue([]);
    expect(await discoverReclaimableAccounts(rpc, owner)).toEqual([]);
    expect(calls.getMultipleAccounts).not.toHaveBeenCalled();
    expect(calls.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  });

  it("fails the whole scan when one program or rent lookup fails", async () => {
    const { rpc, calls } = fixture();
    calls.getTokenAccountsByOwner.mockImplementationOnce(() => {
      throw new Error("RPC unavailable");
    });
    await expect(discoverReclaimableAccounts(rpc, owner)).rejects.toThrow(
      "RPC unavailable",
    );
    calls.getMinimumBalanceForRentExemption.mockImplementationOnce(() => {
      throw new Error("Rent unavailable");
    });
    await expect(discoverReclaimableAccounts(rpc, owner)).rejects.toThrow(
      "Rent unavailable",
    );
  });

  it("rejects an oversized scan before mint and rent requests", async () => {
    const { rpc, calls } = fixture();
    await expect(
      discoverReclaimableAccounts(rpc, owner, { maxAccounts: 2 }),
    ).rejects.toBeInstanceOf(ScanLimitError);
    expect(calls.getMultipleAccounts).not.toHaveBeenCalled();
    expect(calls.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  });

  it("passes the abort signal to every request", async () => {
    const { rpc, signals } = fixture();
    const abortSignal = new AbortController().signal;
    await discoverReclaimableAccounts(rpc, owner, { abortSignal });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s === abortSignal)).toBe(true);
  });
});

describe("lookupReclaimableMint", () => {
  it("keeps the outcomes the mint paste box shows", async () => {
    const { rpc, calls } = fixture();
    const lookup = () => lookupReclaimableMint(rpc, key(20), owner);
    expect(await lookup()).toMatchObject({
      status: "ok",
      account: { kind: "mint", minimum: 1_066_800 },
    });
    calls.getAccountInfo.mockReturnValueOnce(null);
    expect(await lookup()).toEqual({ status: "not-found" });
    calls.getAccountInfo.mockReturnValueOnce(mint(null));
    expect(await lookup()).toEqual({ status: "no-authority" });
    calls.getAccountInfo.mockReturnValueOnce(mint(key(2)));
    expect(await lookup()).toEqual({
      status: "other-authority",
      authority: key(2),
    });
    calls.getAccountInfo.mockReturnValueOnce(mint(owner, key(5)));
    expect(await lookup()).toEqual({ status: "not-a-mint" });
  });
});
