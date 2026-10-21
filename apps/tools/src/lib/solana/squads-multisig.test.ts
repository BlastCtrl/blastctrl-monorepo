import {
  getBatchEncoder,
  getCompactTransactionMessageDecoder,
  getVaultBatchTransactionEncoder,
} from "@blastctrl/squads";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  AccountRole,
  address,
  createNoopSigner,
  getAddressDecoder,
  getBase64Decoder,
  getU32Decoder,
  isSignerRole,
  isWritableRole,
  type Address,
  type GetMultipleAccountsApi,
  type Instruction,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { TOKEN_METADATA_PROGRAM_ADDRESS } from "./metaplex-token-metadata";
import {
  batchProposalSteps,
  executeSteps,
  isSquadsMultisigAccount,
  SQUADS_PROGRAM_ADDRESS,
  squadsVault,
  type BatchProposal,
  type SquadsMultisig,
} from "./squads-multisig";

const MULTISIG_DATA = new Uint8Array([224, 116, 121, 186, 68, 161, 79, 236, 1]);
const fresh = (): Address =>
  getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));
const accountAddresses = (instruction: Instruction) =>
  instruction.accounts!.map((a) => a.address);

/** A devnet multisig created with the Squads SDK, and its PDAs as the SDK derived them. */
const devnetMultisig = address("Bf48pLxRT9urwqwnnDtTqaCTNHTi8oQGoVN6mBdqctVx");
const devnetPdas = {
  vault0: address("6sZRZTsJwGdkSh47FqGGm7MBfkYWEpb9f9jFi7QSAZhG"),
  transaction8: address("76XUkHPRvTMSZ35M8b3kj6hf1hDcQwYEduY1s98Xnmmq"),
  proposal8: address("6XhaGQtuU5GKiHdKbLybmRuEcxTST5eeoh9Q6Brfx3JH"),
  batchTransaction8_1: address("6zJCDKvrgGX5vkwENtADSncanCC8XcjFZnheRgGadbwZ"),
  batchTransaction8_2: address("8yfvfXMGmKwfmncz5RZH5vaPecfdWPLSeRTwUx8C597w"),
};

