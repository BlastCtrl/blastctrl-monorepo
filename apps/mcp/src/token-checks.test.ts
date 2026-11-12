import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  NestedPair,
  ParsedDelegatedTokenAccount,
  TokenAccount,
} from "@blastctrl/token-scans";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRpcDelegationScan,
  REVOKE_URL,
  summarizeDelegations,
} from "./delegations";
import { formatTokenAmount } from "./mints";
import {
  NestedScanLimitError,
  RECOVER_NESTED_URL,
  summarizeNested,
} from "./nested";
import { createMcpServer, type Scans } from "./server";

const owner = "11111111111111111111111111111111";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const delegated = (
  overrides: Partial<ParsedDelegatedTokenAccount> = {},
): ParsedDelegatedTokenAccount => ({
  token_account: "acc",
  mint: "mint",
  balance: 1_500_000n,
  isFrozen: false,
  token_program: TOKEN_PROGRAM_ADDRESS,
  delegate: "delegate",
  delegated_amount: 500_000n,
  ...overrides,
});

const tokenAccount = (
  address: string,
  mint: string,
  { program = TOKEN_PROGRAM_ADDRESS, amount = 0n, lamports = 2_039_280n } = {},
) =>
  ({
    address,
    programAddress: program,
    lamports,
    executable: false,
    space: 165n,
    data: { mint, amount },
  }) as unknown as TokenAccount;

const pair = (nested: string, recoverable: boolean, lamports?: bigint) =>
  ({
    parent: tokenAccount("parent", "parentMint"),
    nested: tokenAccount(nested, "nestedMint", { amount: 42n, lamports }),
    recoverable,
  }) satisfies NestedPair;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function connect(scans: Partial<Scans>) {
  const server = createMcpServer({
    serviceFeeBasisPoints: 0,
    scans: {
      rent: async () => [],
      delegations: async () => ({ accounts: [], mintDecimals: {} }),
      nested: async () => ({ parentCount: 0, pairs: [], mintDecimals: {} }),
      rentStatus: async () => {
        throw new Error("not used");
      },
      ...scans,
    },
  });
  const client = new Client({ name: "token-checks", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanups.push(
    () => server.close(),
    () => client.close(),
  );
  return client;
}

describe("check_token_delegations", () => {
  it("lists delegated accounts with whole-token amounts and the revoke link", async () => {
    const client = await connect({
      delegations: async () => ({
        accounts: [
          delegated(),
          delegated({
            token_account: "acc2",
            mint: "unknown",
            token_program: TOKEN_2022,
            delegated_amount: 2n ** 64n - 1n,
            isFrozen: true,
          }),
        ],
        mintDecimals: { mint: 6 },
      }),
    });
    const result = await client.callTool({
      name: "check_token_delegations",
      arguments: { address: owner },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      address: owner,
      delegatedAccountCount: 2,
      accounts: [
        {
          tokenAccount: "acc",
          program: "token",
          delegate: "delegate",
          delegatedAmount: { raw: "500000", amount: "0.5" },
          balance: { raw: "1500000", amount: "1.5" },
          unlimited: false,
          coversWholeBalance: false,
          frozen: false,
        },
        {
          tokenAccount: "acc2",
          program: "token-2022",
          delegatedAmount: { raw: "18446744073709551615" },
          unlimited: true,
          coversWholeBalance: true,
          frozen: true,
        },
      ],
      accountsTruncated: false,
      revokeUrl: REVOKE_URL,
    });
    expect(JSON.stringify(result.content)).toContain(REVOKE_URL);
  });

  it("says when nothing is delegated and hides RPC errors", async () => {
    const scan = vi
      .fn<Scans["delegations"]>()
      .mockResolvedValueOnce({ accounts: [], mintDecimals: {} })
      .mockRejectedValueOnce(new Error("https://rpc.example/?api-key=SECRET"));
    const client = await connect({ delegations: scan });
    const empty = await client.callTool({
      name: "check_token_delegations",
      arguments: { address: owner },
    });
    expect(JSON.stringify(empty.content)).toContain(
      "No token accounts with an active delegate",
    );
    const failure = await client.callTool({
      name: "check_token_delegations",
      arguments: { address: owner },
    });
    expect(failure.isError).toBe(true);
    expect(JSON.stringify(failure)).not.toContain("SECRET");
    expect(JSON.stringify(failure)).toContain("No result was returned");
  });

  it("limits the listed accounts without changing the count", () => {
    const result = summarizeDelegations(owner, {
      accounts: Array.from({ length: 25 }, (_, i) =>
        delegated({ token_account: String(i) }),
      ),
      mintDecimals: {},
    });
    expect(result.accounts).toHaveLength(20);
    expect(result.accountsTruncated).toBe(true);
    expect(result.delegatedAccountCount).toBe(25);
  });

  it("reads both token programs and only the listed mints, under the deadline signal", async () => {
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options: RequestInit) => {
        expect(options.signal).toBeInstanceOf(AbortSignal);
        const request = JSON.parse(options.body as string) as {
          id: string;
          method: string;
        };
        methods.push(request.method);
        const result =
          request.method === "getProgramAccounts"
            ? []
            : { context: { slot: 1 }, value: [] };
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
          { status: 200 },
        );
      }),
    );
    expect(
      await createRpcDelegationScan("https://rpc.example")(
        owner,
        new AbortController().signal,
      ),
    ).toEqual({ accounts: [], mintDecimals: {} });
    expect(methods.sort()).toEqual([
      "getProgramAccounts",
      "getTokenAccountsByOwner",
    ]);
  });
});

