import { getTransferSolInstruction } from "@solana-program/system";
import {
  fetchToken,
  findAssociatedTokenPda,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import CONFIG from "./config.js";

const rpc = createSolanaRpc(CONFIG.rpcUrl);
const rpcSubscriptions = createSolanaRpcSubscriptions(websocketUrl(CONFIG.rpcUrl));
const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

// The websocket endpoint web3.js's Connection used for the same URL: the
// same host with ws(s), and the next port when one is given.
function websocketUrl(rpcUrl: string) {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (url.port) url.port = String(Number(url.port) + 1);
  return url.toString();
}

async function sendInstructions(feePayer: KeyPairSigner, instructions: Instruction[]) {
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  // Signs with the fee payer and every signer the instructions carry.
  const transaction = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(transaction);
  await sendAndConfirmTransaction(transaction, { commitment: "confirmed" });
  return getSignatureFromTransaction(transaction);
}

async function associatedTokenAddress(owner: Address, mint: Address) {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cleanWallet(from: KeyPairSigner, to: KeyPairSigner) {
  const fromTokenAccount = await associatedTokenAddress(from.address, CONFIG.usdcMint);
  const toTokenAccount = await associatedTokenAddress(to.address, CONFIG.usdcMint);

  const instructions: Instruction[] = [];
  const { value: solBalance } = await rpc
    .getBalance(from.address, { commitment: "confirmed" })
    .send();
  if (solBalance !== 0n) {
    instructions.push(
      getTransferSolInstruction({
        source: from,
        destination: to.address,
        amount: lamports(solBalance),
      }),
    );
  }

  const fromAccountInfo = await fetchToken(rpc, fromTokenAccount, { commitment: "confirmed" });
  const tokenBalance = fromAccountInfo.data.amount;
  if (tokenBalance !== 0n) {
    const transferIx = getTransferInstruction({
      source: fromTokenAccount,
      destination: toTokenAccount,
      authority: from,
      amount: tokenBalance,
    });

    // Create close account instruction to close the sender's token account.
    const closeIx = getCloseAccountInstruction({
      account: fromTokenAccount,
      destination: to.address, // destination for reclaimed rent-exempt balance
      owner: from,
    });
    instructions.push(transferIx, closeIx);
  }
  if (instructions.length === 0) {
    throw Error("No instructions to send");
  }

  const signature = await sendInstructions(to, instructions);
  return { signature, lamports: Number(solBalance), tokens: Number(tokenBalance) };
}

export async function sendTokensToWallet(from: KeyPairSigner, to: KeyPairSigner, amount: number) {
  const mint = CONFIG.usdcMint;

  const fromTokenAccount = await associatedTokenAddress(from.address, mint);
  const toTokenAccount = await associatedTokenAddress(to.address, mint);

  const tokenAccountIx = getCreateAssociatedTokenIdempotentInstruction({
    payer: from,
    ata: toTokenAccount,
    owner: to.address,
    mint,
  });
  const transferIx = getTransferInstruction({
    source: fromTokenAccount,
    destination: toTokenAccount,
    authority: from,
    amount,
  });

  return sendInstructions(from, [tokenAccountIx, transferIx]);
}

export async function getSolBalance(address: Address): Promise<number> {
  const { value } = await rpc.getBalance(address, { commitment: "confirmed" }).send();
  return Number(value);
}

export async function getTokenBalance(address: Address, mint: Address): Promise<number> {
  const tokenAccount = await associatedTokenAddress(address, mint);

  try {
    const { value } = await rpc
      .getTokenAccountBalance(tokenAccount, { commitment: "confirmed" })
      .send();
    return value.uiAmount ?? 0;
  } catch {
    // Account does not exist
    return 0;
  }
}

export function formatNumber(value: number, maxDecimalPlaces: number): string {
  return (
    value
      .toFixed(maxDecimalPlaces)
      // remove any trailing zeroes, by chatgpt
      .replace(/(\.\d*?[1-9])0+|\.0*$/, "$1")
  );
}
