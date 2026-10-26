"use client";

import { notify } from "@/components/notification";
import { MINT_EXTENSION } from "@blastctrl/kit-extensions";
import { useMintAccount } from "@/state/queries/use-mint";
import { useSolBalance } from "@/state/queries/use-sol-balance";
import type { Address } from "@solana/kit";
import React from "react";
import { Box } from "../box";
import SolaceAirdropReview from "./airdrop-review";
import SolaceAirdropper from "./airdrop-start";

// Define types
type Recipient = {
  address: string;
  amount: string;
};

type AirdropType = "same" | "different";
type TokenType = "sol" | "custom";

interface AirdropDetails {
  airdropType: AirdropType;
  amount: string;
  recipients: Recipient[];
  totalSol?: string;
  tokenType: TokenType;
  mintAddress: string;
  decimals?: number;
  /** The program owning the mint (Token or Token-2022); set once the mint is fetched. */
  tokenProgram?: Address;
}

const SOL_DECIMALS = 9;

/**
 * Token-2022 extensions the airdropper cannot send yet. A transfer hook needs
 * extra accounts the backend rejects; a transfer fee would land on chain with
 * recipients receiving less than recorded. Stop before anything is signed.
 */
const unsupportedMintExtension = (extensions: number[]): string | null => {
  if (extensions.includes(MINT_EXTENSION.TransferHook)) return "transfer hook";
  if (extensions.includes(MINT_EXTENSION.TransferFeeConfig)) {
    return "transfer fee";
  }
  return null;
};

export default function CreateNewFlow() {
  const { data: balance } = useSolBalance();
  const [step, setStep] = React.useState<number>(1);
  const [airdropDetails, setAirdropDetails] = React.useState<AirdropDetails>({
    airdropType: "same",
    amount: "",
    recipients: [],
    tokenType: "sol",
    mintAddress: "",
    decimals: undefined,
  });

  const handleSubmitFirstStep = async (data: AirdropDetails): Promise<void> => {
    setAirdropDetails(data);
    if (data.tokenType === "custom") {
      setStep(1.5); // Go to pending state to fetch token data
    } else {
      setStep(2); // Go directly to review for SOL
    }
  };

  const handleBack = (): void => {
    setStep(1);
  };

  const handleTokenDataFetched = (mint: {
    decimals: number;
    tokenProgram: Address;
  }): void => {
    setAirdropDetails((prev) => ({ ...prev, ...mint }));
    setStep(2);
  };

  const handleTokenDataError = (): void => {
    setStep(1);
  };

  return (
    <div>
      {step === 1 && <SolaceAirdropper onNext={handleSubmitFirstStep} />}

      {step === 1.5 && (
        <TokenDataFetcher
          mintAddress={airdropDetails.mintAddress}
          onSuccess={handleTokenDataFetched}
          onError={handleTokenDataError}
        />
      )}

      {step === 2 && (
        <SolaceAirdropReview
          balance={balance ?? 0}
          airdropType={airdropDetails.airdropType}
          amount={airdropDetails.amount}
          recipients={airdropDetails.recipients}
          tokenType={airdropDetails.tokenType}
          mintAddress={airdropDetails.mintAddress}
          decimals={
            airdropDetails.tokenType === "sol"
              ? SOL_DECIMALS
              : (airdropDetails.decimals ?? 0)
          }
          tokenProgram={airdropDetails.tokenProgram}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

interface TokenDataFetcherProps {
  mintAddress: string;
  onSuccess: (mint: { decimals: number; tokenProgram: Address }) => void;
  onError: () => void;
}

/** Reads the mint account for its decimals and owning program before the review step. */
const TokenDataFetcher: React.FC<TokenDataFetcherProps> = ({
  mintAddress,
  onSuccess,
  onError,
}) => {
  const { data: mint, isLoading, isError, error } = useMintAccount(mintAddress);

  React.useEffect(() => {
    if (isLoading) return;

    if (isError || !mint) {
      notify({
        type: "error",
        title: "Token data fetch failed",
        description:
          error?.message ||
          "Could not fetch token information. Please check the mint address.",
      });
      onError();
      return;
    }

    const unsupported = unsupportedMintExtension(mint.extensions);
    if (unsupported) {
      notify({
        type: "error",
        title: "Token not supported yet",
        description: `This mint uses the Token-2022 ${unsupported} extension, which the airdropper cannot distribute yet.`,
      });
      onError();
      return;
    }

    onSuccess({ decimals: mint.decimals, tokenProgram: mint.programAddress });
  }, [mint, isLoading, isError, error, onSuccess, onError]);

  return (
    <Box className="flex flex-col items-center justify-center py-12">
      <div className="mb-4">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-t-indigo-600 border-r-indigo-200 border-b-indigo-200 border-l-indigo-200"></div>
      </div>
      <h2 className="mb-2 text-lg font-semibold">Fetching Token Information</h2>
      <p className="text-center text-sm text-gray-500">
        Getting token details for mint address:
        <br />
        <span className="font-mono text-xs">{mintAddress}</span>
      </p>
    </Box>
  );
};
