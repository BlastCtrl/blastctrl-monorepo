import {
  Connection,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import base58 from "bs58";
import type { MemoryCache } from "cache-manager";
import { caching } from "cache-manager";
import { rejects } from "node:assert";
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import nacl from "tweetnacl";
import { signGeneratedTransaction } from "../actions/sign-generated-tx";
import { MessageToken } from "../core/message-token";
import { airdropLamports, isEmptyUint8Array } from "./common";

const connection = new Connection("http://localhost:8899/", "confirmed");

const feePayer = Keypair.generate();
before(async () => {
  await airdropLamports(connection, feePayer.publicKey);
});

let cache: MemoryCache;
let user: Keypair;
beforeEach(async () => {
  cache = await caching("memory", {
    max: 100,
    ttl: 10 * 1000 /*milliseconds*/,
  });
  user = Keypair.generate();
  await airdropLamports(connection, user.publicKey);
});

describe("signGeneratedTransaction action", async () => {
  it("signs a transaction with correct message token", async () => {
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            lamports: 100,
            toPubkey: feePayer.publicKey,
          }),
        ],
      }).compileToV0Message(),
    );

    const messageToken = new MessageToken(
      "test-transaction",
      transaction.message,
      feePayer,
    ).compile();

    transaction.sign([user]);
    assert.equal(transaction.signatures.length, 2);
    assert.equal(isEmptyUint8Array(transaction.signatures[0]!), true);
    assert.equal(isEmptyUint8Array(transaction.signatures[1]!), false);
    // Not sure how to recreate these tests with V0 transactions
    // assert.ok(transaction.signatures[0].publicKey.equals(feePayer.publicKey));
    // assert.ok(transaction.signatures[1].publicKey.equals(user.publicKey));
    assert.equal(
      nacl.sign.detached.verify(
        transaction.message.serialize(),
        transaction.signatures[1]!,
        user.publicKey.toBuffer(),
      ),
      true,
    );

    const { signature } = await signGeneratedTransaction(
      connection,
      transaction,
      feePayer,
      "test-transaction",
      messageToken,
      cache,
    );
    transaction.addSignature(feePayer.publicKey, base58.decode(signature));

    assert.notEqual(transaction.signatures[0], null);
    assert.doesNotReject(
      async () => await connection.sendRawTransaction(transaction.serialize()),
    );
  });

  it("rejects a transaction with additional instruction", async () => {
    let transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: (await connection.getRecentBlockhash()).blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            lamports: 100,
            toPubkey: feePayer.publicKey,
          }),
        ],
      }).compileToV0Message(),
    );
    const messageToken = new MessageToken(
      "test-transaction",
      transaction.message,
      feePayer,
    ).compile();

    const message = TransactionMessage.decompile(transaction.message);
    message.instructions.push(
      SystemProgram.transfer({
        fromPubkey: user.publicKey,
        lamports: 50,
        toPubkey: feePayer.publicKey,
      }),
    );
    transaction = new VersionedTransaction(message.compileToV0Message());

    transaction.sign([user]);
    await assert.rejects(
      async () => {
        await signGeneratedTransaction(
          connection,
          transaction,
          feePayer,
          "test-transaction",
          messageToken,
          cache,
        );
      },
      { name: "Error", message: "Message token isn't valid" },
    );
  });

  it("rejects a duplicate transaction", async () => {
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: (await connection.getRecentBlockhash()).blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            lamports: 100,
            toPubkey: feePayer.publicKey,
          }),
        ],
      }).compileToV0Message(),
    );

    const messageToken = new MessageToken(
      "test-transaction",
      transaction.message,
      feePayer,
    ).compile();
    transaction.sign([user]);

    await signGeneratedTransaction(
      connection,
      transaction,
      feePayer,
      "test-transaction",
      messageToken,
      cache,
    );

    await rejects(
      async () => {
        await signGeneratedTransaction(
          connection,
          transaction,
          feePayer,
          "test-transaction",
          messageToken,
          cache,
        );
      },
      { name: "Error", message: "Duplicate signature request" },
    );
  });

  it("rejects a transaction when fee payer's signature isn't required", async () => {
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user.publicKey,
        recentBlockhash: (await connection.getRecentBlockhash()).blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            lamports: 100,
            toPubkey: feePayer.publicKey,
          }),
        ],
      }).compileToV0Message(),
    );

    const messageToken = new MessageToken(
      "test-transaction",
      transaction.message,
      feePayer,
    ).compile();
    transaction.sign([user]);

    await rejects(
      async () => {
        await signGeneratedTransaction(
          connection,
          transaction,
          feePayer,
          "test-transaction",
          messageToken,
          cache,
        );
      },
      {
        name: "Error",
        message: "Transaction should have at least 2 pubkeys as signers",
      },
    );
  });

  it("rejects a unsigned by user transaction", async () => {
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            lamports: 100,
            toPubkey: feePayer.publicKey,
          }),
        ],
      }).compileToV0Message(),
    );

    const messageToken = new MessageToken(
      "test-transaction",
      transaction.message,
      feePayer,
    ).compile();
    await assert.rejects(
      async () => {
        await signGeneratedTransaction(
          connection,
          transaction,
          feePayer,
          "test-transaction",
          messageToken,
          cache,
        );
      },
      {
        name: "Error",
        message: "Missing user's signature",
      },
    );
  });

  it("rejects a transaction that will fail", async () => {
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            lamports: (await connection.getBalance(user.publicKey)) + 1,
            toPubkey: feePayer.publicKey,
          }),
        ],
      }).compileToV0Message(),
    );

    const messageToken = new MessageToken(
      "test-transaction",
      transaction.message,
      feePayer,
    ).compile();
    transaction.sign([user]);

    // Simulation error
    await assert.rejects(
      async () => {
        await signGeneratedTransaction(
          connection,
          transaction,
          feePayer,
          "test-transaction",
          messageToken,
          cache,
        );
      },
      { name: "Error", message: "Simulation error" },
    );
  });
});
