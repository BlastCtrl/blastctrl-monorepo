import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type { AccountInfo } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  discoverReclaimableAccounts,
  lookupReclaimableMint,
  ScanLimitError,
} from "./discovery.js";
import type { DiscoveryConnection } from "./discovery.js";

const key = (value: number) => new PublicKey(new Uint8Array(32).fill(value));
const owner = key(1).toBase58();

function token(id: number, mint: number, space = 165, extra = {}) {
  return {
    pubkey: key(id),
    account: {
      executable: false,
      owner: TOKEN_PROGRAM_ID,
      lamports: 2_039_280,
      rentEpoch: 0,
      data: {
        program: "spl-token",
        space,
        parsed: {
          type: "account",
          info: {
            mint: key(mint).toBase58(),
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

function mint(
  authority: PublicKey | null,
  program = TOKEN_PROGRAM_ID,
): AccountInfo<Buffer> {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: authority ? 1 : 0,
      mintAuthority: authority ?? key(0),
      supply: 0n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: key(0),
    },
    data,
  );
  return {
    data,
    owner: program,
    lamports: 1_461_600,
    executable: false,
    rentEpoch: 0,
  };
}

function fixture() {
  const rpc = {
    getParsedTokenAccountsByOwner:
      vi.fn<DiscoveryConnection["getParsedTokenAccountsByOwner"]>(),
    getMultipleAccountsInfo:
      vi.fn<DiscoveryConnection["getMultipleAccountsInfo"]>(),
    getMinimumBalanceForRentExemption:
      vi.fn<DiscoveryConnection["getMinimumBalanceForRentExemption"]>(),
    getAccountInfo: vi.fn<DiscoveryConnection["getAccountInfo"]>(),
  };
  rpc.getParsedTokenAccountsByOwner.mockImplementation(async (_, filter) => ({
    context: { slot: 123 },
    value:
      "programId" in filter && filter.programId.equals(TOKEN_PROGRAM_ID)
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
  }));
  rpc.getMultipleAccountsInfo.mockResolvedValue([
    mint(key(1)),
    mint(key(1), TOKEN_2022_PROGRAM_ID),
  ]);
  rpc.getMinimumBalanceForRentExemption.mockImplementation(
    async (size) => (size + 128) * 5080,
  );
  rpc.getAccountInfo.mockResolvedValue(mint(key(1)));
  return rpc;
}

describe("existing account discovery extracted from the web hook", () => {
  it("scans both programs, deduplicates referenced mints, and gets live minima for each size", async () => {
    const rpc = fixture();
    const accounts = await discoverReclaimableAccounts(rpc, owner);
    expect(accounts).toHaveLength(5);
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
    expect(
      rpc.getMultipleAccountsInfo.mock.calls[0]![0].map((k) => k.toBase58()),
    ).toEqual([key(20).toBase58(), key(21).toBase58()]);
    expect(
      rpc.getMinimumBalanceForRentExemption.mock.calls
        .map(([size]) => size)
        .sort(),
    ).toEqual([165, 200, 82]);
  });

  it("excludes mints without the owner's authority and flags wrapped SOL", async () => {
    const rpc = fixture();
    rpc.getMultipleAccountsInfo.mockResolvedValue([mint(null), mint(key(2))]);
    rpc.getParsedTokenAccountsByOwner.mockResolvedValue({
      context: { slot: 1 },
      value: [token(10, 20, 165, { isNative: true })],
    });
    const accounts = await discoverReclaimableAccounts(rpc, owner);
    expect(
      accounts.every((a) => a.kind === "token-account" && !!a.blockedReason),
    ).toBe(true);
  });

  it("returns an empty successful scan without unnecessary rent or mint calls", async () => {
    const rpc = fixture();
    rpc.getParsedTokenAccountsByOwner.mockResolvedValue({
      context: { slot: 1 },
      value: [],
    });
    expect(await discoverReclaimableAccounts(rpc, owner)).toEqual([]);
    expect(rpc.getMultipleAccountsInfo).not.toHaveBeenCalled();
    expect(rpc.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  });

  it("fails the whole scan when one program or rent lookup fails", async () => {
    const rpc = fixture();
    rpc.getParsedTokenAccountsByOwner.mockRejectedValueOnce(
      new Error("RPC unavailable"),
    );
    await expect(discoverReclaimableAccounts(rpc, owner)).rejects.toThrow(
      "RPC unavailable",
    );
    rpc.getMinimumBalanceForRentExemption.mockRejectedValueOnce(
      new Error("Rent unavailable"),
    );
    await expect(discoverReclaimableAccounts(rpc, owner)).rejects.toThrow(
      "Rent unavailable",
    );
  });

  it("rejects an oversized scan before mint and rent requests", async () => {
    const rpc = fixture();
    await expect(
      discoverReclaimableAccounts(rpc, owner, { maxAccounts: 2 }),
    ).rejects.toBeInstanceOf(ScanLimitError);
    expect(rpc.getMultipleAccountsInfo).not.toHaveBeenCalled();
    expect(rpc.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  });

  it("retains the manual mint lookup outcomes used by the web UI", async () => {
    const rpc = fixture();
    const lookup = () => lookupReclaimableMint(rpc, key(20).toBase58(), owner);
    expect(await lookup()).toMatchObject({
      status: "ok",
      account: { minimum: 1_066_800 },
    });
    rpc.getAccountInfo.mockResolvedValueOnce(null);
    expect(await lookup()).toEqual({ status: "not-found" });
    rpc.getAccountInfo.mockResolvedValueOnce(mint(null));
    expect(await lookup()).toMatchObject({ status: "no-authority" });
    rpc.getAccountInfo.mockResolvedValueOnce(mint(key(2)));
    expect(await lookup()).toMatchObject({
      status: "other-authority",
      authority: key(2).toBase58(),
    });
    rpc.getAccountInfo.mockResolvedValueOnce({
      ...mint(key(1)),
      owner: key(5),
    });
    expect(await lookup()).toEqual({ status: "not-a-mint" });
  });
});
