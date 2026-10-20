import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  AccountRole,
  address,
  getAddressDecoder,
  isSignerRole,
  type Address,
  type Instruction,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { TOKEN_METADATA_PROGRAM_ADDRESS } from "./metaplex-token-metadata";
import {
  batchProposalSteps,
  isSquadsMultisigAccount,
  SQUADS_PROGRAM_ADDRESS,
  squadsVault,
  type SquadsMultisig,
} from "./squads-multisig";

const MULTISIG_DATA = new Uint8Array([224, 116, 121, 186, 68, 161, 79, 236, 1]);
const fresh = (): Address =>
  getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

describe("squadsVault", () => {
  it("derives the vault the Squads SDK does", () => {
    // A devnet multisig created with @sqds/multisig, and its getVaultPda.
    expect(
      squadsVault(address("Bf48pLxRT9urwqwnnDtTqaCTNHTi8oQGoVN6mBdqctVx")),
    ).toBe("6sZRZTsJwGdkSh47FqGGm7MBfkYWEpb9f9jFi7QSAZhG");
  });
});

describe("isSquadsMultisigAccount", () => {
  it("knows a multisig account by its owner and discriminator", () => {
    expect(
      isSquadsMultisigAccount({
        programAddress: SQUADS_PROGRAM_ADDRESS,
        data: MULTISIG_DATA,
      }),
    ).toBe(true);
  });

  it("isn't fooled by other Squads accounts or other owners", () => {
    expect(
      isSquadsMultisigAccount({
        programAddress: SQUADS_PROGRAM_ADDRESS,
        data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      }),
    ).toBe(false);
    expect(
      isSquadsMultisigAccount({
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        data: MULTISIG_DATA,
      }),
    ).toBe(false);
    // A vault is a plain system account, usually without any data.
    expect(isSquadsMultisigAccount(null)).toBe(false);
  });
});

describe("batchProposalSteps", () => {
  const vault = fresh();
  /** Something the vault signs, like a creator verification. */
  const vaultInstruction = (): Instruction => ({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    accounts: [
      { address: vault, role: AccountRole.READONLY_SIGNER },
      { address: fresh(), role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array([52, 0]),
  });
  const transactions = [5, 5, 2].map((n) =>
    Array.from({ length: n }, vaultInstruction),
  );
  const memberKey = fresh();
  const info: SquadsMultisig = {
    address: fresh(),
    vault,
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
    const steps = batchProposalSteps({
      multisig: info,
      member: member(true),
      index: 8n,
      transactions,
    });
    // batchCreate + proposalCreate, one batchAddTransaction per transaction,
    // proposalActivate + proposalApprove.
    expect(sizes(steps)).toEqual([2, 1, 1, 1, 2]);
    for (const instruction of steps.flat()) {
      expect(instruction.programAddress).toBe(SQUADS_PROGRAM_ADDRESS);
      // The member signs (and pays rent); the vault never has to.
      const signers = instruction.accounts!.filter((a) => isSignerRole(a.role));
      expect(new Set(signers.map((a) => a.address))).toEqual(
        new Set([memberKey]),
      );
    }
  });

  it("leaves approving to others when the creator can't vote", () => {
    const steps = batchProposalSteps({
      multisig: info,
      member: member(false),
      index: 8n,
      transactions,
    });
    expect(sizes(steps).at(-1)).toBe(1);
  });

  it("finishes an interrupted draft from where it stopped", () => {
    const steps = batchProposalSteps({
      multisig: info,
      member: member(true),
      index: 8n,
      transactions,
      from: 3,
    });
    expect(sizes(steps)).toEqual([1, 2]);
  });
});
