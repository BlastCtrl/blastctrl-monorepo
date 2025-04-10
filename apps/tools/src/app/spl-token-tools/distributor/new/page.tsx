"use client";

import React from "react";
import SolaceAirdropper from "./airdrop-start";
import SolaceAirdropReview from "./airdrop-review";

// Define types
type Recipient = {
  address: string;
  amount: string;
};

type AirdropType = "same" | "different";

interface AirdropDetails {
  airdropType: AirdropType;
  amount: string;
  recipients: Recipient[];
  totalSol?: string;
}

export default function CreateNewFlow() {
  const [step, setStep] = React.useState<number>(1);
  const [airdropDetails, setAirdropDetails] = React.useState<AirdropDetails>({
    airdropType: "same",
    amount: "",
    recipients: [],
  });

  const handleSubmitFirstStep = (data: AirdropDetails): void => {
    setAirdropDetails(data);
    setStep(2);
  };

  const handleBack = (): void => {
    setStep(1);
  };

  return (
    <div>
      {step === 1 && <SolaceAirdropper onNext={handleSubmitFirstStep} />}

      {step === 2 && (
        <SolaceAirdropReview
          airdropType={airdropDetails.airdropType}
          amount={airdropDetails.amount}
          recipients={airdropDetails.recipients}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
