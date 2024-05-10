// ----------------------------------------------------
// These types are copied from jup.ag OpenAPI schema
// https://station.jup.ag/api-v6/post-swap-instructions
// ----------------------------------------------------

export type JupiterQuoteResponseSchema = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee?: {
    amount?: string;
    feeBps?: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label?: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
};

export type Account = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type Instruction = {
  programId: string;
  accounts: Account[];
  data: string;
};

export type JupiterSwapInstructionsApiResponse = {
  tokenLedgerInstruction?: Instruction;
  otherInstructions: Instruction[];
  computeBudgetInstructions: Instruction[];
  setupInstructions: Instruction[];
  swapInstruction: Instruction;
  cleanupInstruction?: Instruction;
  addressLookupTableAddresses?: string[];
};
