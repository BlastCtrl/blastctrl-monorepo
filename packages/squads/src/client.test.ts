import {
  address,
  createNoopSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  getUtf8Encoder,
  none,
  type Address,
  type Instruction,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { golden, hex, kitInstruction, web3Role } from "./fixtures/sdk-golden";
import {
  encodeVaultTransactionMessage,
  findBatchTransactionPda,
  findEphemeralSignerPda,
  findProgramConfigPda,
  findProposalPda,
  findSpendingLimitPda,
  findTransactionPda,
  findVaultPda,
  getBatchAddTransactionInstruction,
  getBatchCreateInstruction,
  getMultisigCodec,
  getProposalActivateInstruction,
  getProposalApproveInstruction,
  getProposalCreateInstruction,
  identifySquadsMultisigAccount,
  MULTISIG_DISCRIMINATOR,
  SQUADS_MULTISIG_PROGRAM_ADDRESS,
  SquadsMultisigAccount,
} from "./index";

// No validator or network: everything here is pure encoding and PDA math.
// The reference addresses were derived by the SDK on web3.js 1.
const MULTISIG = address("Bf48pLxRT9urwqwnnDtTqaCTNHTi8oQGoVN6mBdqctVx");
const MEMBER = address("HJ8iBFuu3Eo8ux6aNHyoAmCB1CLqZMBd1dSgQ7ibsfvG");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

const keysOf = (instruction: Instruction) =>
  (instruction.accounts ?? []).map(({ address, role }) => ({ address, role }));

describe("@blastctrl/squads generated client", () => {
  it("targets the Squads v4 program", () => {
    expect(SQUADS_MULTISIG_PROGRAM_ADDRESS).toBe(
      "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
    );
  });

  it("identifies a Multisig account by its Anchor discriminator", () => {
    expect([...MULTISIG_DISCRIMINATOR]).toEqual([
      224, 116, 121, 186, 68, 161, 79, 236,
    ]);
    const bytes = getMultisigCodec().encode({
      createKey: MEMBER,
      configAuthority: SYSTEM_PROGRAM,
      threshold: 1,
      timeLock: 0,
      transactionIndex: 8n,
      staleTransactionIndex: 0n,
      rentCollector: none(),
      bump: 255,
      members: [{ key: MEMBER, permissions: { mask: 7 } }],
    });
    expect(identifySquadsMultisigAccount(bytes)).toBe(
      SquadsMultisigAccount.Multisig,
    );
    expect(getMultisigCodec().decode(bytes)).toMatchObject({
      transactionIndex: 8n,
      members: [{ key: MEMBER, permissions: { mask: 7 } }],
    });
  });

  describe("PDAs match the SDK", () => {
    it("vault", async () => {
      expect(await findVaultPda({ multisig: MULTISIG, index: 0 })).toEqual([
        "6sZRZTsJwGdkSh47FqGGm7MBfkYWEpb9f9jFi7QSAZhG",
        255,
      ]);
      expect(await findVaultPda({ multisig: MULTISIG, index: 1 })).toEqual([
        "759B3H8VzQ8aVmt6AFkJkjAmk4gmKraTCgq5fjkdS1Hv",
        254,
      ]);
    });

    it("transaction, proposal, batch transaction, ephemeral signer", async () => {
      const [transaction] = await findTransactionPda({
        multisig: MULTISIG,
        index: 8,
      });
      expect(transaction).toBe("76XUkHPRvTMSZ35M8b3kj6hf1hDcQwYEduY1s98Xnmmq");
      expect(
        (await findProposalPda({ multisig: MULTISIG, transactionIndex: 8 }))[0],
      ).toBe("6XhaGQtuU5GKiHdKbLybmRuEcxTST5eeoh9Q6Brfx3JH");
      expect(
        (
          await findBatchTransactionPda({
            multisig: MULTISIG,
            batchIndex: 8,
            transactionIndex: 1,
          })
        )[0],
      ).toBe("6zJCDKvrgGX5vkwENtADSncanCC8XcjFZnheRgGadbwZ");
      expect(
        (
          await findBatchTransactionPda({
            multisig: MULTISIG,
            batchIndex: 8n,
            transactionIndex: 2,
          })
        )[0],
      ).toBe("8yfvfXMGmKwfmncz5RZH5vaPecfdWPLSeRTwUx8C597w");
      expect((await findEphemeralSignerPda({ transaction, index: 0 }))[0]).toBe(
        "7o3Y8dKEdnBxpzT8BnqWYW9L7AW28FGvdjiAtA3o3th6",
      );
    });

    it("spending limit and program config use the SDK's seeds", async () => {
      const utf8 = getUtf8Encoder();
      const createKey = MEMBER;
      expect(
        await findSpendingLimitPda({ multisig: MULTISIG, createKey }),
      ).toEqual(
        await getProgramDerivedAddress({
          programAddress: SQUADS_MULTISIG_PROGRAM_ADDRESS,
          seeds: [
            utf8.encode("multisig"),
            getAddressEncoder().encode(MULTISIG),
            utf8.encode("spending_limit"),
            getAddressEncoder().encode(createKey),
          ],
        }),
      );
      expect(await findProgramConfigPda()).toEqual(
        await getProgramDerivedAddress({
          programAddress: SQUADS_MULTISIG_PROGRAM_ADDRESS,
          seeds: [utf8.encode("multisig"), utf8.encode("program_config")],
        }),
      );
      // The u64 seeds are little-endian.
      expect(
        await findTransactionPda({ multisig: MULTISIG, index: 2n ** 40n + 3n }),
      ).toEqual(
        await getProgramDerivedAddress({
          programAddress: SQUADS_MULTISIG_PROGRAM_ADDRESS,
          seeds: [
            utf8.encode("multisig"),
            getAddressEncoder().encode(MULTISIG),
            utf8.encode("transaction"),
            getU64Encoder().encode(2n ** 40n + 3n),
          ],
        }),
      );
    });
  });

  describe("instructions match the SDK byte-for-byte", () => {
    const member = createNoopSigner(MEMBER);

    it("batchCreate (batch 8, vault 0), rent paid by the creator", async () => {
      const [batch] = await findTransactionPda({
        multisig: MULTISIG,
        index: 8,
      });
      const instruction = getBatchCreateInstruction({
        multisig: MULTISIG,
        batch,
        creator: member,
        vaultIndex: 0,
        memo: null,
      });
      expect(keysOf(instruction).map((key) => key.address)).toEqual(
        golden.batchCreate.keys,
      );
      expect(instruction.data).toEqual(hex(golden.batchCreate.data));
    });

    it("proposalCreate (transaction 8, draft)", async () => {
      const [proposal] = await findProposalPda({
        multisig: MULTISIG,
        transactionIndex: 8,
      });
      const instruction = getProposalCreateInstruction({
        multisig: MULTISIG,
        proposal,
        creator: member,
        transactionIndex: 8,
        draft: true,
      });
      expect(keysOf(instruction).map((key) => key.address)).toEqual(
        golden.proposalCreate.keys,
      );
      expect(instruction.data).toEqual(hex(golden.proposalCreate.data));
    });

    it("proposalActivate and proposalApprove data", async () => {
      const [proposal] = await findProposalPda({
        multisig: MULTISIG,
        transactionIndex: 8,
      });
      const accounts = { multisig: MULTISIG, member, proposal };
      expect(getProposalActivateInstruction(accounts).data).toEqual(
        hex(golden.proposalActivate.data),
      );
      expect(
        getProposalApproveInstruction({ ...accounts, args: { memo: null } })
          .data,
      ).toEqual(hex(golden.proposalApprove.data));
    });

    it("batchAddTransaction with the compiled vault message", async () => {
      const fixture = golden.batchAddTransaction;
      const [batch] = await findTransactionPda({
        multisig: MULTISIG,
        index: 8,
      });
      const [proposal] = await findProposalPda({
        multisig: MULTISIG,
        transactionIndex: 8,
      });
      const [transaction] = await findBatchTransactionPda({
        multisig: MULTISIG,
        batchIndex: 8,
        transactionIndex: fixture.transactionIndex,
      });
      const instruction = getBatchAddTransactionInstruction({
        multisig: MULTISIG,
        proposal,
        batch,
        transaction,
        member,
        ephemeralSigners: 0,
        transactionMessage: encodeVaultTransactionMessage({
          vault: address(golden.single.vault),
          instructions: golden.single.instructions.map(kitInstruction),
        }),
      });
      expect(keysOf(instruction)).toEqual(
        fixture.keys.map((key) => ({
          address: key.pubkey as Address,
          role: web3Role(key),
        })),
      );
      expect(instruction.data).toEqual(hex(fixture.data));
    });
  });
});