describe("check_nested_token_accounts", () => {
  it("puts recoverable accounts first and totals their rent", async () => {
    const client = await connect({
      nested: async () => ({
        parentCount: 3,
        pairs: [pair("stuck", false), pair("ata", true, 2_000_000_000n)],
        mintDecimals: { nestedMint: 1 },
      }),
    });
    const result = await client.callTool({
      name: "check_nested_token_accounts",
      arguments: { address: owner },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      checkedAssociatedTokenAccountCount: 3,
      nestedAccountCount: 2,
      recoverableAccountCount: 1,
      recoverableRentLamports: "2000000000",
      recoverableRentSol: "2.000000000",
      accounts: [
        {
          nestedAccount: "ata",
          parentAccount: "parent",
          program: "token",
          tokenBalance: { raw: "42", amount: "4.2" },
          rentLamports: "2000000000",
          recoverable: true,
        },
        { nestedAccount: "stuck", recoverable: false },
      ],
      recoverUrl: RECOVER_NESTED_URL,
    });
    expect(JSON.stringify(result.content)).toContain(RECOVER_NESTED_URL);
  });

  it("reports an empty search and the parent limit as such", async () => {
    const scan = vi
      .fn<Scans["nested"]>()
      .mockResolvedValueOnce({ parentCount: 4, pairs: [], mintDecimals: {} })
      .mockRejectedValueOnce(new NestedScanLimitError());
    const client = await connect({ nested: scan });
    const empty = await client.callTool({
      name: "check_nested_token_accounts",
      arguments: { address: owner },
    });
    expect(JSON.stringify(empty.content)).toContain(
      "No nested token accounts were found under its 4 associated token accounts",
    );
    const limited = await client.callTool({
      name: "check_nested_token_accounts",
      arguments: { address: owner },
    });
    expect(limited.isError).toBe(true);
    expect(JSON.stringify(limited)).toContain(
      "more than 500 associated token accounts",
    );
  });

  it("limits the listed accounts without changing the totals", () => {
    const result = summarizeNested(owner, {
      parentCount: 1,
      pairs: Array.from({ length: 25 }, (_, i) => pair(String(i), true)),
      mintDecimals: {},
    });
    expect(result.accounts).toHaveLength(20);
    expect(result.accountsTruncated).toBe(true);
    expect(result.recoverableAccountCount).toBe(25);
    expect(result.recoverableRentLamports).toBe(String(25n * 2_039_280n));
  });
});

it("formats raw token amounts exactly", () => {
  expect(formatTokenAmount(0n, 6)).toBe("0");
  expect(formatTokenAmount(5n, 6)).toBe("0.000005");
  expect(formatTokenAmount(1_230_000n, 6)).toBe("1.23");
  expect(formatTokenAmount(7n, 0)).toBe("7");
  expect(formatTokenAmount(2n ** 64n - 1n, 9)).toBe("18446744073.709551615");
});
