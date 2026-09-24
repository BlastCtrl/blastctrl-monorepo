import { PublicKey, SystemProgram } from "@solana/web3.js";

export type ServiceFee = {
  recipient: PublicKey;
  /** Share of the reclaimed excess, in basis points (500 = 5%). */
  basisPoints: number;
};

/**
 * Reads the fee from its two environment variables. Either one missing, or a
 * rate of zero, means the tool is free.
 */
export function parseServiceFee(
  recipient: string | undefined,
  basisPoints: string | undefined,
): ServiceFee | null {
  const bps = Number(basisPoints);
  if (!recipient || !Number.isInteger(bps) || bps <= 0 || bps > 10_000) {
    return null;
  }
  return { recipient: new PublicKey(recipient), basisPoints: bps };
}

// Both are inlined at build time, so they have to be spelled out in full.
export const SERVICE_FEE = parseServiceFee(
  process.env.NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT,
  process.env.NEXT_PUBLIC_RECLAIM_RENT_FEE_BPS,
);

/** The fee on this much reclaimed excess, rounded down to whole lamports. */
export function serviceFeeLamports(
  excessLamports: number,
  fee: ServiceFee | null = SERVICE_FEE,
) {
  return fee ? Math.floor((excessLamports * fee.basisPoints) / 10_000) : 0;
}

export function formatFeeRate(fee: ServiceFee) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(fee.basisPoints / 100)}%`;
}

/**
 * One transfer for the whole batch, paid by the wallet. It goes after the
 * withdrawals in the transaction, so the reclaimed SOL is there to pay it.
 * Returns nothing when the fee rounds down to zero.
 */
export function createServiceFeeInstruction(
  wallet: PublicKey,
  excessLamports: number,
  fee: ServiceFee,
) {
  const lamports = serviceFeeLamports(excessLamports, fee);
  if (lamports === 0) return null;
  return SystemProgram.transfer({
    fromPubkey: wallet,
    toPubkey: fee.recipient,
    lamports,
  });
}
