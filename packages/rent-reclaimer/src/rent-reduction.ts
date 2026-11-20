import {
  address,
  fetchEncodedAccounts,
  type Address,
  type GetEpochInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";

export const FEATURE_PROGRAM_ADDRESS = address(
  "Feature111111111111111111111111111111111111",
);
/** Rent before SIMD-0437, in lamports per byte. */
export const ORIGINAL_LAMPORTS_PER_BYTE = 6960;
/** Every account pays for 128 bytes of metadata on top of its data. */
export const ACCOUNT_STORAGE_OVERHEAD = 128;
/** Mainnet's target slot time, for estimating when the epoch ends. */
const SLOT_MS = 400;

/**
 * SIMD-0437's five steps. Each has its own feature gate and sets lamports
 * per byte outright, not relative to the step before it.
 */
export const RENT_REDUCTION_STEPS = [
  {
    step: 1,
    featureId: address("4a6f7o7iTcA8hRDCrPLkSatnt5Ykxiu36wo5p1Tt12wC"),
    lamportsPerByte: 6333,
  },
  {
    step: 2,
    featureId: address("61BtM7BkDEE8Yq5fskEVAQT9mYA8qCejJWoLe5apqg81"),
    lamportsPerByte: 5080,
  },
  {
    step: 3,
    featureId: address("Ftxb3ZKq7aNqgxDBbP7EonvR2RszZk9ctjdsTX38kQaz"),
    lamportsPerByte: 2575,
  },
  {
    step: 4,
    featureId: address("GsUBNYNDPdMLHPD37TToHzrzcNcjpC9w5n1EcJk5iTaM"),
    lamportsPerByte: 1322,
  },
  {
    step: 5,
    featureId: address("mZdnRh9T2EbDNvqKjkCR3bvo5c816tJaojtE9Xs7iuY"),
    lamportsPerByte: 696,
  },
] as const;

/**
 * Where a step's feature gate stands. No feature account means nobody has
 * scheduled the step. An account without a slot means it goes live at the
 * next epoch boundary. An account with a slot went live at that slot.
 */
export type RentGateStatus = "active" | "scheduled" | "not-scheduled";

export type RentGate = {
  step: number;
  featureId: Address;
  status: RentGateStatus;
  /** The slot the step went live at, once it has. */
  activationSlot: bigint | null;
};

/**
 * How far the cluster is through the rent reduction. Plain numbers and
 * strings only, so a server can hand it to the browser as it is.
 */
export type RentReductionStatus = {
  /** When this was read, in Unix milliseconds. */
  readAt: number;
  /** The live rate: what the cluster charges now, whatever the gates say. */
  lamportsPerByte: number;
  /**
   * One per step of {@link RENT_REDUCTION_STEPS}, in order. Null when the
   * gate accounts couldn't be read; the rate alone still says which step is
   * live, only not what is scheduled next.
   */
  gates: RentGateStatus[] | null;
  /**
   * Roughly when the next epoch starts, in Unix milliseconds: the moment a
   * scheduled step goes live. Null along with `gates`.
   */
  nextEpochAt: number | null;
};

export type RentReductionRpc = Rpc<
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

/** Rent-exempt minimum, in lamports, of an account with `dataLength` bytes. */
export function rentExemptMinimum(dataLength: number, lamportsPerByte: number) {
  return (ACCOUNT_STORAGE_OVERHEAD + dataLength) * lamportsPerByte;
}

/** The five feature gates, in step order, in one `getMultipleAccounts`. */
export async function readRentGates(
  rpc: Rpc<GetMultipleAccountsApi>,
  abortSignal?: AbortSignal,
): Promise<RentGate[]> {
  const accounts = await fetchEncodedAccounts(
    rpc,
    RENT_REDUCTION_STEPS.map((s) => s.featureId),
    { abortSignal },
  );
  return accounts.map((account, i): RentGate => {
    const { step, featureId } = RENT_REDUCTION_STEPS[i]!;
    if (!account.exists || account.programAddress !== FEATURE_PROGRAM_ADDRESS) {
      return { step, featureId, status: "not-scheduled", activationSlot: null };
    }
    const activationSlot = decodeFeature(account.data);
    return {
      step,
      featureId,
      status: activationSlot === null ? "scheduled" : "active",
      activationSlot,
    };
  });
}

/**
 * The cluster's rent reduction status in three parallel requests. The rate
 * comes from the rent-exempt minimum of a zero-byte account, which is
 * exactly the storage overhead times lamports per byte. The gates and the
 * epoch only say what is scheduled next, so if they fail the rate is still
 * returned, with `gates` and `nextEpochAt` null.
 */
export async function readRentReductionStatus(
  rpc: RentReductionRpc,
  {
    abortSignal,
    now = Date.now,
  }: { abortSignal?: AbortSignal; now?: () => number } = {},
): Promise<RentReductionStatus> {
  const [minimum, schedule] = await Promise.all([
    rpc.getMinimumBalanceForRentExemption(0n).send({ abortSignal }),
    Promise.all([
      readRentGates(rpc, abortSignal),
      rpc.getEpochInfo().send({ abortSignal }),
    ]).catch(() => null),
  ]);
  const readAt = now();
  const [gates, epoch] = schedule ?? [null, null];
  return {
    readAt,
    lamportsPerByte: Number(minimum) / ACCOUNT_STORAGE_OVERHEAD,
    gates: gates && gates.map((gate) => gate.status),
    nextEpochAt:
      epoch && readAt + Number(epoch.slotsInEpoch - epoch.slotIndex) * SLOT_MS,
  };
}
