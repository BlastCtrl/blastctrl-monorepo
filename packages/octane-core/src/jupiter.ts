import {
  AccountRole,
  address,
  getBase64Encoder,
  type Address,
  type Instruction,
} from "@solana/kit";

// ----------------------------------------------------
// These types follow the Jupiter swap API schema
// https://dev.jup.ag/docs/swap-api
// ----------------------------------------------------

export type JupiterQuote = {
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

/** An instruction as the API serialises it: base58 keys, base64 data. */
export type JupiterApiInstruction = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

type JupiterSwapInstructionsResponse = {
  tokenLedgerInstruction?: JupiterApiInstruction;
  otherInstructions: JupiterApiInstruction[];
  computeBudgetInstructions: JupiterApiInstruction[];
  setupInstructions: JupiterApiInstruction[];
  swapInstruction: JupiterApiInstruction;
  cleanupInstruction?: JupiterApiInstruction;
  addressLookupTableAddresses?: string[];
};

export const WSOL_MINT = address("So11111111111111111111111111111111111111112");

const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

/** A quote and the instructions Jupiter built for it, as kit instructions. */
export type JupiterSwap = {
  quote: JupiterQuote;
  /** In the order Jupiter gave them: the limit, then the price. */
  computeBudgetInstructions: Instruction[];
  setupInstructions: Instruction[];
  swapInstruction: Instruction;
  cleanupInstruction: Instruction | null;
  otherInstructions: Instruction[];
  /** The tables the swap instruction's accounts are looked up in. */
  addressLookupTableAddresses: Address[];
};

/**
 * Asks Jupiter for a quote on swapping `amount` (raw units) of `inputMint` to
 * SOL, then for the instructions that carry it out. Jupiter is told to wrap
 * and unwrap SOL and to size the compute budget and priority fee itself.
 */
export async function getJupiterSwapToSol(params: {
  user: Address;
  inputMint: Address;
  amount: bigint;
  slippageBps: number;
}): Promise<JupiterSwap> {
  const quoteUrl = new URL(`${JUPITER_API}/quote`);
  quoteUrl.search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: WSOL_MINT,
    amount: params.amount.toString(),
    slippageBps: params.slippageBps.toString(),
  }).toString();
  const quote = await jupiterRequest<JupiterQuote>(
    quoteUrl,
    undefined,
    "get quote for trade",
  );

  const instructions = await jupiterRequest<JupiterSwapInstructionsResponse>(
    `${JUPITER_API}/swap-instructions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: params.user,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    },
    "get swap instructions",
  );

  return {
    quote,
    computeBudgetInstructions:
      instructions.computeBudgetInstructions.map(toInstruction),
    setupInstructions: instructions.setupInstructions.map(toInstruction),
    swapInstruction: toInstruction(instructions.swapInstruction),
    cleanupInstruction: instructions.cleanupInstruction
      ? toInstruction(instructions.cleanupInstruction)
      : null,
    otherInstructions: instructions.otherInstructions.map(toInstruction),
    addressLookupTableAddresses: (
      instructions.addressLookupTableAddresses ?? []
    ).map((table) => address(table)),
  };
}

/** A Jupiter response as JSON; a failed request or an `error` field throws with what Jupiter said. */
async function jupiterRequest<T>(
  url: string | URL,
  init: RequestInit | undefined,
  what: string,
): Promise<T> {
  let body: (T & { error?: string }) | undefined;
  try {
    const response = await fetch(url, init);
    body = (await response.json()) as T & { error?: string };
    if (body.error) throw Error(body.error);
    if (!response.ok) throw Error(`${response.status} ${response.statusText}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw Error(`Failed to ${what}: ${reason}`, { cause: err });
  }
  return body;
}

/** A Jupiter instruction as kit's `{ programAddress, accounts, data }`. */
export function toInstruction(instruction: JupiterApiInstruction): Instruction {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.accounts.map((account) => ({
      address: address(account.pubkey),
      role: account.isSigner
        ? account.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : account.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: getBase64Encoder().encode(instruction.data),
  };
}
