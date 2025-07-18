import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type {
  Connection,
  Keypair,
  PublicKey,
  RpcResponseAndContext,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import type { Cache } from "cache-manager";
import {
  getAddressLookupTableAccounts,
  getJupiterSwapInstructions,
} from "../swapProvider";
import type { JupiterQuoteResponseSchema } from "../swapProvider";

const SAME_MINT_TIMEOUT = 3000;
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

/**
 * Builds an unsigned transaction that performs a swap to SOL and optionally sends a token fee to Octane
 *
 * @param connection
 * @param feePayer
 * @param user
 * @param sourceMint
 * @param amount
 * @param cache
 * @param feeOptions
 *
 * @return { Transaction, quote }
 */
export async function buildJupiterSwapToSOL(
  connection: Connection,
  feePayer: Keypair,
  user: PublicKey,
  sourceMint: PublicKey,
  amount: BN,
  cache: Cache,
  fees: {
    platformSolFeeBps: number;
    bonkBurnFeeBps: number;
  },
): Promise<{
  transaction: VersionedTransaction;
  quote: JupiterQuoteResponseSchema;
}> {
  // TODO: decide if we need this genesis hash check. Might just be unnecessary
  // Connection's genesis hash is cached to prevent an extra RPC query to the node on each call.
  // const genesisHashKey = `genesis/${connection.rpcEndpoint}`;
  // let genesisHash = await cache
  //   .get<string>(genesisHashKey)
  //   .catch(() => console.log("Error getting genesis hash from cache"));
  // if (!genesisHash) {
  //   try {
  //     genesisHash = await connection.getGenesisHash();
  //     await cache.set(genesisHashKey, genesisHash, 60 * 60 * 60 * 1000);
  //   } catch (err) {
  //     console.log("getGenesisHash fail", err);
  //     throw err;
  //   }
  // }
  // if (!isMainnetBetaCluster(genesisHash)) {
  //   throw new Error(
  //     "Whirlpools endpoint can only run attached to the mainnet-beta cluster"
  //   );
  // }

  if (amount.lte(new BN(0))) {
    throw new Error("Amount can't be zero or less");
  }

  const key = `swap/${user.toString()}/${sourceMint.toString()}`;
  const lastSignature = await cache.get<number>(key);
  if (lastSignature && Date.now() - lastSignature < SAME_MINT_TIMEOUT) {
    throw new Error("Too many requests for same user and mint");
  }

  // Do we need this check for a native token account? Need to review
  // if (await connection.getAccountInfo(associatedSOLAddress)) {
  //   throw new Error("Associated SOL account exists for user");
  // }

  // SPECIAL CASE: if swapping bonk, we need to burn 2.5% of the submitted amount
  let burnFee = new BN(0);
  if (sourceMint.toString() === BONK_MINT) {
    burnFee = amount.muln(fees.bonkBurnFeeBps).divn(10_000);
    amount = amount.sub(burnFee);
  }

  // Get the swap instructions
  // This fn can throw
  const { swapInstructions, quoteResponse } = await getJupiterSwapInstructions({
    wallet: user.toString(),
    inputMint: sourceMint.toString(),
    amount: amount.toString(),
    slippageBps: 1000,
  });

  // Here we don't use the given setup and cleanup instructions,
  // we construct our own
  const {
    computeBudgetInstructions, // The necessary instructions to setup the compute budget.
    swapInstruction: swapInstructionPayload, // The actual swap instruction.
    addressLookupTableAddresses,
  } = swapInstructions;

  // SOLFLARE SPECIAL CASE
  // Solflare likes to edit compute budget instructions. Here we flip the order of them, so they are in order that solflare won't touch
  computeBudgetInstructions.reverse();

  // This fn can throw, sends a getMultipleAccounts rpc request
  const addressLookupTableAccounts = await getAddressLookupTableAccounts(
    addressLookupTableAddresses,
    connection,
  );

  // ---------------------------------------------------------------------------
  // This setup instruction is still paid by Octane (meaning us, the fee payer)
  // We need to account for this cost later
  // ---------------------------------------------------------------------------
  const LAMPORTS_PER_ATA = 2039280;
  const nativeAta = getAssociatedTokenAddressSync(NATIVE_MINT, user);
  const setupInstruction = createAssociatedTokenAccountIdempotentInstruction(
    feePayer.publicKey,
    nativeAta,
    user,
    NATIVE_MINT,
  );

  // Calculate our platform fee as a percentage of the sol amount user will receive
  // This should already be rounded down, so no decimals
  const platformFeeLamports = new BN(quoteResponse.outAmount)
    .muln(fees.platformSolFeeBps)
    .divn(10_000);

  // Cleanup needs to close the native token account and pay the platform fees
  // We transfer the fee for one ATA back to us, because we paid for the
  // that native account that will be closed.
  // TODO: can we just modify the close account instruction to send it back to us?
  const cleanupInstructions: TransactionInstruction[] = [];
  cleanupInstructions.push(
    createCloseAccountInstruction(nativeAta, user, user),
    SystemProgram.transfer({
      fromPubkey: user,
      toPubkey: feePayer.publicKey,
      lamports: LAMPORTS_PER_ATA + platformFeeLamports.toNumber(),
    }),
  );

  // If there's a burn fee (only for BONK), we need to add that to the cleanup
  if (sourceMint.toString() === BONK_MINT && burnFee.gtn(0)) {
    const sourceTokenAccount = getAssociatedTokenAddressSync(sourceMint, user);
    cleanupInstructions.push(
      createBurnInstruction(
        sourceTokenAccount,
        sourceMint,
        user,
        BigInt(burnFee.toString()),
      ),
    );
  }

  const blockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  let messageV0 = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ...computeBudgetInstructions,
      setupInstruction,
      swapInstructionPayload,
      ...cleanupInstructions,
    ],
  }).compileToV0Message(addressLookupTableAccounts);

  // Here we get the actual simulated fee that Octane will pay for this transaction
  // including the priority fees. We want this fee to also be paid back to Octane
  // from the amount that the user got from the swap along with the platform fee.
  //
  // It's annoying that we need to make a request to find out how much the user needs
  // to pay back, but I don't know if there's a different way to do it. We can set the
  // fee ourself, or decode the `computeBudgetInstructions`, either way we'll get
  // the compute budget limit and microLamports per compute unit, but at that point we
  // don't know exactly how many compute units we'll use, so we don't know what the
  // fee will exactly be.
  let transactionFee: RpcResponseAndContext<number | null>;
  try {
    transactionFee = await connection.getFeeForMessage(messageV0, "confirmed");
  } catch (err) {
    if (err instanceof Error) {
      throw Error(`Failed to calculate transaction fee: ${err.message}`);
    }
    throw Error("Failed to get transaction fee");
  }

  // Modify our cleanup instruction to add this transaction fee as well
  cleanupInstructions.splice(
    1,
    1,
    SystemProgram.transfer({
      fromPubkey: user,
      toPubkey: feePayer.publicKey,
      lamports:
        LAMPORTS_PER_ATA +
        platformFeeLamports.toNumber() +
        (transactionFee?.value ?? 0),
    }),
  );

  // Now we have the final transaction
  messageV0 = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ...computeBudgetInstructions,
      setupInstruction,
      swapInstructionPayload,
      ...cleanupInstructions,
    ],
  }).compileToV0Message(addressLookupTableAccounts);

  const transaction = new VersionedTransaction(messageV0);

  transaction.sign([feePayer]);

  // set last signature for mint and user
  await cache.set(key, Date.now());

  return { transaction, quote: quoteResponse };
}
