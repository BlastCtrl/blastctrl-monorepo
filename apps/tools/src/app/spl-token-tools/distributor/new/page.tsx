"use client";

import React, { useState } from "react";
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
  const [step, setStep] = useState<number>(1);
  const [airdropDetails, setAirdropDetails] = useState<AirdropDetails>({
    airdropType: "same",
    amount: "",
    recipients: [],
  });

  const handleSubmitFirstStep = (data: AirdropDetails): void => {
    setAirdropDetails(data);
    console.log("first step submit");
    setStep(2);
  };

  const handleBack = (): void => {
    setStep(1);
  };

  const handleConfirm = (): void => {
    // Here you would implement the actual transaction logic
    console.log("Airdrop confirmed with details:", airdropDetails);
    // For demo purposes we could show a success message or redirect
    alert("Airdrop initiated!");
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
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
