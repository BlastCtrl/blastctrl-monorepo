import type { WalletContextState } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import type { BatchResult } from "./send-batches";
import { chainForEndpoint, sendBatches } from "./send-batches";

describe("chainForEndpoint", () => {
  it("knows devnet and testnet RPCs by their url", () => {
    expect(chainForEndpoint("https://api.devnet.solana.com")).toBe(
      "solana:devnet",
    );
    expect(chainForEndpoint("https://devnet.helius-rpc.com/?api-key=x")).toBe(
      "solana:devnet",
    );
    expect(chainForEndpoint("https://api.testnet.solana.com")).toBe(
      "solana:testnet",
    );
  });

  it("takes anything else for mainnet", () => {
    expect(chainForEndpoint("https://example.mainnet.rpcpool.com/key")).toBe(
      "solana:mainnet",
    );
    expect(chainForEndpoint("https://api.mainnet-beta.solana.com")).toBe(
      "solana:mainnet",
    );
  });
});

describe("sendBatches with a Wallet Standard wallet", () => {
  const signer = Keypair.generate();
  const lifetime = {
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 100,
  };
  const batches = [{ index: 0 }, { index: 1 }];
  const build = () =>
    new Transaction({ feePayer: signer.publicKey, ...lifetime }).add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: signer.publicKey,
        lamports: 1,
      }),
    );

  const connectionFor = (rpcEndpoint: string, sent: Buffer[]) =>
    ({
      rpcEndpoint,
      getLatestBlockhash: async () => lifetime,
      sendRawTransaction: async (raw: Buffer) => {
        sent.push(raw);
        return `signature-${sent.length}`;
      },
      confirmTransaction: async () => ({
        context: { slot: 1 },
        value: { err: null },
      }),
    }) as unknown as Connection;

  /** A wallet whose adapter wraps a Wallet Standard wallet on `chains`. */
  const standardWallet = (chains: string[]) => {
    const calls: { chain: string }[][] = [];
    let adapterCalls = 0;
    const account = { address: signer.publicKey.toBase58(), chains };
    const feature = {
      signTransaction: async (
        ...inputs: { chain: string; transaction: Uint8Array }[]
      ) => {
        calls.push(inputs.map(({ chain }) => ({ chain })));
        return inputs.map(({ transaction }) => {
          const tx = Transaction.from(transaction);
          tx.partialSign(signer);
          return { signedTransaction: tx.serialize() };
        });
      },
    };
    const wallet = {
      publicKey: signer.publicKey,
      wallet: {
        adapter: {
          wallet: {
            accounts: [account],
            features: { "solana:signTransaction": feature },
          },
        },
      } as unknown as WalletContextState["wallet"],
      signAllTransactions: async <T>(txs: T[]) => {
        adapterCalls++;
        (txs as Transaction[]).forEach((tx) => tx.partialSign(signer));
        return txs;
      },
      sendTransaction: async () => {
        throw Error("should sign them all at once");
      },
    };
    return { wallet, calls, adapterCalls: () => adapterCalls };
  };

  const run = async (
    endpoint: string,
    { wallet }: ReturnType<typeof standardWallet>,
  ) => {
    const sent: Buffer[] = [];
    const results: BatchResult[] = [];
    await sendBatches(
      batches,
      { connection: connectionFor(endpoint, sent), wallet, build },
      { onBatchResult: (result) => results.push(result) },
    );
    return { sent, results };
  };

  it("tells the wallet the transactions are for devnet", async () => {
    const standard = standardWallet(["solana:mainnet", "solana:devnet"]);
    const { sent, results } = await run(
      "https://devnet.helius-rpc.com/?api-key=x",
      standard,
    );
    expect(standard.calls).toEqual([
      [{ chain: "solana:devnet" }, { chain: "solana:devnet" }],
    ]);
    expect(standard.adapterCalls()).toBe(0);
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
    // What goes out is what the wallet signed.
    expect(Transaction.from(sent[0]!).verifySignatures()).toBe(true);
  });

  it("uses the adapter when the account can't sign for that chain", async () => {
    const standard = standardWallet(["solana:mainnet"]);
    const { results } = await run("https://api.devnet.solana.com", standard);
    expect(standard.calls).toEqual([]);
    expect(standard.adapterCalls()).toBe(1);
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
  });
});
