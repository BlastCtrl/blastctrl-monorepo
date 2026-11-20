import { env } from "@/env/server";
import { readRentReductionStatus } from "@blastctrl/rent-reclaimer";
import { createSolanaRpc } from "@solana/kit";
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";
import { rentStatusKey, type RentStatus } from "./rent";

/**
 * How long a read of the rent status is reused, in seconds. The status only
 * changes at an epoch boundary, and only five times in all. Pages that render {@link RentStatusBoundary} export the same number
 * as `revalidate`, where Next.js needs a literal.
 */
const REVALIDATE_SECONDS = 300;
/** A slow RPC shouldn't hold up the build or a page. */
const TIMEOUT_MS = 5_000;

/**
 * Mainnet's status over the server's private RPC, shared by every page and
 * visitor for five minutes. A failed read throws, so it isn't cached.
 */
const readMainnetRentStatus = unstable_cache(
  () =>
    readRentReductionStatus(createSolanaRpc(env.RPC_ENDPOINT), {
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  ["rent-reduction-status", "mainnet"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * The last good read on this server instance, for when the next one fails.
 * An old status beats none: it is dated, so the browser reads it again.
 */
let lastRead: RentStatus | null = null;

async function getMainnetRentStatus(): Promise<RentStatus | null> {
  try {
    lastRead = await readMainnetRentStatus();
  } catch (error) {
    // Not the message: an RPC error can carry the endpoint and its key.
    console.warn(
      "Couldn't read the rent reduction status on the server; the browser will.",
      error instanceof Error ? error.name : "",
    );
  }
  return lastRead;
}

/**
 * Renders its children with mainnet's rent status already in the query
 * cache, so `useRentStatus` has it on the first paint and in the HTML. If
 * no read has worked, the cache stays empty and the browser reads it instead.
 */
export async function RentStatusBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const status = await getMainnetRentStatus();
  const queryClient = new QueryClient();
  if (status) {
    // Dated when it was read, so the browser knows how old it is.
    queryClient.setQueryData(rentStatusKey("mainnet"), status, {
      updatedAt: status.readAt,
    });
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
