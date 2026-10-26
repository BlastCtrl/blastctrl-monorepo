import { TOKEN_2022_PROGRAM_ADDRESS } from "@blastctrl/kit-extensions";
import {
  AccountState,
  findAssociatedTokenPda,
  getTokenEncoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getAddressDecoder, getBase64Decoder, type Address } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";
import { fetchDelegatedTokenAccounts } from "./delegations";
import {
  fetchTokenAccountsByOwner,
  filterAssociatedTokenAccounts,
  findNestedAta,
} from "./nested";

const key = (value: number): Address =>
  getAddressDecoder().decode(new Uint8Array(32).fill(value));
const wallet = key(1);

/** A token account as `getTokenAccountsByOwner` returns it in base64. */
function rpcToken(
  pubkey: Address,
  {
    mint,
    owner,
    program = TOKEN_PROGRAM_ADDRESS,
    delegate = null,
    amount = 10n,
    delegatedAmount = 0n,
    state = AccountState.Initialized,
  }: {
    mint: Address;
    owner: Address;
    program?: Address;
    delegate?: Address | null;
    amount?: bigint;
    delegatedAmount?: bigint;
    state?: AccountState;
  },
) {
  const data = getTokenEncoder().encode({
    mint,
    owner,
    amount,
    delegate,
    state,
    isNative: null,
    delegatedAmount,
    closeAuthority: null,
  });
  return {
    pubkey,
    account: {
      data: [getBase64Decoder().decode(data), "base64"] as const,
      executable: false,
      lamports: 2_039_280n,
      owner: program,
      space: BigInt(data.length),
    },
  };
}

type RpcToken = ReturnType<typeof rpcToken>;

/** Kit's RPC shape: each method returns a request whose `send` resolves. */
function fakeRpc(
  byOwner: Record<string, RpcToken[]>,
  programAccounts: RpcToken[] = [],
) {
  const sends: (AbortSignal | undefined)[] = [];
  const request = <T>(value: T) => ({
    send: async (config?: { abortSignal?: AbortSignal }) => {
      sends.push(config?.abortSignal);
      return value;
    },
  });
  const calls = {
    getProgramAccounts: vi.fn((...args: [Address, unknown]) => {
      void args;
      return request(programAccounts);
    }),
    getTokenAccountsByOwner: vi.fn(
      (owner: Address, filter: { programId: Address }) =>
        request({
          context: { slot: 1n },
          value: (byOwner[owner] ?? []).filter(
            (t) => t.account.owner === filter.programId,
          ),
        }),
    ),
  };
  return { rpc: calls as any, calls, sends };
}

describe("fetchDelegatedTokenAccounts", () => {
  it("filters Token accounts on the RPC and Token-2022 accounts after decoding", async () => {
    const signal = new AbortController().signal;
    const { rpc, calls, sends } = fakeRpc(
      {
        [wallet]: [
          rpcToken(key(30), {
            mint: key(20),
            owner: wallet,
            program: TOKEN_2022_PROGRAM_ADDRESS,
            delegate: key(40),
            delegatedAmount: 5n,
          }),
          rpcToken(key(31), {
            mint: key(21),
            owner: wallet,
            program: TOKEN_2022_PROGRAM_ADDRESS,
          }),
        ],
      },
      [
        rpcToken(key(32), {
          mint: key(22),
          owner: wallet,
          delegate: key(41),
          delegatedAmount: 7n,
          state: AccountState.Frozen,
        }),
      ],
    );
    expect(
      await fetchDelegatedTokenAccounts(rpc, wallet, { abortSignal: signal }),
    ).toEqual([
      {
        token_account: key(32),
        mint: key(22),
        balance: 10n,
        isFrozen: true,
        token_program: TOKEN_PROGRAM_ADDRESS,
        delegate: key(41),
        delegated_amount: 7n,
      },
      {
        token_account: key(30),
        mint: key(20),
        balance: 10n,
        isFrozen: false,
        token_program: TOKEN_2022_PROGRAM_ADDRESS,
        delegate: key(40),
        delegated_amount: 5n,
      },
    ]);
    expect(calls.getProgramAccounts).toHaveBeenCalledWith(
      TOKEN_PROGRAM_ADDRESS,
      {
        encoding: "base64",
        filters: [
          { dataSize: 165n },
          { memcmp: { offset: 32n, bytes: wallet, encoding: "base58" } },
          { memcmp: { offset: 72n, bytes: "AQAAAA==", encoding: "base64" } },
        ],
      },
    );
    expect(calls.getTokenAccountsByOwner).toHaveBeenCalledWith(
      wallet,
      { programId: TOKEN_2022_PROGRAM_ADDRESS },
      { encoding: "base64" },
    );
    expect(sends).toEqual([signal, signal]);
  });
});

