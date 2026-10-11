import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { address, creator, metadata } from "./fixtures";
import {
  SQUADS_PROGRAM_ID,
  isSquadsMultisig,
  serializeForSquads,
  squadsVault,
} from "./squads";
import { packBatches, verifyInstruction } from "./transactions";

const MULTISIG_DATA = Buffer.from([224, 116, 121, 186, 68, 161, 79, 236, 1]);

describe("squadsVault", () => {
  it("derives the vault the Squads SDK does", () => {
    // A devnet multisig created with @sqds/multisig, and its getVaultPda.
    expect(
      squadsVault(
        new PublicKey("Bf48pLxRT9urwqwnnDtTqaCTNHTi8oQGoVN6mBdqctVx"),
      ).toBase58(),
    ).toBe("6sZRZTsJwGdkSh47FqGGm7MBfkYWEpb9f9jFi7QSAZhG");
  });
});

describe("isSquadsMultisig", () => {
  it("knows a multisig account by its owner and discriminator", () => {
    expect(
      isSquadsMultisig({ owner: SQUADS_PROGRAM_ID, data: MULTISIG_DATA }),
    ).toBe(true);
  });

  it("isn't fooled by other Squads accounts or other owners", () => {
    const otherAccount = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(
      isSquadsMultisig({ owner: SQUADS_PROGRAM_ID, data: otherAccount }),
    ).toBe(false);
    expect(
      isSquadsMultisig({
        owner: SystemProgram.programId,
        data: MULTISIG_DATA,
      }),
    ).toBe(false);
    // A vault is a plain system account, usually without any data.
    expect(isSquadsMultisig(null)).toBe(false);
  });
});

describe("serializeForSquads", () => {
  const umi = createUmi("http://127.0.0.1:8899").use(mplTokenMetadata());
  const vault = Keypair.generate().publicKey;
  const lifetime = {
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 1,
  };
  const [batch] = packBatches(
    Array.from({ length: 3 }, () => {
      const md = metadata({
        creators: [creator(vault.toBase58(), 100)],
      });
      const plan = {
        status: "ready" as const,
        mint: address() as UmiPublicKey,
        name: md.name,
        metadata: md,
      };
      return {
        mint: plan.mint,
        instruction: verifyInstruction(umi, plan, vault.toBase58()),
      };
    }),
    vault,
  );

  it("is an unsigned transaction the vault pays for and signs", () => {
    const bytes = bs58.decode(serializeForSquads(batch!, vault, lifetime));
    const tx = Transaction.from(bytes);
    expect(tx.feePayer?.equals(vault)).toBe(true);
    expect(tx.signatures.map((s) => s.signature)).toEqual([null]);
    expect(tx.instructions).toHaveLength(3);
    for (const instruction of tx.instructions) {
      const signers = instruction.keys.filter((k) => k.isSigner);
      expect(signers.map((k) => k.pubkey.toBase58())).toEqual([
        vault.toBase58(),
      ]);
    }
    // Importers that expect a versioned transaction read it as legacy.
    expect(VersionedTransaction.deserialize(bytes).version).toBe("legacy");
  });
});
