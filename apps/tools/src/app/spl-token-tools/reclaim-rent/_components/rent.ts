import {
  ACCOUNT_STORAGE_OVERHEAD,
  ORIGINAL_LAMPORTS_PER_BYTE,
  RENT_REDUCTION_STEPS,
  type RentReductionStatus,
} from "@blastctrl/rent-reclaimer";

export { ACCOUNT_STORAGE_OVERHEAD, ORIGINAL_LAMPORTS_PER_BYTE };
export const TOKEN_ACCOUNT_SIZE = 165;

/**
 * How far a cluster is through the SIMD-0437 rent reduction: the live rate,
 * and what each step's feature gate says about what comes next. Read from
 * the chain, on the server for the first paint and in the browser after.
 */
export type RentStatus = RentReductionStatus;

/** Keyed by cluster: they move through the reduction at different times. */
export const rentStatusKey = (network: string) =>
  ["rent-status", network] as const;

export type RentStep = {
  label: string;
  lamportsPerByte: number;
};

/** The original rate, then SIMD-0437's five feature-gated reductions. */
export const RENT_STEPS: RentStep[] = [
  { label: "Original", lamportsPerByte: ORIGINAL_LAMPORTS_PER_BYTE },
  ...RENT_REDUCTION_STEPS.map((s) => ({
    label: `Step ${s.step}`,
    lamportsPerByte: s.lamportsPerByte,
  })),
];

export type RentStepStatus = "past" | "current" | "upcoming";

/**
 * Which step the chain is on for a live rate. The current step is the last
 * one whose rate is at or above the live value, so a rate between two steps
 * (or a reset back up) still lands somewhere sensible.
 */
export function currentStepIndex(lamportsPerByte: number) {
  const index = RENT_STEPS.findIndex(
    (s) => s.lamportsPerByte < lamportsPerByte,
  );
  return index === -1 ? RENT_STEPS.length - 1 : Math.max(0, index - 1);
}

export function stepStatus(
  index: number,
  lamportsPerByte: number,
): RentStepStatus {
  const current = currentStepIndex(lamportsPerByte);
  return index < current ? "past" : index === current ? "current" : "upcoming";
}

/** How many reductions are still to come. */
export function remainingSteps(lamportsPerByte: number) {
  return RENT_STEPS.length - 1 - currentStepIndex(lamportsPerByte);
}

/**
 * Whether the gate of the step at `index` in {@link RENT_STEPS} is set to go
 * live at the next epoch boundary. The gates start at step 1, so the gate of
 * `RENT_STEPS[i]` is `gates[i - 1]`.
 */
export function isScheduled(status: RentStatus, index: number) {
  return status.gates?.[index - 1] === "scheduled";
}

/**
 * When rent drops next. "scheduled" means a remaining step goes live at the
 * next epoch boundary; no date is put on that, since it would take guessing
 * the slot time. "unscheduled" means the gates were read and none of the
 * remaining steps is set to go live. "unknown" means the gates couldn't be
 * read. "none" means the last step is live.
 */
export type NextDrop = "none" | "scheduled" | "unscheduled" | "unknown";

export function nextDrop(status: RentStatus): NextDrop {
  const current = currentStepIndex(status.lamportsPerByte);
  if (current === RENT_STEPS.length - 1) return "none";
  if (!status.gates) return "unknown";
  return RENT_STEPS.some((_, i) => i > current && isScheduled(status, i))
    ? "scheduled"
    : "unscheduled";
}

/**
 * When to come back for more, for wherever there's nothing left to reclaim.
 * Empty once the last step is live, and until the status has loaded.
 */
export function checkBackNote(status: RentStatus | null) {
  switch (status ? nextDrop(status) : "none") {
    case "none":
      return "";
    case "scheduled":
      return "Rent drops again at the next epoch, so check back soon.";
    case "unscheduled":
      return "Rent is set to drop again, but the next step isn't scheduled yet. Check back later.";
    case "unknown":
      return "Rent is set to drop again, so check back later.";
  }
}

export {
  ACCOUNTS_PER_TRANSACTION,
  FEE_PER_TRANSACTION,
} from "@blastctrl/rent-reclaimer";

export function minimumBalance(dataLength: number, lamportsPerByte: number) {
  return (ACCOUNT_STORAGE_OVERHEAD + dataLength) * lamportsPerByte;
}

/** What a token account paid for at the original rate still holds. */
export const TOKEN_ACCOUNT_DEPOSIT = minimumBalance(
  TOKEN_ACCOUNT_SIZE,
  ORIGINAL_LAMPORTS_PER_BYTE,
);

/** How much of that deposit is excess at a rate, in lamports. */
export function tokenAccountExcess(lamportsPerByte: number) {
  return (
    TOKEN_ACCOUNT_DEPOSIT - minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte)
  );
}

export function formatSol(
  lamports: number,
  maximumFractionDigits = 6,
  minimumFractionDigits = 0,
) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(lamports / 1_000_000_000);
}
