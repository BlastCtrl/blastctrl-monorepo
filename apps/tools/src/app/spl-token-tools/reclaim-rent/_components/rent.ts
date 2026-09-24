export const ACCOUNT_STORAGE_OVERHEAD = 128;
export const TOKEN_ACCOUNT_SIZE = 165;

export const ORIGINAL_LAMPORTS_PER_BYTE = 6960;

/**
 * Used until the live rate has loaded. Everything that matters (the excess
 * per account) uses minimums fetched from the RPC, never this.
 */
export const FALLBACK_LAMPORTS_PER_BYTE = 5080;

export type RentStep = {
  label: string;
  lamportsPerByte: number;
};

// SIMD-0437: five feature-gated reductions of lamports_per_byte. Steps 1 and
// 2 went live in September 2026; the rest are expected in November.
export const RENT_STEPS: RentStep[] = [
  { label: "Original", lamportsPerByte: 6960 },
  { label: "Step 1", lamportsPerByte: 6333 },
  { label: "Step 2", lamportsPerByte: 5080 },
  { label: "Step 3", lamportsPerByte: 2575 },
  { label: "Step 4", lamportsPerByte: 1322 },
  { label: "Step 5", lamportsPerByte: 696 },
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

export const ACCOUNTS_PER_TRANSACTION = 20;
export const FEE_PER_TRANSACTION = 5000;

export function minimumBalance(dataLength: number, lamportsPerByte: number) {
  return (ACCOUNT_STORAGE_OVERHEAD + dataLength) * lamportsPerByte;
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
