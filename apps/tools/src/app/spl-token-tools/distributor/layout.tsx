import { Box } from "./box";
import type { ReactNode } from "react";

export default function Distributor({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 max-w-5xl mx-auto">
      <Box className="mb-6">
        <h1 className="font-display text-3xl font-semibold flex items-center">
          Solace Airdropper
          <span className="ml-2 text-sm text-gray-500 align-middle flex items-center">
            <span className="italic">/soʊlɑː.tʃe/</span>
          </span>
        </h1>
        <div className="mt-3 text-sm text-gray-500">
          <p>
            Distribute SOL to many wallets using this tool. We will not ask you
            to transfer the SOL initially to our service, all the SOL will be
            sent from your wallet directly. Due to the nature of Solana
            transactions having a chance of not being included in the block or
            expiring, you might need to resign transactions so that the transfer
            can be retried if they are not confirmed.
          </p>
        </div>
      </Box>
      {children}
    </div>
  );
}
