import {
  estimateAndSetResourceLimitsFactory,
  estimateResourceLimitsFactory,
} from "@solana/kit";

type EstimateResourceLimits = ReturnType<typeof estimateResourceLimitsFactory>;
type EstimateRpc = Parameters<typeof estimateResourceLimitsFactory>[0]["rpc"];

/** Adds headroom to a simulated compute estimate, like the client's executor does. */
export const withComputeUnitBuffer =
  (estimate: EstimateResourceLimits): EstimateResourceLimits =>
  async (message, config) => {
    const limits = await estimate(message, config);
    return {
      ...limits,
      computeUnitLimit: Math.min(
        1_400_000,
        Math.ceil(limits.computeUnitLimit * 1.1) + 300,
      ),
    };
  };

/**
 * Simulates a message to estimate its resource limits, adds headroom, and
 * writes them into the message. For pipelines that sign without the client's
 * executor: batch signing, or transactions handed to a backend to send.
 */
export const estimateAndSetResourceLimitsWithBuffer = (rpc: EstimateRpc) =>
  estimateAndSetResourceLimitsFactory(
    withComputeUnitBuffer(estimateResourceLimitsFactory({ rpc })),
  );
