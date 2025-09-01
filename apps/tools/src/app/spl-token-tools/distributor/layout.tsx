import { Box } from "./box";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const DynamicSolaceProvider = dynamic(
  () => import("./solace-provider").then((mod) => mod.SolaceProvider),
  {
    ssr: false,
  },
);

export default function Distributor({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl sm:p-4">
      <Box className="mb-6">
        <h1 className="font-display flex items-center text-3xl font-semibold">
          Solace Airdropper
          {/* <span className="ml-2 flex items-center align-middle text-sm text-gray-500">
            <span className="italic">/soʊlɑː.tʃe/</span>
          </span> */}
        </h1>
        <div className="mt-3 text-gray-500 sm:text-sm">
          <p>
            Distribute SOL or SPL tokens to many wallets using this tool. We will not ask you
            to transfer the tokens initially to our service, all tokens will be
            sent from your wallet directly. Due to the nature of Solana
            transactions having a chance of not being included in the block or
            expiring, you might need to resign transactions so that the transfer
            can be retried if they are not confirmed.
          </p>
        </div>
      </Box>
      <DynamicSolaceProvider>{children}</DynamicSolaceProvider>
    </div>
  );
}
