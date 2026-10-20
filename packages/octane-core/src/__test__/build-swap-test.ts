import { getTransferSolInstructionDataDecoder } from "@solana-program/system";
import {
  getBurnInstructionDataDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  decompileTransactionMessage,
  generateKeyPairSigner,
  getAddressDecoder,
  getCompiledTransactionMessageDecoder,
  type Address,
  type Blockhash,
} from "@solana/kit";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  BONK_MINT,
  buildJupiterSwapToSOL,
  LAMPORTS_PER_TOKEN_ACCOUNT,
  type SwapRpc,
} from "../build-swap-to-sol";
import type { JupiterApiInstruction } from "../jupiter";
import { WSOL_MINT } from "../jupiter";

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const COMPUTE_BUDGET = address("ComputeBudget111111111111111111111111111111");
const JUPITER = address("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const LOOKUP_TABLE_PROGRAM = address(
  "AddressLookupTab1e1111111111111111111111111",
);

const user = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const usdc = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const table = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
let counter = 0;
const fresh = (): Address =>
  getAddressDecoder().decode(new Uint8Array(32).fill(++counter));
/** Accounts the swap reaches through the lookup table. */
const pools = [fresh(), fresh(), fresh()];

const TRANSACTION_FEE = 15_000n;
const fees = { platformSolFeeBps: 100, bonkBurnFeeBps: 250 };

const apiInstruction = (
  programId: Address,
  accounts: { pubkey: Address; isSigner?: boolean; isWritable?: boolean }[],
  data: number[],
): JupiterApiInstruction => ({
  programId,
  accounts: accounts.map((a) => ({
    pubkey: a.pubkey,
    isSigner: a.isSigner ?? false,
    isWritable: a.isWritable ?? false,
  })),
  data: Buffer.from(data).toString("base64"),
});

/** What Jupiter answers; records what it was asked. */
const jupiter = { quoteAmount: "", outAmount: "123456789" };
const fakeFetch = async (input: string | URL, init?: RequestInit) => {
  const url = new URL(input.toString());
  if (url.pathname.endsWith("/quote")) {
    jupiter.quoteAmount = url.searchParams.get("amount") ?? "";
    return Response.json({
      inputMint: url.searchParams.get("inputMint"),
      inAmount: jupiter.quoteAmount,
      outputMint: WSOL_MINT,
      outAmount: jupiter.outAmount,
      otherAmountThreshold: "0",
      swapMode: "ExactIn",
      slippageBps: Number(url.searchParams.get("slippageBps")),
      priceImpactPct: "0",
      routePlan: [],
    });
  }
  assert.equal(JSON.parse(init!.body as string).userPublicKey, user);
  return Response.json({
    computeBudgetInstructions: [
      apiInstruction(COMPUTE_BUDGET, [], [2, 0, 0, 0, 0]),
      apiInstruction(COMPUTE_BUDGET, [], [3, 0, 0, 0, 0, 0, 0, 0, 0]),
    ],
    setupInstructions: [],
    otherInstructions: [],
    swapInstruction: apiInstruction(
      JUPITER,
      [
        { pubkey: user, isSigner: true, isWritable: true },
        ...pools.map((pubkey) => ({ pubkey, isWritable: true })),
      ],
      [1, 2, 3],
    ),
    addressLookupTableAddresses: [table],
  });
};

const rpc = {
  getLatestBlockhash: () => ({
    send: async () => ({
      context: { slot: 1n },
      value: {
        blockhash: "11111111111111111111111111111111" as Blockhash,
        lastValidBlockHeight: 10n,
      },
    }),
  }),
  getFeeForMessage: () => ({
    send: async () => ({ context: { slot: 1n }, value: TRANSACTION_FEE }),
  }),
  getMultipleAccounts: (addresses: Address[]) => ({
    send: async () => ({
      context: { slot: 1n },
      value: addresses.map((account) =>
        account === table
          ? {
              data: {
                parsed: { info: { addresses: pools }, type: "lookupTable" },
                program: "address-lookup-table",
                space: 56 + 32 * pools.length,
              },
              executable: false,
              lamports: 1n,
              owner: LOOKUP_TABLE_PROGRAM,
              rentEpoch: 0n,
              space: BigInt(56 + 32 * pools.length),
            }
          : null,
      ),
    }),
  }),
} as unknown as SwapRpc;

const newCache = () => {
  const store = new Map<string, number>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: number) => void store.set(key, value),
  };
};

