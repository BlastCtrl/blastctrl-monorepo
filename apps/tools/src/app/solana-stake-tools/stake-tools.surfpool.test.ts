/**
 * Integration test of the stake tools against a local surfnet (surfpool).
 *
 * Skipped unless `SURFPOOL_URL` is set. Start the surfnet first, forked from
 * mainnet so the vote account below exists:
 *
 *   surfpool start --no-tui --no-studio --no-deploy -y --network mainnet
 *   SURFPOOL_URL=http://127.0.0.1:8899 pnpm exec vitest run surfpool
 *
 * The kit client is assembled like `useKitClient` does it, with a keypair
 * wrapped as a wallet-style `TransactionModifyingSigner`, so the same code
 * paths run as in the browser (including batch signing). Tests run in order
 * and share the accounts they create.
 */
import { getAppRpc } from "@/connector/app-rpc";
import { transactionErrorMessage } from "@/connector/transaction-error";
import type { KitClient } from "@/connector/use-kit-client";
import { STAKE_ACCOUNT_SIZE } from "@/lib/solana/stake-account";
import {
  toStakeAccount,
  type StakeAccountType,
} from "@/state/queries/use-stake-account";
import { userStakeAccountsQuery } from "@/state/queries/use-user-stake-accounts";
import {
  createClient,
  extendClient,
  rpcGetMinimumBalance,
  rpcTransactionPlanner,
  rpcTransactionPlanSendingExecutor,
  rpcTransactionPlanSigningExecutor,
} from "@solana/connector/kit";
import {
  fetchStakeStateAccount,
  getAuthorizeInstruction,
  getDeactivateInstruction,
  getMergeInstruction,
  getSetLockupInstruction,
  getSplitInstruction,
  getWithdrawInstruction,
  STAKE_PROGRAM_ADDRESS,
  StakeAuthorize,
} from "@solana-program/stake";
import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from "@solana-program/system";
import { signer } from "@solana/kit-plugin-signer";
import {
  address,
  createSolanaRpcSubscriptions,
  flattenTransactionPlanResult,
  generateKeyPairSigner,
  parallelInstructionPlan,
  partiallySignTransaction,
  pipe,
  type Address,
  type KeyPairSigner,
  type Lamports,
  type TransactionModifyingSigner,
} from "@solana/kit";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CSVRow } from "./stake-create/csv-rows";
import {
  buildStakeAccountInstructions,
  sendStakeRow,
  sendStakeRowsInBatches,
  type RowUpdate,
} from "./stake-create/stake-batch";

const SURFPOOL_URL = process.env.SURFPOOL_URL;
// The surfnet fetches unknown accounts from its datasource on first use; a
// slow remote can hold a transaction for tens of seconds.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const WS_URL = (SURFPOOL_URL ?? "")
  .replace(/^http/, "ws")
  .replace(/:8899$/, ":8900");

/** A mainnet vote account (GREED), fetched into the surfnet on first use. */
const VOTE = address("GREEDkpTvpKzcGvBu9qd36yk6BfjTWPShB67gLWuixMv");
const SOL = 1_000_000_000n;
const FAR_FUTURE = "2030-12-31T23:59:59Z";
const FAR_FUTURE_TS = BigInt(Math.floor(Date.parse(FAR_FUTURE) / 1000));

// ---------------------------------------------------------------------------
// Harness

