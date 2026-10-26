import { solString } from "@blastctrl/rent-reclaimer";
import {
  address,
  createSolanaRpc,
  fetchEncodedAccounts,
  type Address,
  type GetBlockTimeApi,
  type GetEpochInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";
import { RECLAIM_URL, SCAN_TIMEOUT_MS } from "./analysis";

export const FEATURE_PROGRAM_ADDRESS =
  "Feature111111111111111111111111111111111111";
/** Rent before SIMD-0437: 3,480 lamports per byte-year, twice for exemption. */
export const ORIGINAL_LAMPORTS_PER_BYTE = 6960n;
/** Every account pays for 128 bytes of metadata on top of its data. */
export const ACCOUNT_STORAGE_OVERHEAD = 128n;
export const TOKEN_ACCOUNT_SIZE = 165n;
/**
 * Agave v4.4's tentative date for resuming mainnet feature activation, the
 * earliest the remaining steps can go live.
 */
export const EARLIEST_NEXT_ACTIVATION = "2026-11-09";
export const RENT_STATUS_CACHE_MS = 60_000;
const SLOT_MS = 400;

/** SIMD-0437's steps. Each sets lamports per byte outright, not relatively. */
export const RENT_REDUCTION_STEPS = [
  {
    step: 1,
    featureId: "4a6f7o7iTcA8hRDCrPLkSatnt5Ykxiu36wo5p1Tt12wC",
    lamportsPerByte: 6333n,
  },
  {
    step: 2,
    featureId: "61BtM7BkDEE8Yq5fskEVAQT9mYA8qCejJWoLe5apqg81",
    lamportsPerByte: 5080n,
  },
  {
    step: 3,
    featureId: "Ftxb3ZKq7aNqgxDBbP7EonvR2RszZk9ctjdsTX38kQaz",
    lamportsPerByte: 2575n,
  },
  {
    step: 4,
    featureId: "GsUBNYNDPdMLHPD37TToHzrzcNcjpC9w5n1EcJk5iTaM",
    lamportsPerByte: 1322n,
  },
  {
    step: 5,
    featureId: "mZdnRh9T2EbDNvqKjkCR3bvo5c816tJaojtE9Xs7iuY",
    lamportsPerByte: 696n,
  },
] as const;

export type GateState = {
  featureId: string;
  /** False when no feature account exists yet: activation isn't scheduled. */
  scheduled: boolean;
  activationSlot: bigint | null;
  /** Unix seconds of the activation slot's block, when the RPC has it. */
  activationBlockTime: number | null;
};

export type RentStatusScanResult = {
  slot: bigint;
  epoch: bigint;
  slotsLeftInEpoch: bigint;
  /** Live rent-exempt minimum of a 165-byte token account. */
  tokenAccountRentLamports: bigint;
  gates: GateState[];
};

export type RentStatusScan = (
  signal: AbortSignal,
) => Promise<RentStatusScanResult>;

type RentStatusRpc = Rpc<
  GetBlockTimeApi &
    GetEpochInfoApi &
    GetMinimumBalanceForRentExemptionApi &
    GetMultipleAccountsApi
>;

/**
 * A feature account holds a bincode `Option<u64>`: the activation slot once
 * the runtime has activated it at an epoch boundary, `None` until then.
 */
export function decodeFeature(data: Uint8Array): bigint | null {
  if (data.length < 9 || data[0] !== 1) return null;
  return new DataView(data.buffer, data.byteOffset, 9).getBigUint64(1, true);
}

export async function readRentStatus(
  rpc: RentStatusRpc,
  abortSignal: AbortSignal,
  blockTimes = new Map<bigint, number>(),
): Promise<RentStatusScanResult> {
  const [accounts, epochInfo, tokenAccountRentLamports] = await Promise.all([
    fetchEncodedAccounts(
      rpc,
      RENT_REDUCTION_STEPS.map((s) => address(s.featureId)),
      { abortSignal },
    ),
    rpc.getEpochInfo().send({ abortSignal }),
    rpc
      .getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE)
      .send({ abortSignal }),
  ]);
  const gates = await Promise.all(
    accounts.map(async (account): Promise<GateState> => {
      const featureId = account.address as string;
      if (
        !account.exists ||
        account.programAddress !== (FEATURE_PROGRAM_ADDRESS as Address)
      )
        return {
          featureId,
          scheduled: false,
          activationSlot: null,
          activationBlockTime: null,
        };
      const activationSlot = decodeFeature(account.data);
      return {
        featureId,
        scheduled: true,
        activationSlot,
        activationBlockTime:
          activationSlot === null
            ? null
            : await blockTime(rpc, activationSlot, blockTimes, abortSignal),
      };
    }),
  );
  return {
    slot: epochInfo.absoluteSlot,
    epoch: epochInfo.epoch,
    slotsLeftInEpoch: epochInfo.slotsInEpoch - epochInfo.slotIndex,
    tokenAccountRentLamports,
    gates,
  };
}

