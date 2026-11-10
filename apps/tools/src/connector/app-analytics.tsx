"use client";

import {
  redactEvent,
  setAnalyticsContext,
  setAnalyticsTool,
  toolFromSegments,
  walletLabel,
} from "@/lib/analytics";
import type { ConnectorState } from "@solana/connector";
import { useConnectorClient } from "@solana/connector/react";
import { Analytics } from "@vercel/analytics/next";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect } from "react";

function contextFrom(state: ConnectorState) {
  return {
    wallet: walletLabel(
      state.wallet.status === "connected"
        ? state.wallet.session.connectorId
        : null,
    ),
    mainnet: state.cluster?.id === "solana:mainnet",
  };
}

/**
 * Vercel Analytics, with URLs redacted, plus the wallet and cluster that
 * custom events report. Must render inside the connector provider.
 */
export function AppAnalytics() {
  const client = useConnectorClient();
  // Segments name the rendered page even when a rewrite changes its public
  // pathname, as in `SiteChrome`.
  const tool = toolFromSegments(useSelectedLayoutSegments());

  useEffect(() => {
    setAnalyticsTool(tool);
  }, [tool]);

  useEffect(() => {
    if (!client) return;
    const sync = () => setAnalyticsContext(contextFrom(client.getSnapshot()));
    sync();
    return client.subscribe(sync);
  }, [client]);

  return <Analytics beforeSend={redactEvent} />;
}