/** JSON-RPC call for surfnet cheat codes and anything kit doesn't type. */
async function raw<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(SURFPOOL_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await response.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (json.error) throw Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

/**
 * A keypair presented the way the connector presents a wallet: a
 * `TransactionModifyingSigner` whose `modifyAndSignTransactions` takes the
 * whole batch in one call. `prompts` records what each "prompt" was asked for.
 */
function walletLike(keypair: KeyPairSigner) {
  const prompts: number[] = [];
  const wallet: TransactionModifyingSigner = {
    address: keypair.address,
    modifyAndSignTransactions: async (transactions) => {
      prompts.push(transactions.length);
      const signed = await Promise.all(
        transactions.map((tx) =>
          partiallySignTransaction([keypair.keyPair], tx),
        ),
      );
      return signed as unknown as Awaited<
        ReturnType<TransactionModifyingSigner["modifyAndSignTransactions"]>
      >;
    },
  };
  return { wallet, prompts };
}

/** Same plugin stack as `useKitClient`, over the surfnet. */
function makeClient(wallet: TransactionModifyingSigner) {
  return pipe(
    createClient(),
    signer(wallet),
    (client) =>
      extendClient(client, {
        rpc: getAppRpc(SURFPOOL_URL!),
        rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
      }),
    rpcGetMinimumBalance(),
    rpcTransactionPlanner(),
    rpcTransactionPlanSigningExecutor(),
    rpcTransactionPlanSendingExecutor(),
  ) as unknown as KitClient;
}

async function airdrop(to: Address, amount: bigint) {
  await raw("requestAirdrop", [to, Number(amount)]);
  for (let i = 0; i < 50; i++) {
    const { value } = await rpc.getBalance(to).send();
    if (value >= amount) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(`airdrop to ${to} did not land`);
}

const rpc = getAppRpc(SURFPOOL_URL ?? "http://127.0.0.1:8899");

const readStake = async (stake: Address): Promise<StakeAccountType> =>
  toStakeAccount(await fetchStakeStateAccount(rpc, stake));

const balance = async (account: Address) =>
  (await rpc.getBalance(account).send()).value;

const currentEpoch = async () =>
  (await rpc.getEpochInfo().send()).epoch;

/** What the MEV tool shows as claimable. */
const unclaimed = (account: StakeAccountType) =>
  account.stake
    ? account.lamports - account.stake.delegation.stake - account.meta.rentExemptReserve
    : 0n;

/** The innermost error message in a cause chain (the program's own error). */
function deepestMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}

/**
 * Runs a tool action; on failure returns what the tool would toast
 * (`transactionErrorMessage`) and logs it next to the program's own error.
 */
async function failureMessage(action: () => Promise<unknown>, label = "") {
  try {
    await action();
    return null;
  } catch (error) {
    const shown = transactionErrorMessage(error);
    const deepest = deepestMessage(error);
    if (label) {
      console.log(`${label}\n   tool shows: ${shown}\n   program:    ${deepest}`);
    }
    return shown;
  }
}

// ---------------------------------------------------------------------------
// Shared state

let owner: KeyPairSigner;
let other: KeyPairSigner;
let ownerPrompts: number[];
let ownerClient: KitClient;
let otherClient: KitClient;
let rent: Lamports;

/**
 * A surfnet that fails to reach its datasource holds the transaction for
 * 30 s, after which the blockhash is gone or the RPC answers with an error
 * kit can't parse. Not an app concern; the fixture retries once.
 */
const isDatasourceStall = (error: unknown) =>
  /progressed past the last block|Blockhash not found|destructure property 'err'/.test(
    deepestMessage(error),
  );

/** Creates one stake account the way the create tool does and returns its address. */
async function createStake(client: KitClient, row: CSVRow, attempt = 1) {
  const stake = await generateKeyPairSigner();
  try {
    await client.sendTransaction(
      buildStakeAccountInstructions(client.payer, stake, row, rent),
    );
  } catch (error) {
    if (attempt < 3 && isDatasourceStall(error)) {
      console.warn("surfnet datasource stall, retrying createStake");
      return createStake(client, row, attempt + 1);
    }
    throw error;
  }
  return stake.address;
}

/**
 * Several accounts, created one after another: each new address makes the
 * surfnet ask its datasource once, and concurrent misses have stalled it.
 */
async function createStakes(client: KitClient, rows: CSVRow[]) {
  const out: Address[] = [];
  for (const row of rows) out.push(await createStake(client, row));
  return out;
}

describe.skipIf(!SURFPOOL_URL)("stake tools on surfpool", () => {
  beforeAll(async () => {
    owner = await generateKeyPairSigner();
    other = await generateKeyPairSigner();
    const o = walletLike(owner);
    ownerPrompts = o.prompts;
    ownerClient = makeClient(o.wallet);
    otherClient = makeClient(walletLike(other).wallet);
    await Promise.all([
      airdrop(owner.address, 500n * SOL),
      airdrop(other.address, 50n * SOL),
    ]);
    rent = await ownerClient.getMinimumBalance(STAKE_ACCOUNT_SIZE);
    expect(rent).toBeGreaterThan(0n);
  }, 60_000);

  // ---- create ------------------------------------------------------------

  describe("create", () => {
    it("plain account: initialized, owner as every authority, rent on top", async () => {
      const amount = 3n * SOL;
      const stake = await createStake(ownerClient, {
        stake_amount: amount.toString(),
      });
      const acc = await readStake(stake);
      expect(acc.stake).toBeNull();
      expect(acc.lamports).toBe(amount + rent);
      expect(acc.meta.rentExemptReserve).toBe(rent);
      expect(acc.meta.authorized).toEqual({
        staker: owner.address,
        withdrawer: owner.address,
      });
      expect(acc.meta.lockup).toEqual({
        unixTimestamp: 0n,
        epoch: 0n,
        custodian: owner.address,
      });
    });

    it("delegated row: the CSV amount is exactly the delegated stake", async () => {
      const amount = 2n * SOL;
      const stake = await createStake(ownerClient, {
        stake_amount: amount.toString(),
        validator: VOTE,
      });
      const acc = await readStake(stake);
      expect(acc.stake?.delegation.voterPubkey).toBe(VOTE);
      expect(acc.stake?.delegation.stake).toBe(amount);
      expect(acc.stake?.delegation.activationEpoch).toBe(await currentEpoch());
      expect(acc.lamports).toBe(amount + rent);
    });

    it("full row: authorities handed off, lockup set, custodian moved", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (2n * SOL).toString(),
        validator: VOTE,
        withdraw_authority: other.address,
        stake_authority: other.address,
        unlock_date: FAR_FUTURE,
        lockup_custodian: other.address,
      });
      const acc = await readStake(stake);
      expect(acc.meta.authorized).toEqual({
        staker: other.address,
        withdrawer: other.address,
      });
      expect(acc.meta.lockup).toEqual({
        unixTimestamp: FAR_FUTURE_TS,
        epoch: 0n,
        custodian: other.address,
      });
      expect(acc.stake?.delegation.voterPubkey).toBe(VOTE);
    });

    it("sendStakeRow (the one-prompt-per-row and retry path)", async () => {
      const signature = await sendStakeRow(
        ownerClient,
        { stake_amount: (1n * SOL).toString() },
        rent,
      );
      expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    });

    it("CSV batch: all rows signed in one prompt and confirmed", async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `row-${i}`,
        row: {
          stake_amount: (1n * SOL).toString(),
          validator: i % 2 ? VOTE : undefined,
        },
      }));
      const updates = new Map<string, RowUpdate[]>();
      const before = ownerPrompts.length;
      await sendStakeRowsInBatches(ownerClient, rows, rent, (id, update) => {
        updates.set(id, [...(updates.get(id) ?? []), update]);
      });
      // One wallet prompt for the whole batch.
      expect(ownerPrompts.slice(before)).toEqual([3]);
      for (const { id } of rows) {
        const last = updates.get(id)?.at(-1);
        expect(last?.status, `${id}: ${JSON.stringify(last)}`).toBe(
          "confirmed",
        );
      }
    });

    it("CSV batch with one bad row: what happens to the good ones", async () => {
      const rows = [
        { id: "good-1", row: { stake_amount: (1n * SOL).toString() } },
        // Not a vote account: delegating to it fails.
        {
          id: "bad",
          row: { stake_amount: (1n * SOL).toString(), validator: other.address },
        },
        { id: "good-2", row: { stake_amount: (1n * SOL).toString() } },
      ];
      const last = new Map<string, RowUpdate>();
      await sendStakeRowsInBatches(ownerClient, rows, rent, (id, update) =>
        last.set(id, update),
      );
      const bad = last.get("bad");
      expect(bad?.status).toBe("failed");
      console.log("bad row error:", bad?.status === "failed" && bad.error);
      console.log(
        "good rows:",
        last.get("good-1")?.status,
        last.get("good-2")?.status,
      );
      // Documented behaviour to decide on: are good rows sent when a sibling
      // in the same batch fails simulation?
      expect(["confirmed", "failed"]).toContain(last.get("good-1")?.status);
    });

    it("delegation below 1 SOL is refused (SIMD-0490, same as mainnet)", async () => {
      const message = await failureMessage(
        () =>
          createStake(ownerClient, {
            stake_amount: (SOL / 2n).toString(),
            validator: VOTE,
          }),
        "0.5 SOL delegation:",
      );
      // The toast shows the program's error (InsufficientDelegation), not
      // kit's "failed when simulated" wrapper around it.
      expect(message).toMatch(/Custom program error: #12/);
    });
  });

  // ---- authorize ---------------------------------------------------------

  describe("authorize", () => {
    it("moves both authorities in one transaction, no lockup", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (1n * SOL).toString(),
      });
      // Same instruction list as AuthorizeTransactionBuilder.
      await ownerClient.sendTransaction([
        getAuthorizeInstruction({
          stake,
          authority: ownerClient.payer,
          arg0: other.address,
          arg1: StakeAuthorize.Withdrawer,
        }),
        getAuthorizeInstruction({
          stake,
          authority: ownerClient.payer,
          arg0: other.address,
          arg1: StakeAuthorize.Staker,
        }),
      ]);
      const acc = await readStake(stake);
      expect(acc.meta.authorized).toEqual({
        staker: other.address,
        withdrawer: other.address,
      });
    });

    it("withdrawer change on a locked-up account: the program needs the custodian, the tool passes it", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (1n * SOL).toString(),
        unlock_date: FAR_FUTURE, // owner is custodian
      });
      // Without the custodian the program refuses (stake error 7,
      // CustodianMissing), and the toast must name that error, not kit's
      // generic simulation wrapper.
      const withoutCustodian = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getAuthorizeInstruction({
              stake,
              authority: ownerClient.payer,
              arg0: other.address,
              arg1: StakeAuthorize.Withdrawer,
            }),
          ]),
        "authorize withdrawer, lockup in force, no custodian:",
      );
      expect(withoutCustodian).toMatch(/Custom program error: #7/);

      // The authorize tool's shape: the wallet as `lockupAuthority` when it
      // is the custodian.
      const withCustodian = await failureMessage(() =>
        ownerClient.sendTransaction([
          getAuthorizeInstruction({
            stake,
            authority: ownerClient.payer,
            lockupAuthority: ownerClient.payer,
            arg0: other.address,
            arg1: StakeAuthorize.Withdrawer,
          }),
        ]),
      );
      expect(withCustodian).toBeNull();
      expect((await readStake(stake)).meta.authorized.withdrawer).toBe(
        other.address,
      );
      // Staker change needs no custodian even under lockup.
      expect(
        await failureMessage(() =>
          ownerClient.sendTransaction([
            getAuthorizeInstruction({
              stake,
              authority: ownerClient.payer,
              arg0: other.address,
              arg1: StakeAuthorize.Staker,
            }),
          ]),
        ),
      ).toBeNull();
    });
  });

  // ---- set-lockup --------------------------------------------------------

  describe("set-lockup", () => {
    let stake: Address;

    it("withdrawer sets all three fields while no lockup is in force", async () => {
      stake = await createStake(ownerClient, {
        stake_amount: (1n * SOL).toString(),
      });
      await ownerClient.sendTransaction([
        getSetLockupInstruction({
          stake,
          authority: ownerClient.payer,
          unixTimestamp: Number(FAR_FUTURE_TS),
          epoch: 5000,
          custodian: other.address,
        }),
      ]);
      expect((await readStake(stake)).meta.lockup).toEqual({
        unixTimestamp: FAR_FUTURE_TS,
        epoch: 5000n,
        custodian: other.address,
      });
    });

    it("once in force, the withdrawer is refused and the custodian succeeds; null leaves a field alone", async () => {
      const asWithdrawer = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getSetLockupInstruction({
              stake,
              authority: ownerClient.payer,
              unixTimestamp: null,
              epoch: 6000,
              custodian: null,
            }),
          ]),
        "set-lockup by withdrawer while in force:",
      );
      expect(asWithdrawer).not.toBeNull();

      await otherClient.sendTransaction([
        getSetLockupInstruction({
          stake,
          authority: otherClient.payer,
          unixTimestamp: null,
          epoch: 6000,
          custodian: null,
        }),
      ]);
      expect((await readStake(stake)).meta.lockup).toEqual({
        unixTimestamp: FAR_FUTURE_TS,
        epoch: 6000n,
        custodian: other.address,
      });
    });

    it("custodian can disable further changes with the zero address", async () => {
      await otherClient.sendTransaction([
        getSetLockupInstruction({
          stake,
          authority: otherClient.payer,
          unixTimestamp: null,
          epoch: null,
          custodian: address("11111111111111111111111111111111"),
        }),
      ]);
      const acc = await readStake(stake);
      expect(acc.meta.lockup.custodian).toBe("11111111111111111111111111111111");
      const message = await failureMessage(
        () =>
          otherClient.sendTransaction([
            getSetLockupInstruction({
              stake,
              authority: otherClient.payer,
              unixTimestamp: null,
              epoch: 7000,
              custodian: null,
            }),
          ]),
        "set-lockup after custodian disabled:",
      );
      expect(message).not.toBeNull();
    });
  });

  // ---- split -------------------------------------------------------------

  describe("split", () => {
    it("manual form shape on a delegated account: unfunded destination is refused by the current program", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (3n * SOL).toString(),
        validator: VOTE,
      });
      const split = await generateKeyPairSigner();
      const amount = (3n * SOL) / 2n;
      // The BPF stake program requires the destination of an active or
      // activating split to be pre-funded with its rent; the manual form
      // allocates it with 0 lamports.
      const message = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getCreateAccountInstruction({
              payer: ownerClient.payer,
              newAccount: split,
              lamports: 0n,
              space: BigInt(STAKE_ACCOUNT_SIZE),
              programAddress: STAKE_PROGRAM_ADDRESS,
            }),
            getSplitInstruction({
              stake,
              splitStake: split.address,
              stakeAuthority: ownerClient.payer,
              args: amount,
            }),
          ]),
        "manual shape, delegated source, 1.5 of 3 SOL:",
      );
      expect(message).not.toBeNull();
    });

    it("graphic form's default 50% of the balance on a 2 SOL account is refused (rent is not stake)", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (2n * SOL).toString(),
        validator: VOTE,
      });
      const acc = await readStake(stake);
      // SplitFormInner: newAccountLamports = round((1 - 50/100) * total lamports)
      const half = BigInt(Math.round(0.5 * Number(acc.lamports)));
      const split = await generateKeyPairSigner();
      const message = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getCreateAccountInstruction({
              payer: ownerClient.payer,
              newAccount: split,
              lamports: rent,
              space: BigInt(STAKE_ACCOUNT_SIZE),
              programAddress: STAKE_PROGRAM_ADDRESS,
            }),
            getSplitInstruction({
              stake,
              splitStake: split.address,
              stakeAuthority: ownerClient.payer,
              args: half,
            }),
          ]),
        "graphic shape, 50% of total lamports on 2 SOL stake:",
      );
      // Source would keep 2 SOL - half < 1 SOL of delegated stake.
      expect(message).not.toBeNull();
    });

    it("graphic form shape: rent-funded destination, amount is the destination's stake", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (3n * SOL).toString(),
        validator: VOTE,
      });
      const split = await generateKeyPairSigner();
      const amount = (3n * SOL) / 2n;
      await ownerClient.sendTransaction([
        getCreateAccountInstruction({
          payer: ownerClient.payer,
          newAccount: split,
          lamports: rent,
          space: BigInt(STAKE_ACCOUNT_SIZE),
          programAddress: STAKE_PROGRAM_ADDRESS,
        }),
        getSplitInstruction({
          stake,
          splitStake: split.address,
          stakeAuthority: ownerClient.payer,
          args: amount,
        }),
      ]);
      const [source, dest] = await Promise.all([
        readStake(stake),
        readStake(split.address),
      ]);
      expect(dest.lamports).toBe(amount + rent);
      expect(dest.stake?.delegation.stake).toBe(amount);
      expect(source.stake?.delegation.stake).toBe(3n * SOL - amount);
    });

    it("either side below 1 SOL of delegated stake is refused (the forms don't guard this)", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (2n * SOL).toString(),
        validator: VOTE,
      });
      for (const [label, amount, funded] of [
        ["manual shape, 0.5 SOL total to destination:", SOL / 2n, 0n],
        ["manual shape, 1 SOL total (stake < 1 SOL after rent):", SOL, 0n],
        ["graphic shape, 0.5 SOL stake to destination:", SOL / 2n, rent],
        ["graphic shape, 1.5 SOL (source keeps 0.5 SOL):", (3n * SOL) / 2n, rent],
      ] as const) {
        const split = await generateKeyPairSigner();
        const message = await failureMessage(
          () =>
            ownerClient.sendTransaction([
              getCreateAccountInstruction({
                payer: ownerClient.payer,
                newAccount: split,
                lamports: funded,
                space: BigInt(STAKE_ACCOUNT_SIZE),
                programAddress: STAKE_PROGRAM_ADDRESS,
              }),
              getSplitInstruction({
                stake,
                splitStake: split.address,
                stakeAuthority: ownerClient.payer,
                args: amount,
              }),
            ]),
          label,
        );
        expect(message, label).not.toBeNull();
      }
    });

    it("undelegated account splits too (manual form, user-supplied keypair)", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (2n * SOL).toString(),
      });
      const split = await generateKeyPairSigner();
      await ownerClient.sendTransaction([
        getCreateAccountInstruction({
          payer: ownerClient.payer,
          newAccount: split,
          lamports: 0n,
          space: BigInt(STAKE_ACCOUNT_SIZE),
          programAddress: STAKE_PROGRAM_ADDRESS,
        }),
        getSplitInstruction({
          stake,
          splitStake: split.address,
          stakeAuthority: ownerClient.payer,
          args: SOL,
        }),
      ]);
      const dest = await readStake(split.address);
      expect(dest.stake).toBeNull();
      expect(dest.lamports).toBe(SOL);
    });
  });

  // ---- merge -------------------------------------------------------------

  describe("merge", () => {
    const merge = (client: KitClient, destination: Address, source: Address) =>
      client.sendTransaction([
        getMergeInstruction({
          destinationStake: destination,
          sourceStake: source,
          stakeAuthority: client.payer,
        }),
      ]);

    it("two undelegated accounts: source drained into destination", async () => {
      const [a, b] = await createStakes(ownerClient, [
        { stake_amount: (1n * SOL).toString() },
        { stake_amount: (2n * SOL).toString() },
      ]);
      await merge(ownerClient, a!, b!);
      expect((await readStake(a!)).lamports).toBe(3n * SOL + 2n * rent);
      expect(await balance(b!)).toBe(0n);
    });

    it("two accounts activating in the same epoch to the same vote", async () => {
      const [a, b] = await createStakes(ownerClient, [
        { stake_amount: (1n * SOL).toString(), validator: VOTE },
        { stake_amount: (2n * SOL).toString(), validator: VOTE },
      ]);
      await merge(ownerClient, a!, b!);
      const acc = await readStake(a!);
      expect(acc.stake?.delegation.stake).toBe(3n * SOL + rent);
      expect(acc.lamports).toBe(3n * SOL + 2n * rent);
    });

    it("undelegated into activating (same epoch) is allowed", async () => {
      const [a, b] = await createStakes(ownerClient, [
        { stake_amount: (1n * SOL).toString(), validator: VOTE },
        { stake_amount: (1n * SOL).toString() },
      ]);
      await merge(ownerClient, a!, b!);
      expect((await readStake(a!)).stake?.delegation.stake).toBe(
        2n * SOL + rent,
      );
    });

    it("different authorities: the program's message as the tool would show it", async () => {
      const [a, b] = await createStakes(ownerClient, [
        { stake_amount: (1n * SOL).toString() },
        {
          stake_amount: (1n * SOL).toString(),
          withdraw_authority: other.address,
        },
      ]);
      const message = await failureMessage(
        () => merge(ownerClient, a!, b!),
        "merge with different withdrawers:",
      );
      expect(message).not.toBeNull();
    });
  });

  // ---- MEV rewards (withdraw excess) --------------------------------------

  describe("mev-rewards", () => {
    it("withdraws the excess of two accounts to another wallet in one plan", async () => {
      const [a, b] = (await createStakes(ownerClient, [
        { stake_amount: (2n * SOL).toString(), validator: VOTE },
        { stake_amount: (2n * SOL).toString(), validator: VOTE },
      ])) as [Address, Address];
      // A Jito tip is a plain transfer into the stake account.
      const tipA = 300_000_000n;
      const tipB = 200_000_000n;
      await ownerClient.sendTransaction([
        getTransferSolInstruction({
          source: ownerClient.payer,
          destination: a,
          amount: tipA,
        }),
        getTransferSolInstruction({
          source: ownerClient.payer,
          destination: b,
          amount: tipB,
        }),
      ]);
      const accounts = await Promise.all([readStake(a), readStake(b)]);
      expect(accounts.map(unclaimed)).toEqual([tipA, tipB]);

      const before = await balance(other.address);
      const result = await ownerClient.sendTransactions(
        parallelInstructionPlan(
          accounts.map((acc) =>
            getWithdrawInstruction({
              stake: acc.address,
              recipient: other.address,
              withdrawAuthority: ownerClient.payer,
              args: unclaimed(acc),
            }),
          ),
        ),
      );
      const results = flattenTransactionPlanResult(result);
      expect(results.every((r) => r.status === "successful")).toBe(true);
      expect(results).toHaveLength(1); // both fit in one transaction
      expect((await balance(other.address)) - before).toBe(tipA + tipB);
      const after = await Promise.all([readStake(a), readStake(b)]);
      expect(after.map(unclaimed)).toEqual([0n, 0n]);
    });

    it("excess on a locked-up account: needs the custodian, which the tool passes", async () => {
      const stake = await createStake(ownerClient, {
        stake_amount: (2n * SOL).toString(),
        validator: VOTE,
        unlock_date: FAR_FUTURE,
      });
      await ownerClient.sendTransaction([
        getTransferSolInstruction({
          source: ownerClient.payer,
          destination: stake,
          amount: 100_000_000n,
        }),
      ]);
      const acc = await readStake(stake);
      const message = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getWithdrawInstruction({
              stake,
              recipient: owner.address,
              withdrawAuthority: ownerClient.payer,
              args: unclaimed(acc),
            }),
          ]),
        "withdraw excess under lockup, no custodian:",
      );
      expect(message).toMatch(/Custom program error: #1 /); // LockupInForce
      // The MEV tool's shape: the wallet as `lockupAuthority` when it is the custodian.
      const withCustodian = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getWithdrawInstruction({
              stake,
              recipient: owner.address,
              withdrawAuthority: ownerClient.payer,
              lockupAuthority: ownerClient.payer,
              args: unclaimed(acc),
            }),
          ]),
        "withdraw excess under lockup, with custodian:",
      );
      expect(withCustodian).toBeNull();
      expect(unclaimed(await readStake(stake))).toBe(0n);
    });
  });

  // ---- reads -------------------------------------------------------------

  describe("reads", () => {
    it("user stake accounts scan (memcmp offsets) finds the owner's accounts", async () => {
      const query = userStakeAccountsQuery(rpc, { withdrawer: owner.address });
      const accounts = await query.queryFn!({
        queryKey: query.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
        client: undefined as never,
      } as never);
      expect(accounts.length).toBeGreaterThan(5);
      expect(
        accounts.every((a) => a.meta.authorized.withdrawer === owner.address),
      ).toBe(true);

      const byStaker = userStakeAccountsQuery(rpc, { staker: other.address });
      const others = await byStaker.queryFn!({
        queryKey: byStaker.queryKey,
        signal: new AbortController().signal,
      } as never);
      expect(others.length).toBeGreaterThan(0);
      expect(others.every((a) => a.meta.authorized.staker === other.address)).toBe(
        true,
      );
    });
  });

  // ---- time travel -------------------------------------------------------

  describe("after an epoch jump (surfnet_timeTravel)", () => {
    let delegated: Address;
    let epochBefore: bigint;

    it("stake delegated before the jump: deactivate and withdraw after it", async () => {
      delegated = await createStake(ownerClient, {
        stake_amount: (2n * SOL).toString(),
        validator: VOTE,
      });
      epochBefore = await currentEpoch();
      await raw("surfnet_timeTravel", [
        { absoluteEpoch: Number(epochBefore) + 2 },
      ]);
      const epochAfter = await currentEpoch();
      console.log("epoch", epochBefore, "->", epochAfter);
      expect(epochAfter).toBe(epochBefore + 2n);

      await ownerClient.sendTransaction([
        getDeactivateInstruction({
          stake: delegated,
          stakeAuthority: ownerClient.payer,
        }),
      ]);
      const acc = await readStake(delegated);
      expect(acc.stake?.delegation.deactivationEpoch).toBe(epochAfter);

      // Merging an account activated before the jump with one activating now
      // must be refused by the program (the merge tool's filter mirrors this).
      const fresh = await createStake(ownerClient, {
        stake_amount: (1n * SOL).toString(),
        validator: VOTE,
      });
      const message = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getMergeInstruction({
              destinationStake: fresh,
              sourceStake: delegated,
              stakeAuthority: ownerClient.payer,
            }),
          ]),
        "merge deactivating into activating:",
      );
      expect(message).not.toBeNull();

      // One more epoch: fully deactivated, the whole balance is withdrawable.
      await raw("surfnet_timeTravel", [{ absoluteEpoch: Number(epochAfter) + 1 }]);
      const full = await failureMessage(
        () =>
          ownerClient.sendTransaction([
            getWithdrawInstruction({
              stake: delegated,
              recipient: owner.address,
              withdrawAuthority: ownerClient.payer,
              args: 2n * SOL + rent,
            }),
          ]),
        "withdraw all after deactivation:",
      );
      console.log("withdraw all after deactivation:", full ?? "ok");
      if (full === null) expect(await balance(delegated)).toBe(0n);
    });
  });
});