describe("buildJupiterSwapToSOL", () => {
  beforeEach(() => mock.method(globalThis, "fetch", fakeFetch));
  afterEach(() => mock.restoreAll());

  const build = async (sourceMint: Address, amount: bigint) => {
    const feePayer = await generateKeyPairSigner();
    const { transaction, quote } = await buildJupiterSwapToSOL({
      rpc,
      feePayer,
      user,
      sourceMint,
      amount,
      cache: newCache(),
      fees,
    });
    const message = decompileTransactionMessage(
      getCompiledTransactionMessageDecoder().decode(transaction.messageBytes),
      { addressesByLookupTableAddress: { [table]: pools } },
    );
    return { feePayer, transaction, quote, message };
  };

  it("is signed by the fee payer, with the user's signature left for them", async () => {
    const { feePayer, transaction } = await build(usdc, 1_000_000n);
    assert.ok(transaction.signatures[feePayer.address]);
    assert.equal(transaction.signatures[user], null);
    assert.deepEqual(Object.keys(transaction.signatures), [
      feePayer.address,
      user,
    ]);
  });

  it("orders the instructions: budget (reversed), wrap, swap, unwrap, repay", async () => {
    const { feePayer, message, quote } = await build(usdc, 1_000_000n);
    assert.equal(message.feePayer.address, feePayer.address);
    const programs = Array.from(message.instructions, (i) => i.programAddress);
    assert.deepEqual(programs, [
      COMPUTE_BUDGET,
      COMPUTE_BUDGET,
      address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      JUPITER,
      TOKEN_PROGRAM_ADDRESS,
      SYSTEM_PROGRAM,
    ]);
    // Solflare's sake: the price instruction (3) now comes before the limit (2).
    assert.equal(message.instructions[0]!.data![0], 3);
    assert.equal(message.instructions[1]!.data![0], 2);
    // The swap's accounts came through the lookup table.
    assert.deepEqual(
      message.instructions[3]!.accounts!.slice(1).map((a) => a.address),
      pools,
    );

    // The user repays the rent the fee payer laid out, the transaction fee
    // and the platform fee, 1% of the SOL received.
    const repay = getTransferSolInstructionDataDecoder().decode(
      message.instructions[5]!.data!,
    );
    assert.equal(
      repay.amount,
      LAMPORTS_PER_TOKEN_ACCOUNT +
        TRANSACTION_FEE +
        (BigInt(quote.outAmount) * 100n) / 10_000n,
    );
    assert.equal(
      message.instructions[5]!.accounts![1]!.address,
      feePayer.address,
    );
  });

  it("burns a share of BONK and swaps the rest", async () => {
    const { message } = await build(BONK_MINT, 1_000_000n);
    assert.equal(jupiter.quoteAmount, "975000");
    const burn = message.instructions.at(-1)!;
    assert.equal(burn.programAddress, TOKEN_PROGRAM_ADDRESS);
    assert.equal(
      getBurnInstructionDataDecoder().decode(burn.data!).amount,
      25_000n,
    );
    assert.equal(burn.accounts![1]!.address, BONK_MINT);
  });

  it("refuses an empty amount and a repeat within a few seconds", async () => {
    const feePayer = await generateKeyPairSigner();
    const cache = newCache();
    const args = { rpc, feePayer, user, sourceMint: usdc, cache, fees };
    await assert.rejects(
      buildJupiterSwapToSOL({ ...args, amount: 0n }),
      /zero or less/,
    );
    await buildJupiterSwapToSOL({ ...args, amount: 5n });
    await assert.rejects(
      buildJupiterSwapToSOL({ ...args, amount: 5n }),
      /Too many requests/,
    );
  });

  it("builds anyway when the rate-limit cache is down", async () => {
    mock.method(console, "error", () => undefined);
    const feePayer = await generateKeyPairSigner();
    const down = {
      get: async () => {
        throw Error("fetch failed");
      },
      set: async () => {
        throw Error("fetch failed");
      },
    };
    const { transaction } = await buildJupiterSwapToSOL({
      rpc,
      feePayer,
      user,
      sourceMint: usdc,
      amount: 5n,
      cache: down,
      fees,
    });
    assert.ok(transaction.signatures[feePayer.address]);
  });

  it("passes Jupiter's refusal on", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "Could not find any route" }),
    );
    await assert.rejects(
      build(usdc, 1n),
      /Failed to get quote for trade: Could not find any route/,
    );
  });
});
