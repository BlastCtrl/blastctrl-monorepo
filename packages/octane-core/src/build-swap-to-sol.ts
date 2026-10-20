import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getBurnInstruction,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createNoopSigner,
  createTransactionMessage,
  getBase64Decoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type GetFeeForMessageApi,
  type GetLatestBlockhashApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type Transaction,
  type TransactionMessageBytesBase64,
  type TransactionWithBlockhashLifetime,
} from "@solana/kit";
import { getJupiterSwapToSol, WSOL_MINT, type JupiterQuote } from "./jupiter";
import { fetchAddressesByLookupTable } from "./lookup-tables";

export const BONK_MINT = address(
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
);

/**
 * Rent for a token account. The fee payer lays it out for the user's
 * wrapped-SOL account; the user gets it back when the account closes and
 * hands it on to the fee payer.
 */
export const LAMPORTS_PER_TOKEN_ACCOUNT = 2_039_280n;

/** A user may ask for the same mint again only after this long. */
const SAME_MINT_TIMEOUT_MS = 3_000;

export type SwapRpc = Rpc<
  GetLatestBlockhashApi & GetFeeForMessageApi & GetMultipleAccountsApi
>;

/**
 * Remembers when each user last asked for each mint, to turn away repeats.
 * It is a nicety: when it is unreachable, the swap is built anyway.
 */
export type SwapCache = {
  get(key: string): Promise<number | undefined>;
  set(key: string, value: number): Promise<unknown>;
};

export type SwapFees = {
  /** Octane's cut of the SOL the user receives, in basis points. */
  platformSolFeeBps: number;
  /** Burned from the input when it is BONK, in basis points. */
  bonkBurnFeeBps: number;
};

export type SwapToSol = {
  /** Signed by the fee payer; the user signs next, then anyone may send it. */
  transaction: Transaction & TransactionWithBlockhashLifetime;
  quote: JupiterQuote;
};

/**
 * Builds a transaction that swaps `amount` of `sourceMint` to SOL for `user`
 * with Octane's `feePayer` paying for it, signed by the fee payer. The user
 * pays the fee payer back out of the SOL received: the rent of the
 * wrapped-SOL account the fee payer creates, the transaction fee, and the
 * platform fee. Swapping BONK also burns a share of the input.
 */
export async function buildJupiterSwapToSOL({
  rpc,
  feePayer,
  user,
  sourceMint,
  amount,
  slippageBps,
  cache,
  fees,
}: {
  rpc: SwapRpc;
  feePayer: KeyPairSigner;
  user: Address;
  sourceMint: Address;
  /** In the mint's raw units. */
  amount: bigint;
  /** How far the price may move before Jupiter fails the swap, in basis points. */
  slippageBps: number;
  cache: SwapCache;
  fees: SwapFees;
}): Promise<SwapToSol> {
  if (amount <= 0n) {
    throw new Error("Amount can't be zero or less");
  }

  const key = `swap/${user}/${sourceMint}`;
  const lastAsked = await cache.get(key).catch(cacheUnavailable);
  if (lastAsked && Date.now() - lastAsked < SAME_MINT_TIMEOUT_MS) {
    throw new Error("Too many requests for same user and mint");
  }

  // SPECIAL CASE: swapping BONK burns a share of the amount, and the rest
  // is what gets swapped.
  const burnFee =
    sourceMint === BONK_MINT
      ? (amount * BigInt(fees.bonkBurnFeeBps)) / 10_000n
      : 0n;
  amount -= burnFee;

  const swap = await getJupiterSwapToSol({
    user,
    inputMint: sourceMint,
    amount,
    slippageBps,
  });

  // SOLFLARE SPECIAL CASE: Solflare likes to edit compute budget instructions.
  // In the opposite order, it leaves them alone.
  const computeBudgetInstructions = [
    ...swap.computeBudgetInstructions,
  ].reverse();

  const [addressesByLookupTable, [nativeAta], [sourceAta]] = await Promise.all([
    fetchAddressesByLookupTable(rpc, swap.addressLookupTableAddresses),
    findAssociatedTokenPda({
      owner: user,
      mint: WSOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
    findAssociatedTokenPda({
      owner: user,
      mint: sourceMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
  ]);

  // The user signs on their own wallet after the fee payer; here they are a
  // signer in name only.
  const userSigner = createNoopSigner(user);

  // Jupiter's own setup and cleanup are left out; the wrapped-SOL account is
  // created by the fee payer and closed to the user, who pays back from it.
  const setupInstruction = getCreateAssociatedTokenIdempotentInstruction({
    payer: feePayer,
    ata: nativeAta,
    owner: user,
    mint: WSOL_MINT,
  });
  const platformFee =
    (BigInt(swap.quote.outAmount) * BigInt(fees.platformSolFeeBps)) / 10_000n;
  const burnInstructions: Instruction[] =
    burnFee > 0n
      ? [
          getBurnInstruction({
            account: sourceAta,
            mint: sourceMint,
            authority: userSigner,
            amount: burnFee,
          }),
        ]
      : [];

  const { value: lifetime } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = (repayLamports: bigint) =>
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(feePayer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) =>
        appendTransactionMessageInstructions(
          [
            ...computeBudgetInstructions,
            setupInstruction,
            swap.swapInstruction,
            getCloseAccountInstruction({
              account: nativeAta,
              destination: user,
              owner: userSigner,
            }),
            getTransferSolInstruction({
              source: userSigner,
              destination: feePayer.address,
              amount: repayLamports,
            }),
            ...burnInstructions,
          ],
          m,
        ),
      (m) =>
        compressTransactionMessageUsingAddressLookupTables(
          m,
          addressesByLookupTable,
        ),
    );

  // The fee payer's fee, priority fee included, is paid back too. The node
  // works it out from the message; the repayment amount doesn't change its
  // size, so the first draft's fee is the final one's.
  const probe = compileTransaction(
    message(LAMPORTS_PER_TOKEN_ACCOUNT + platformFee),
  );
  let transactionFee: bigint;
  try {
    const { value } = await rpc
      .getFeeForMessage(
        getBase64Decoder().decode(
          probe.messageBytes,
        ) as TransactionMessageBytesBase64,
        { commitment: "confirmed" },
      )
      .send();
    transactionFee = value ?? 0n;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw Error(`Failed to calculate transaction fee: ${reason}`, {
      cause: err,
    });
  }

  const transaction = await partiallySignTransactionMessageWithSigners(
    message(LAMPORTS_PER_TOKEN_ACCOUNT + platformFee + transactionFee),
  );
  // The message was given a blockhash; this just tells the types so.
  assertIsTransactionWithBlockhashLifetime(transaction);

  await cache.set(key, Date.now()).catch(cacheUnavailable);

  return { transaction, quote: swap.quote };
}

function cacheUnavailable(err: unknown) {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`Swap rate limit skipped, cache unavailable: ${reason}`);
  return undefined;
}
