import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { address, creator, metadata } from "./fixtures";
import type { SquadsMultisig } from "./squads";
import {
  MAX_NFTS_PER_SQUADS_TRANSACTION,
  SQUADS_PROGRAM_ID,
  batchProposalSteps,
  isSquadsMultisig,
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

describe("batchProposalSteps", () => {
  const umi = createUmi("http://127.0.0.1:8899").use(mplTokenMetadata());
  const vault = Keypair.generate().publicKey;
  const batches = packBatches(
    Array.from({ length: 12 }, () => {
      const md = metadata({ creators: [creator(vault.toBase58(), 100)] });
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
    { maxPerTransaction: MAX_NFTS_PER_SQUADS_TRANSACTION },
  );
  const memberKey = address();
  const info: SquadsMultisig = {
    address: address(),
    vault: vault.toBase58(),
    threshold: 2,
    timeLock: 0,
    members: [],
    transactionIndex: 7n,
  };
  const member = (vote: boolean) => ({
    address: memberKey,
    initiate: true,
    vote,
    execute: true,
  });
  const sizes = (steps: ReturnType<typeof batchProposalSteps>) =>
    steps.map((step) => step.length);

  it("creates a draft, fills it, then activates and approves it", () => {
    expect(batches.map((b) => b.mints.length)).toEqual([5, 5, 2]);
    const steps = batchProposalSteps({
      multisig: info,
      member: member(true),
      index: 8n,
      batches,
    });
    // batchCreate + proposalCreate, one batchAddTransaction per batch,
    // proposalActivate + proposalApprove.
    expect(sizes(steps)).toEqual([2, 1, 1, 1, 2]);
    for (const instruction of steps.flat()) {
      expect(instruction.programId.equals(SQUADS_PROGRAM_ID)).toBe(true);
      // The member signs (and pays rent); the vault never has to.
      const signers = instruction.keys.filter((k) => k.isSigner);
      expect(new Set(signers.map((k) => k.pubkey.toBase58()))).toEqual(
        new Set([memberKey]),
      );
    }
  });

  it("leaves approving to others when the creator can't vote", () => {
    const steps = batchProposalSteps({
      multisig: info,
      member: member(false),
      index: 8n,
      batches,
    });
    expect(sizes(steps).at(-1)).toBe(1);
  });

  it("finishes an interrupted draft from where it stopped", () => {
    const steps = batchProposalSteps({
      multisig: info,
      member: member(true),
      index: 8n,
      batches,
      from: 3,
    });
    expect(sizes(steps)).toEqual([1, 2]);
  });
});
