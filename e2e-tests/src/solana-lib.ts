import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import CONFIG from "./config.js";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadWallet(key: number[]) {
  return Keypair.fromSecretKey(Uint8Array.from(key));
}

export async function cleanWallet(from: Keypair, to: Keypair) {
  const mint = CONFIG.usdcMint;
  const connection = new Connection(CONFIG.rpcUrl, "confirmed");
  const fromTokenAccount = getAssociatedTokenAddressSync(CONFIG.usdcMint, from.publicKey);
  const toTokenAccount = getAssociatedTokenAddressSync(CONFIG.usdcMint, to.publicKey);

  const instructions: TransactionInstruction[] = [];
  const solBalance = await connection.getBalance(from.publicKey);
  if (solBalance !== 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to.publicKey,
        lamports: solBalance,
      }),
    );
  }

  const fromAccountInfo = await getAccount(connection, fromTokenAccount);
  const tokenBalance = fromAccountInfo.amount;
  if (tokenBalance !== 0n) {
    const transferIx = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      from.publicKey,
      tokenBalance,
      [],
      TOKEN_PROGRAM_ID,
    );

    // Create close account instruction to close the sender's token account.
    const closeIx = createCloseAccountInstruction(
      fromTokenAccount,
      to.publicKey, // destination for reclaimed rent-exempt balance
      from.publicKey,
      [],
      TOKEN_PROGRAM_ID,
    );
    instructions.push(transferIx, closeIx);
  }
  if (instructions.length === 0) {
    throw Error("No instructions to send");
  }
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = to.publicKey;
  const { blockhash: newBlockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = newBlockhash;

  const signature = await sendAndConfirmTransaction(connection, transaction, [from, to]);
  return { signature, solBalance, tokenBalance };
}

export async function sendTokensToWallet(from: Keypair, to: Keypair, amount: number) {
  const connection = new Connection(CONFIG.rpcUrl, "confirmed");
  const mint = CONFIG.usdcMint;

  const fromTokenAccount = getAssociatedTokenAddressSync(mint, from.publicKey);
  const toTokenAccount = getAssociatedTokenAddressSync(mint, to.publicKey);

  const tokenAccountIx = createAssociatedTokenAccountIdempotentInstruction(
    from.publicKey,
    toTokenAccount,
    to.publicKey,
    mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const transferIx = createTransferInstruction(
    fromTokenAccount,
    toTokenAccount,
    from.publicKey,
    amount,
    [],
    TOKEN_PROGRAM_ID,
  );

  const transaction = new Transaction().add(tokenAccountIx, transferIx);
  transaction.feePayer = from.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  const signature = await sendAndConfirmTransaction(connection, transaction, [from]);
  return signature;
}

export function formatNumber(value: number, maxDecimalPlaces: number): string {
  return (
    value
      .toFixed(maxDecimalPlaces)
      // remove any trailing zeroes, by chatgpt
      .replace(/(\.\d*?[1-9])0+|\.0*$/, "$1")
  );
}
