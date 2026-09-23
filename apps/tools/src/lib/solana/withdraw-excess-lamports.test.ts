import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createWithdrawExcessLamportsInstruction } from "./withdraw-excess-lamports";

const source = Keypair.generate().publicKey;
const destination = Keypair.generate().publicKey;
const authority = Keypair.generate().publicKey;

describe("createWithdrawExcessLamportsInstruction", () => {
  it("encodes only the instruction index", () => {
    const ix = createWithdrawExcessLamportsInstruction(
      source,
      destination,
      authority,
    );
    expect([...ix.data]).toEqual([38]);
  });

  it("defaults to the Token program and accepts Token-2022", () => {
    expect(
      createWithdrawExcessLamportsInstruction(source, destination, authority)
        .programId,
    ).toEqual(TOKEN_PROGRAM_ID);
    expect(
      createWithdrawExcessLamportsInstruction(
        source,
        destination,
        authority,
        [],
        TOKEN_2022_PROGRAM_ID,
      ).programId,
    ).toEqual(TOKEN_2022_PROGRAM_ID);
  });

  it("marks source and destination writable and the authority as signer", () => {
    const { keys } = createWithdrawExcessLamportsInstruction(
      source,
      destination,
      authority,
    );
    expect(keys).toEqual([
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ]);
  });

  it("lets a multisig authority be signed by its signers", () => {
    const signers = [
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    ];
    const { keys } = createWithdrawExcessLamportsInstruction(
      source,
      destination,
      authority,
      signers,
    );
    expect(keys[2]).toEqual({
      pubkey: authority,
      isSigner: false,
      isWritable: false,
    });
    expect(keys.slice(3)).toEqual(
      signers.map((pubkey) => ({ pubkey, isSigner: true, isWritable: false })),
    );
  });
});