describe("squadsVault", () => {
  it("derives the vault the Squads SDK does", async () => {
    expect(await squadsVault(devnetMultisig)).toBe(devnetPdas.vault0);
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
  const signer = createNoopSigner(fresh());
  const memberKey = signer.address;
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
  const sizes = (steps: Awaited<ReturnType<typeof batchProposalSteps>>) =>
    steps.map((step) => step.length);

  it("creates a draft, fills it, then activates and approves it", async () => {
    const steps = await batchProposalSteps({
      multisig: info,
      member: member(true),
      signer,
      index: 8n,
      transactions,
    });
    // batchCreate + proposalCreate, one batchAddTransaction per transaction,
    // proposalActivate + proposalApprove.
    expect(sizes(steps)).toEqual([2, 1, 1, 1, 2]);
    for (const instruction of steps.flat()) {
      expect(instruction.programAddress).toBe(SQUADS_PROGRAM_ADDRESS);
      // The member signs (and pays rent) with the wallet signer; the vault
      // never has to.
      const signers = instruction.accounts!.filter((a) => isSignerRole(a.role));
      expect(new Set(signers.map((a) => a.address))).toEqual(
        new Set([memberKey]),
      );
      for (const meta of signers) expect(meta).toMatchObject({ signer });
    }
  });

  it("addresses the batch, proposal and transactions the program expects", async () => {
    const steps = await batchProposalSteps({
      multisig: { ...info, address: devnetMultisig },
      member: member(true),
      signer,
      index: 8n,
      transactions,
    });
    const [batchCreate, proposalCreate] = steps[0]!;
    // multisig, batch, creator, rent payer, system program.
    expect(accountAddresses(batchCreate!)).toEqual([
      devnetMultisig,
      devnetPdas.transaction8,
      memberKey,
      memberKey,
      SYSTEM_PROGRAM_ADDRESS,
    ]);
    expect(accountAddresses(proposalCreate!)).toEqual([
      devnetMultisig,
      devnetPdas.proposal8,
      memberKey,
      memberKey,
      SYSTEM_PROGRAM_ADDRESS,
    ]);
    // multisig, proposal, batch, transaction, member, rent payer, system.
    expect(accountAddresses(steps[1]![0]!)).toEqual([
      devnetMultisig,
      devnetPdas.proposal8,
      devnetPdas.transaction8,
      devnetPdas.batchTransaction8_1,
      memberKey,
      memberKey,
      SYSTEM_PROGRAM_ADDRESS,
    ]);
    expect(accountAddresses(steps[2]![0]!)[3]).toBe(
      devnetPdas.batchTransaction8_2,
    );
    const [activate, approve] = steps.at(-1)!;
    expect(accountAddresses(activate!)).toEqual([
      devnetMultisig,
      memberKey,
      devnetPdas.proposal8,
    ]);
    expect(accountAddresses(approve!)).toEqual([
      devnetMultisig,
      memberKey,
      devnetPdas.proposal8,
    ]);
  });

  it("stores each transaction in the Squads message format", async () => {
    const steps = await batchProposalSteps({
      multisig: info,
      member: member(true),
      signer,
      index: 8n,
      transactions,
    });
    const data = steps[1]![0]!.data!;
    // Past the discriminator (8) and the ephemeral signer count (1) comes
    // the u32-length-prefixed compact message.
    const length = getU32Decoder().decode(data, 9);
    const message = getCompactTransactionMessageDecoder().decode(
      data.slice(13, 13 + length),
    );
    // The vault pays (first, writable signer), then the five instructions'
    // other accounts, then the program.
    expect(message.numSigners).toBe(1);
    expect(message.numWritableSigners).toBe(1);
    expect(message.numWritableNonSigners).toBe(5);
    expect(message.accountKeys[0]).toBe(vault);
    expect(message.accountKeys.at(-1)).toBe(TOKEN_METADATA_PROGRAM_ADDRESS);
    expect(message.instructions).toHaveLength(5);
    expect(Array.from(message.instructions[0]!.data)).toEqual([52, 0]);
    expect(message.addressTableLookups).toEqual([]);
  });

  it("leaves approving to others when the creator can't vote", async () => {
    const steps = await batchProposalSteps({
      multisig: info,
      member: member(false),
      signer,
      index: 8n,
      transactions,
    });
    expect(sizes(steps).at(-1)).toBe(1);
  });

  it("finishes an interrupted draft from where it stopped", async () => {
    const steps = await batchProposalSteps({
      multisig: info,
      member: member(true),
      signer,
      index: 8n,
      transactions,
      from: 3,
    });
    expect(sizes(steps)).toEqual([1, 2]);
  });
});

describe("executeSteps", () => {
  const signer = createNoopSigner(fresh());
  const other = fresh();
  const info: SquadsMultisig = {
    address: devnetMultisig,
    vault: devnetPdas.vault0,
    threshold: 1,
    timeLock: 0,
    members: [],
    transactionIndex: 8n,
  };
  const proposal: BatchProposal = {
    index: 8n,
    status: "Approved",
    approved: [signer.address],
    size: 2,
    executed: 1,
  };

  /** An account's RPC shape, as `getMultipleAccounts` gives it. */
  const rpcAccount = (data: ReadonlyUint8Array) => ({
    data: [getBase64Decoder().decode(data), "base64"] as const,
    executable: false,
    lamports: 1n,
    owner: SQUADS_PROGRAM_ADDRESS,
    rentEpoch: 0n,
    space: BigInt(data.length),
  });

  const batchData = getBatchEncoder().encode({
    multisig: devnetMultisig,
    creator: signer.address,
    index: 8n,
    bump: 0,
    vaultIndex: 0,
    vaultBump: 255,
    size: 2,
    executedTransactionIndex: 1,
  });
  /** The vault (signer, writable) and `other` (writable) under Token Metadata. */
  const transactionData = getVaultBatchTransactionEncoder().encode({
    bump: 0,
    ephemeralSignerBumps: new Uint8Array(),
    message: {
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 1,
      accountKeys: [devnetPdas.vault0, other, TOKEN_METADATA_PROGRAM_ADDRESS],
      instructions: [
        {
          programIdIndex: 2,
          accountIndexes: new Uint8Array([0, 1]),
          data: new Uint8Array([52, 0]),
        },
      ],
      addressTableLookups: [],
    },
  });

  it("executes each pending transaction with the accounts it touches", async () => {
    const requested: Address[][] = [];
    const rpc = {
      getMultipleAccounts: (addresses: Address[]) => ({
        send: async () => {
          requested.push(addresses);
          return {
            context: { slot: 0n },
            value: addresses.map((account) =>
              account === devnetPdas.transaction8
                ? rpcAccount(batchData)
                : account === devnetPdas.batchTransaction8_2
                  ? rpcAccount(transactionData)
                  : null,
            ),
          };
        },
      }),
    } as unknown as Rpc<GetMultipleAccountsApi>;

    const steps = await executeSteps(rpc, info, signer, proposal);

    // The batch and only the transaction that hasn't run, in one request.
    expect(requested).toEqual([
      [devnetPdas.transaction8, devnetPdas.batchTransaction8_2],
    ]);
    expect(steps).toHaveLength(1);
    const [execute] = steps[0]!;
    expect(execute!.programAddress).toBe(SQUADS_PROGRAM_ADDRESS);
    // multisig, member, proposal, batch, transaction, then the stored
    // transaction's accounts: the vault signs inside the program, not here.
    expect(accountAddresses(execute!)).toEqual([
      devnetMultisig,
      signer.address,
      devnetPdas.proposal8,
      devnetPdas.transaction8,
      devnetPdas.batchTransaction8_2,
      devnetPdas.vault0,
      other,
      TOKEN_METADATA_PROGRAM_ADDRESS,
    ]);
    expect(
      execute!.accounts!.map((a) => [
        isSignerRole(a.role),
        isWritableRole(a.role),
      ]),
    ).toEqual([
      [false, false],
      [true, false],
      [false, true],
      [false, true],
      [false, false],
      [false, true],
      [false, true],
      [false, false],
    ]);
    expect(execute!.accounts![1]).toMatchObject({ signer });
  });

  it("fails loudly when a stored transaction is missing", async () => {
    const rpc = {
      getMultipleAccounts: (addresses: Address[]) => ({
        send: async () => ({
          context: { slot: 0n },
          value: addresses.map((account) =>
            account === devnetPdas.transaction8 ? rpcAccount(batchData) : null,
          ),
        }),
      }),
    } as unknown as Rpc<GetMultipleAccountsApi>;
    await expect(executeSteps(rpc, info, signer, proposal)).rejects.toThrow(
      "Transaction 2 of batch 8",
    );
  });
});
