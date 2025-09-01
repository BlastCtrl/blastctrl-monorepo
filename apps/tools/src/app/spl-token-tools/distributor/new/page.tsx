"use client";

import React from "react";
import SolaceAirdropper from "./airdrop-start";
import SolaceAirdropReview from "./airdrop-review";
import { useSolBalance } from "@/state/queries/use-sol-balance";
import { useAssetData } from "@/state/queries/use-asset-data";
import { notify } from "@/components/notification";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { Box } from "../box";

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
}

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

  const handleTokenDataFetched = (decimals: number): void => {
    setAirdropDetails(prev => ({ ...prev, decimals }));
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
          decimals={airdropDetails.decimals ?? 0}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

interface TokenDataFetcherProps {
  mintAddress: string;
  onSuccess: (decimals: number) => void;
  onError: () => void;
}

const TokenDataFetcher: React.FC<TokenDataFetcherProps> = ({
  mintAddress,
  onSuccess,
  onError,
}) => {
  const { data: assetData, isLoading, isError, error } = useAssetData(mintAddress);

  React.useEffect(() => {
    if (isLoading) return;

    if (isError || !assetData?.token_info?.decimals) {
      notify({
        type: "error",
        title: "Token data fetch failed",
        description: error?.message || "Could not fetch token information. Please check the mint address.",
      });
      onError();
      return;
    }

    if (assetData.token_info.decimals !== undefined) {
      onSuccess(assetData.token_info.decimals);
    }
  }, [assetData, isLoading, isError, error, onSuccess, onError]);

  return (
    <Box className="flex flex-col items-center justify-center py-12">
      <div className="mb-4">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-b-indigo-200 border-l-indigo-200 border-r-indigo-200 border-t-indigo-600"></div>
      </div>
      <h2 className="mb-2 text-lg font-semibold">Fetching Token Information</h2>
      <p className="text-center text-sm text-gray-500">
        Getting token details for mint address:<br />
        <span className="font-mono text-xs">{mintAddress}</span>
      </p>
    </Box>
  );
}
