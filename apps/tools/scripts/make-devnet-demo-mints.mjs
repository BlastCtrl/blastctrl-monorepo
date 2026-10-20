/**
 * Makes the devnet demo mints for the reclaim-rent dev panel and writes them
 * in the shape of demo-mints.json: plain Token program mints, which is all
 * the panel needs. Devnet gets reset now and then; when the mints are gone,
 * run this again and replace the file. Resumable: mints already in the
 * output file are skipped.
 *
 *   KEYPAIR=<path> node scripts/make-devnet-demo-mints.mjs create \
 *     src/app/spl-token-tools/reclaim-rent/_components/demo-mints.devnet.json
 *   KEYPAIR=<path> node scripts/make-devnet-demo-mints.mjs sweep <recipient>
 *
 * The keypair is a Solana CLI style JSON array and pays for everything, about
 * 0.05 SOL. DEVNET_RPC overrides the public devnet endpoint.
 */
import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from "@solana-program/system";
import {
  getInitializeMint2Instruction,
  getMintSize,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  getTransactionSize,
  getTransactionSizeLimit,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import fs from "node:fs";

const RPC = process.env.DEVNET_RPC ?? "https://api.devnet.solana.com";
const KEYPAIR = process.env.KEYPAIR;
if (!KEYPAIR) throw Error("Set KEYPAIR to the path of the paying keypair");

const payer = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, "utf8"))),
);
const rpc = createSolanaRpc(RPC);
const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions: createSolanaRpcSubscriptions(RPC.replace(/^http/, "ws")),
});

/** Thirty mints, like the mainnet list, so the panel's batches fill up. */
const SPECS = Array.from({ length: 30 }, (_, i) => ({
  name: `Devnet Token ${String(i + 1).padStart(2, "0")}`,
}));
const DECIMALS = 6;

/** Instructions that create and initialize one mint; the mint keypair signs. */
const mintInstructions = (mint, rent) => [
  getCreateAccountInstruction({
    payer,
    newAccount: mint,
    lamports: rent,
    space: getMintSize(),
    programAddress: TOKEN_PROGRAM_ADDRESS,
  }),
  getInitializeMint2Instruction({
    mint: mint.address,
    decimals: DECIMALS,
    mintAuthority: payer.address,
    freezeAuthority: null,
  }),
];

/** Stands in for the blockhash while measuring; any 32 bytes do. */
const PLACEHOLDER_LIFETIME = {
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 0n,
};

const message = (instructions, lifetime = PLACEHOLDER_LIFETIME) =>
  pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

/** Whether the instructions, with every signature they need, fit a packet. */
const fits = (instructions) => {
  const transaction = compileTransaction(message(instructions));
  return (
    getTransactionSize(transaction) <= getTransactionSizeLimit(transaction)
  );
};

/** Greedily fills transactions up to the packet size. */
async function packBatches(specs) {
  const rent = await rpc
    .getMinimumBalanceForRentExemption(BigInt(getMintSize()))
    .send();
  const batches = [];
  let current = null;
  for (const spec of specs) {
    const mint = await generateKeyPairSigner();
    const instructions = mintInstructions(mint, rent);
    if (current && fits([...current.instructions, ...instructions])) {
      current.specs.push(spec);
      current.mints.push(mint);
      current.instructions.push(...instructions);
      continue;
    }
    current = { specs: [spec], mints: [mint], instructions };
    if (!fits(instructions)) {
      throw Error(`${spec.name} alone does not fit in a packet`);
    }
    batches.push(current);
  }
  return batches;
}

/** Signs with the payer and every keypair on the instructions, sends, confirms. */
async function send(instructions) {
  const { value: lifetime } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const transaction = await signTransactionMessageWithSigners(
    message(instructions, lifetime),
  );
  await sendAndConfirm(transaction, { commitment: "confirmed" });
  return getSignatureFromTransaction(transaction);
}

const balance = async () => (await rpc.getBalance(payer.address).send()).value;
const inSol = (value) => `${Number(value) / 1e9} SOL`;

async function create(outFile) {
  const done = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, "utf8"))
    : [];
  const doneNames = new Set(done.map((m) => m.name));
  const todo = SPECS.filter((s) => !doneNames.has(s.name));
  console.log(`payer ${payer.address} on ${RPC}`);
  console.log(`balance ${inSol(await balance())}`);
  console.log(`${done.length} done, ${todo.length} to create`);

  for (const { specs, mints, instructions } of await packBatches(todo)) {
    const signature = await send(instructions);
    specs.forEach((spec, i) => {
      done.push({
        id: mints[i].address,
        name: spec.name,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
    });
    fs.writeFileSync(outFile, JSON.stringify(done, null, 2) + "\n");
    console.log(`${specs.map((s) => s.name).join(", ")} -> ${signature}`);
  }
  console.log(`balance ${inSol(await balance())}`);
}

async function sweep(recipient) {
  const fee = 5_000n;
  const total = await balance();
  if (total <= fee) throw Error(`nothing to sweep: ${total} lamports`);
  const amount = lamports(total - fee);
  const signature = await send([
    getTransferSolInstruction({
      source: payer,
      destination: address(recipient),
      amount,
    }),
  ]);
  console.log(`sent ${inSol(amount)} to ${recipient}: ${signature}`);
  console.log(`remaining ${await balance()} lamports`);
}

const [command, argument] = process.argv.slice(2);
if (command === "create") await create(argument);
else if (command === "sweep") await sweep(argument);
else throw Error("usage: create <out.json> | sweep <recipient>");