/** Activation times never change, so each is looked up once per process. */
async function blockTime(
  rpc: RentStatusRpc,
  slot: bigint,
  cache: Map<bigint, number>,
  abortSignal: AbortSignal,
) {
  const cached = cache.get(slot);
  if (cached !== undefined) return cached;
  try {
    const time = await rpc.getBlockTime(slot).send({ abortSignal });
    if (time === null) return null;
    cache.set(slot, Number(time));
    return Number(time);
  } catch {
    // Not every RPC keeps old blocks. The slot alone still answers the question.
    abortSignal.throwIfAborted();
    return null;
  }
}

/**
 * The status is the same for everyone, so callers within the cache window
 * share one RPC read. That read runs under its own deadline; a caller that
 * gives up only stops waiting for it.
 */
export function cacheRentStatus(
  read: (signal: AbortSignal) => Promise<RentStatusScanResult>,
  { ttlMs = RENT_STATUS_CACHE_MS, now = Date.now } = {},
): RentStatusScan {
  let cached: { at: number; result: Promise<RentStatusScanResult> } | null =
    null;
  return (signal) => {
    if (!cached || now() - cached.at >= ttlMs) {
      const result = read(AbortSignal.timeout(SCAN_TIMEOUT_MS));
      const entry = { at: now(), result };
      cached = entry;
      result.catch(() => {
        if (cached === entry) cached = null;
      });
    }
    return untilAborted(cached.result, signal);
  };
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** RPC credentials stay on this server, as with the account scans. */
export function createRpcRentStatusScan(rpcUrl: string): RentStatusScan {
  const rpc = createSolanaRpc(rpcUrl);
  const blockTimes = new Map<bigint, number>();
  return cacheRentStatus((signal) => readRentStatus(rpc, signal, blockTimes));
}

const tokenAccountRent = (lamportsPerByte: bigint) =>
  (ACCOUNT_STORAGE_OVERHEAD + TOKEN_ACCOUNT_SIZE) * lamportsPerByte;

/** Whole percent below the original rate, e.g. 63 for step 3. */
const reductionPercent = (lamportsPerByte: bigint) =>
  Math.round(
    100 - (Number(lamportsPerByte) * 100) / Number(ORIGINAL_LAMPORTS_PER_BYTE),
  );

export function summarizeRentStatus(
  scan: RentStatusScanResult,
  now = new Date(),
) {
  const original = tokenAccountRent(ORIGINAL_LAMPORTS_PER_BYTE);
  const nextEpochAt = new Date(
    now.getTime() + Number(scan.slotsLeftInEpoch) * SLOT_MS,
  ).toISOString();
  const steps = RENT_REDUCTION_STEPS.map((step, i) => {
    const gate = scan.gates[i]!;
    const status =
      gate.activationSlot !== null
        ? ("active" as const)
        : gate.scheduled
          ? ("scheduled" as const)
          : ("not-scheduled" as const);
    return {
      step: step.step,
      simd: `SIMD-0437-${step.step}`,
      featureId: step.featureId,
      status,
      lamportsPerByte: Number(step.lamportsPerByte),
      reductionPercent: reductionPercent(step.lamportsPerByte),
      tokenAccountRentLamports: tokenAccountRent(
        step.lamportsPerByte,
      ).toString(),
      ...(gate.activationSlot !== null
        ? { activationSlot: gate.activationSlot.toString() }
        : {}),
      ...(gate.activationBlockTime !== null
        ? {
            activatedAt: new Date(
              gate.activationBlockTime * 1000,
            ).toISOString(),
          }
        : {}),
      ...(status === "scheduled" ? { expectedActivationAt: nextEpochAt } : {}),
    };
  });
  const active = steps.filter((s) => s.status === "active");
  const latest = active.at(-1);
  const pending = steps.filter((s) => s.status !== "active");
  const next = pending[0];
  const final = RENT_REDUCTION_STEPS.at(-1)!;
  const current = scan.tokenAccountRentLamports;
  const lamportsPerByte =
    current / (ACCOUNT_STORAGE_OVERHEAD + TOKEN_ACCOUNT_SIZE);
  const beforeEarliest =
    now.toISOString().slice(0, 10) < EARLIEST_NEXT_ACTIVATION;

  const notes = [
    "Each step sets the rent rate directly, so the newest active step decides the current rent. Steps activate independently at epoch boundaries and can be put on hold.",
    "Rent cuts don't change what closing an empty account returns: closing always refunds the whole deposit, so there is no reason to wait to close empty accounts. Accounts and mints that stay open free more excess rent with each step.",
    "The current rent comes from the RPC's live rent-exempt minimum. Per-step figures are the published SIMD-0437 rates for a 165-byte token account.",
  ];
  if (latest && BigInt(latest.lamportsPerByte) !== lamportsPerByte)
    notes.push(
      `The live rent rate (${lamportsPerByte} lamports per byte) differs from the published rate for step ${latest.step}. The live figure is what the network charges.`,
    );
  if (next)
    notes.push(
      beforeEarliest
        ? `Steps ${pending.map((s) => s.step).join(", ")} can activate no earlier than ${EARLIEST_NEXT_ACTIVATION}, when Agave v4.4 is scheduled to resume mainnet feature activation. The date is tentative.`
        : `Agave v4.4 was scheduled to resume mainnet feature activation on ${EARLIEST_NEXT_ACTIVATION}. A step activates at the epoch boundary after its feature gate is scheduled.`,
    );

  const suggestion = next
    ? `More rent reduction is still to come. To hear when step ${next.step} goes live, ask your assistant to run this check again${beforeEarliest ? ` after ${EARLIEST_NEXT_ACTIVATION}` : " in a few days"}, for example as a reminder or scheduled task; this server can't send notifications. Meanwhile, the BlastCtrl reclaim app (${RECLAIM_URL}) can close empty token accounts now and reclaim excess rent from the rest.`
    : `All five rent reduction steps are live. Accounts opened before the reductions now hold the most excess rent they will; reclaim it in the BlastCtrl app (${RECLAIM_URL}) or check an address first with analyze_rent_reclaim.`;

  return {
    network: "mainnet-beta" as const,
    checkedAt: now.toISOString(),
    slot: scan.slot.toString(),
    epoch: scan.epoch.toString(),
    latestActiveStep: latest?.step ?? 0,
    moreReductionPending: !!next,
    current: {
      lamportsPerByte: Number(lamportsPerByte),
      reductionPercent: reductionPercent(lamportsPerByte),
      tokenAccountRentLamports: current.toString(),
      tokenAccountRentSol: solString(current),
    },
    steps,
    // A token account opened at the original rate still holds that deposit.
    legacyTokenAccount: {
      depositLamports: original.toString(),
      excessNowLamports: (original - current).toString(),
      excessNowSol: solString(original - current),
      excessAfterAllStepsLamports: (
        original - tokenAccountRent(final.lamportsPerByte)
      ).toString(),
      excessAfterAllStepsSol: solString(
        original - tokenAccountRent(final.lamportsPerByte),
      ),
    },
    ...(next
      ? {
          nextStep: {
            step: next.step,
            status: next.status,
            earliestActivationDate: EARLIEST_NEXT_ACTIVATION,
            ...(next.expectedActivationAt
              ? { expectedActivationAt: next.expectedActivationAt }
              : {}),
          },
        }
      : {}),
    reclaimUrl: RECLAIM_URL,
    suggestion,
    notes,
  };
}

/** One paragraph for clients that only read text content. */
export function describeRentStatus(
  result: ReturnType<typeof summarizeRentStatus>,
) {
  const live = result.steps
    .filter((s) => s.status === "active")
    .map(
      (s) =>
        `step ${s.step} (${s.reductionPercent}% lower${s.activatedAt ? `, activated ${s.activatedAt.slice(0, 10)}` : `, slot ${s.activationSlot}`})`,
    );
  const scheduled = result.steps.filter((s) => s.status === "scheduled");
  return [
    `Solana rent reduction (SIMD-0437) on mainnet-beta: ${live.length ? `live: ${live.join(", ")}.` : "no steps are live yet."}`,
    scheduled.length
      ? `Scheduled for the next epoch boundary (about ${scheduled[0]!.expectedActivationAt}): step ${scheduled.map((s) => s.step).join(", ")}.`
      : "",
    `A 165-byte token account now needs ${result.current.tokenAccountRentSol} SOL of rent (${result.current.reductionPercent}% below the original 0.00203928 SOL); one opened before the cuts holds ${result.legacyTokenAccount.excessNowSol} SOL of excess, rising to ${result.legacyTokenAccount.excessAfterAllStepsSol} SOL after step 5.`,
    result.suggestion,
  ]
    .filter(Boolean)
    .join(" ");
}
