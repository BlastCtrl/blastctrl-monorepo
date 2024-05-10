import type { Connection } from "@solana/web3.js";
import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import type {
  Instruction,
  JupiterQuoteResponseSchema,
  JupiterSwapInstructionsApiResponse,
} from "./types";
import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const MESSAGE_TOKEN_KEY = "jupiter-swap";

// We always swap to SOL
const OUTPUT_MINT = "So11111111111111111111111111111111111111112";

/**
 * Gets the swap instructions from the jupiter swap API for the given parameters
 * The amount should be passed as the raw value (not normalized by the decimals).
 * Source: https://station.jup.ag/docs/apis/swap-api
 *
 * @param params swap parameters
 */
export async function getJupiterSwapInstructions(params: {
  wallet: string;
  inputMint: string;
  amount: string;
  slippageBps: number;
}) {
  // First we need to get the quote
  const quoteParams = new URLSearchParams();
  quoteParams.append("inputMint", params.inputMint);
  quoteParams.append("outputMint", OUTPUT_MINT);
  quoteParams.append("amount", params.amount.toString());
  quoteParams.append("slippageBps", params.slippageBps.toString());

  // TODO: use the .env variable here?
  const url = new URL("https://quote-api.jup.ag/v6/quote");
  url.search = quoteParams.toString();

  let quoteResponse: JupiterQuoteResponseSchema;
  try {
    quoteResponse = (await (
      await fetch(url)
    ).json()) as JupiterQuoteResponseSchema;

    // @ts-expect-error: If the response has an error
    if (quoteResponse.error) {
      // @ts-expect-error error
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw Error(quoteResponse.error);
    }
  } catch (err) {
    if (err instanceof Error) {
      throw Error(`Failed to get quote for trade: ${err.message}`);
    }
    throw Error("Failed to get quote for trade");
  }

  // Now that we have the quote, we can get the swap instructions
  // We use the quote response as the parameter.
  // We also enable: wrapAndUnwrap, dynamic compute units, auto priority fee
  let instructions: JupiterSwapInstructionsApiResponse;
  try {
    const response = await (
      await fetch("https://quote-api.jup.ag/v6/swap-instructions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: params.wallet,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      })
    ).json();
    if ((response as any)?.error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw Error((response as any).error);
    }
    instructions = response as JupiterSwapInstructionsApiResponse;
  } catch (err) {
    if (err instanceof Error) {
      throw Error(`Failed to get swap instructions: ${err.message}`);
    }
    throw Error("Failed to get swap response");
  }

  // Now we map these instructions to the web3.js objects
  // This can throw with deserialization errors, so it might be a good idea to
  // try to catch them because the messages are incomprehensible
  const tokenLedgerInstruction =
    instructions.tokenLedgerInstruction &&
    deserializeInstruction(instructions.tokenLedgerInstruction);

  const setupInstruction = instructions.setupInstructions.map(
    deserializeInstruction,
  );
  const computeBudgetInstructions = instructions.computeBudgetInstructions.map(
    deserializeInstruction,
  );
  const otherInstructions = instructions.otherInstructions.map(
    deserializeInstruction,
  );
  const swapInstruction = deserializeInstruction(instructions.swapInstruction);
  const cleanupInstructions =
    instructions.cleanupInstruction &&
    deserializeInstruction(instructions.cleanupInstruction);

  return {
    quoteResponse,
    swapInstructions: {
      tokenLedgerInstruction,
      setupInstruction,
      computeBudgetInstructions,
      otherInstructions,
      swapInstruction,
      cleanupInstructions,
      addressLookupTableAddresses:
        instructions.addressLookupTableAddresses ?? [],
    },
  };
}

/**
 * Transforms an instruction received from the jupiter swap API to a
 * web3.js TransactionInstruction object
 *
 * @param instruction
 * @returns
 */
export const deserializeInstruction = (
  instruction: Instruction,
): TransactionInstruction => {
  try {
    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((key) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    });
  } catch (e) {
    console.log(e);
    throw e;
  }
};

/**
 * Transforms an array of addresses into an array of web3.js AddressLookupTableAccount objects
 *
 * @param keys
 * @param connection
 * @returns
 */
export async function getAddressLookupTableAccounts(
  keys: string[],
  connection: Connection,
): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key)),
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress!),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
}

export function getCreateNativeAccountInstruction(
  feePayer: PublicKey,
  owner: PublicKey,
) {
  const nativeAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner);
  return createAssociatedTokenAccountIdempotentInstruction(
    feePayer,
    nativeAta,
    owner,
    NATIVE_MINT,
  );
}
