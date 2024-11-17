import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import { describe, it, beforeAll, expect } from "vitest";
import { getSetLockupInstruction } from "./stake";
import { StakeProgram } from "@solana/web3.js";

describe("getSetLockupInstruction", () => {
  let connection: Connection;
  let payer: Keypair;
  let stakeAccount: Keypair;
  let authority: Keypair;
  let custodian: Keypair;
  let programId: PublicKey;
  const initialLockupTimestamp = Math.floor(Date.now() / 1000) + 60 + 60 * 24;

  beforeAll(async () => {
    connection = new Connection("http://localhost:8899", "confirmed");
    payer = Keypair.generate();
    stakeAccount = Keypair.generate();
    authority = payer;
    custodian = payer;
    programId = StakeProgram.programId;

    // Airdrop SOL to payer
    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSignature);

    // Create stake account
    const createStakeAccountTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: stakeAccount.publicKey,
        lamports: LAMPORTS_PER_SOL / 2,
        space: StakeProgram.space,
        programId: StakeProgram.programId,
      }),
      StakeProgram.initialize({
        stakePubkey: stakeAccount.publicKey,
        authorized: {
          staker: authority.publicKey,
          withdrawer: authority.publicKey,
        },
        lockup: {
          unixTimestamp: initialLockupTimestamp, // after 1 day
          epoch: 0,
          custodian: custodian.publicKey,
        },
      }),
    );

    await sendAndConfirmTransaction(connection, createStakeAccountTx, [
      payer,
      stakeAccount,
    ]);
  });

  it("should set the lockup period to a later date", async () => {
    const newLockup = {
      unixTimestamp: Math.floor(
        new Date("2024-11-20T12:00:00+01:00").getTime() / 1000,
      ),
    };

    const instruction = getSetLockupInstruction(
      programId,
      stakeAccount.publicKey,
      newLockup,
      authority.publicKey,
    );

    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [payer], {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });

    // Fetch the updated stake account info
    const stakeAccountInfo = await connection.getParsedAccountInfo(
      stakeAccount.publicKey,
    );

    // @ts-expect-error this will be parsed
    const lockupInfo = stakeAccountInfo.value?.data?.parsed?.info?.meta?.lockup;

    expect(lockupInfo.unixTimestamp).toEqual(newLockup.unixTimestamp);
  });

  it("should set the lockup period to a later epoch", async () => {
    const newLockup = {
      epoch: 10,
    };

    const instruction = getSetLockupInstruction(
      programId,
      stakeAccount.publicKey,
      newLockup,
      authority.publicKey,
    );

    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [payer], {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });

    // Fetch the updated stake account info
    const stakeAccountInfo = await connection.getParsedAccountInfo(
      stakeAccount.publicKey,
    );

    // @ts-expect-error this will be parsed
    const lockupInfo = stakeAccountInfo.value?.data?.parsed?.info?.meta?.lockup;

    expect(lockupInfo.epoch).toEqual(newLockup.epoch);
  });

  it("should set the custodian to a new pubkey", async () => {
    const newCustodian = Keypair.generate();

    const newLockup = {
      custodian: newCustodian.publicKey,
    };

    const instruction = getSetLockupInstruction(
      programId,
      stakeAccount.publicKey,
      newLockup,
      authority.publicKey,
    );

    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [payer], {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });

    // Fetch the updated stake account info
    const stakeAccountInfo = await connection.getParsedAccountInfo(
      stakeAccount.publicKey,
    );

    // @ts-expect-error this will be parsed
    const lockupInfo = stakeAccountInfo.value?.data?.parsed?.info?.meta?.lockup;

    expect(lockupInfo.custodian).toEqual(newCustodian.publicKey.toBase58());
  });

  it("should change the timestamp, epoch and the custodian", async () => {
    const newCustodian = Keypair.generate();
    const newLockup = {
      unixTimestamp: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
      epoch: 10,
      custodian: newCustodian.publicKey,
    };

    const instruction = getSetLockupInstruction(
      programId,
      stakeAccount.publicKey,
      newLockup,
      authority.publicKey,
    );

    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [payer], {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });

    // Fetch the updated stake account info
    const stakeAccountInfo = await connection.getParsedAccountInfo(
      stakeAccount.publicKey,
    );

    // @ts-expect-error this will be parsed
    const lockupInfo = stakeAccountInfo.value?.data?.parsed?.info?.meta?.lockup;

    expect(lockupInfo.unixTimestamp).toEqual(newLockup.unixTimestamp);
    expect(lockupInfo.epoch).toEqual(newLockup.epoch);
    expect(lockupInfo.custodian).toEqual(newCustodian.publicKey);
  });
});