describe("nested accounts", () => {
  it("finds the wallet's ATAs and the accounts they own, and tells which can be recovered", async () => {
    const [parentAta] = await findAssociatedTokenPda({
      owner: wallet,
      mint: key(20),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [nestedAta] = await findAssociatedTokenPda({
      owner: parentAta,
      mint: key(21),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [nested2022Ata] = await findAssociatedTokenPda({
      owner: parentAta,
      mint: key(22),
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    const { rpc } = fakeRpc({
      [wallet]: [
        rpcToken(parentAta, { mint: key(20), owner: wallet }),
        // Not an ATA of the wallet: not searched.
        rpcToken(key(50), { mint: key(23), owner: wallet }),
      ],
      [parentAta]: [
        rpcToken(nestedAta, { mint: key(21), owner: parentAta }),
        // Owned by the ATA but not its ATA: found, not recoverable.
        rpcToken(key(51), { mint: key(21), owner: parentAta }),
        // Another token program than the parent: not recoverable.
        rpcToken(nested2022Ata, {
          mint: key(22),
          owner: parentAta,
          program: TOKEN_2022_PROGRAM_ADDRESS,
        }),
      ],
      [key(50)]: [rpcToken(key(52), { mint: key(21), owner: key(50) })],
    });

    const parents = await filterAssociatedTokenAccounts(
      await fetchTokenAccountsByOwner(rpc, wallet),
      wallet,
    );
    expect(parents.map((p) => p.address)).toEqual([parentAta]);
    const pairs = await findNestedAta({
      rpc,
      walletAccounts: parents,
      delayMs: 0,
    });
    expect(
      pairs.map((p) => [p.parent.address, p.nested.address, p.recoverable]),
    ).toEqual([
      [parentAta, nestedAta, true],
      [parentAta, key(51), false],
      [parentAta, nested2022Ata, false],
    ]);
    expect(pairs[0]!.nested.data.amount).toBe(10n);
  });

  it("checks ATAs in groups, keeps their order, and pauses between groups", async () => {
    const parents = await fetchTokenAccountsByOwner(
      fakeRpc({
        [wallet]: [1, 2, 3].map((i) =>
          rpcToken(key(60 + i), { mint: key(i), owner: wallet }),
        ),
      }).rpc,
      wallet,
    );
    const { rpc, calls } = fakeRpc({});
    const log: string[] = [];
    calls.getTokenAccountsByOwner.mockImplementation(
      (owner: Address, filter: { programId: Address }) => {
        const i = parents.findIndex((p) => p.address === owner);
        if (filter.programId === TOKEN_PROGRAM_ADDRESS) log.push(`fetch ${i}`);
        return {
          send: async () => ({
            context: { slot: 1n },
            value:
              filter.programId === TOKEN_PROGRAM_ADDRESS
                ? [rpcToken(key(70 + i), { mint: key(9), owner })]
                : [],
          }),
        };
      },
    );
    const started = Date.now();
    const pairs = await findNestedAta({
      rpc,
      walletAccounts: parents,
      concurrency: 2,
      delayMs: 30,
      onProgress: (i) => log.push(`progress ${i}`),
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
    expect(log).toEqual([
      "fetch 0",
      "fetch 1",
      "progress 0",
      "progress 1",
      "fetch 2",
      "progress 2",
    ]);
    expect(pairs.map((p) => p.nested.address)).toEqual([
      key(70),
      key(71),
      key(72),
    ]);
  });

  it("stops at the pause when aborted", async () => {
    const parents = await fetchTokenAccountsByOwner(
      fakeRpc({
        [wallet]: [rpcToken(key(61), { mint: key(1), owner: wallet })],
      }).rpc,
      wallet,
    );
    const controller = new AbortController();
    const done = findNestedAta({
      rpc: fakeRpc({}).rpc,
      walletAccounts: parents,
      delayMs: 60_000,
      abortSignal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error("deadline")), 5);
    await expect(done).rejects.toThrow("deadline");
  });
});
