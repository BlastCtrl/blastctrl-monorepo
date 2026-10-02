/**
 * Makes the devnet demo mints for the reclaim-rent dev panel and writes them
 * in the shape of demo-mints.json. Devnet gets reset now and then; when the
 * mints are gone, run this again and replace the file. Resumable: mints
 * already in the output file are skipped.
 *
 *   KEYPAIR=<path> node scripts/make-devnet-demo-mints.mjs create \
 *     src/app/spl-token-tools/reclaim-rent/_components/demo-mints.devnet.json
 *   KEYPAIR=<path> node scripts/make-devnet-demo-mints.mjs sweep <recipient>
 *
 * The keypair is a Solana CLI style JSON array and pays for everything, about
 * 0.05 SOL. DEVNET_RPC overrides the public devnet endpoint.
 */
import * as spl from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// spl-token-metadata is a dependency of spl-token, not of the app.
const resolver = createRequire(import.meta.url);
const splMeta = await import(
  pathToFileURL(
    resolver.resolve("@solana/spl-token-metadata", {
      paths: [path.dirname(resolver.resolve("@solana/spl-token"))],
    }),
  ).href
);

const RPC = process.env.DEVNET_RPC ?? "https://api.devnet.solana.com";
const KEYPAIR = process.env.KEYPAIR;
const PACKET_DATA_SIZE = 1232;

if (!KEYPAIR) throw Error("Set KEYPAIR to the path of the paying keypair");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, "utf8"))),
);
const connection = new Connection(RPC, "confirmed");

/**
 * 30 mints like the mainnet list: 15 on Token, 15 on Token-2022 with a
 * spread of extensions so the token accounts come in several sizes.
 */
const SPECS = [
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Devnet Token ${String(i + 1).padStart(2, "0")}`,
    program: "token",
    extensions: [],
  })),
  ...["01", "02", "03"].map((n) => ({
    name: `Devnet Plain 2022 ${n}`,
    program: "token-2022",
    extensions: [],
  })),
  ...["01", "02", "03"].map((n) => ({
    name: `Devnet Transfer Fee ${n}`,
    program: "token-2022",
    extensions: ["transferFee"],
  })),
  ...["01", "02", "03"].map((n) => ({
    name: `Devnet Non-Transferable ${n}`,
    program: "token-2022",
    extensions: ["nonTransferable"],
  })),
  ...["01", "02"].map((n) => ({
    name: `Devnet Transfer Hook ${n}`,
    program: "token-2022",
    extensions: ["transferHook"],
  })),
  ...["01", "02"].map((n) => ({
    name: `Devnet Metadata ${n}`,
    program: "token-2022",
    extensions: ["metadata"],
  })),
  ...["01", "02"].map((n) => ({
    name: `Devnet Fee + Metadata ${n}`,
    program: "token-2022",
    extensions: ["transferFee", "metadata"],
  })),
];

const EXTENSION_TYPES = {
  transferFee: spl.ExtensionType.TransferFeeConfig,
  nonTransferable: spl.ExtensionType.NonTransferable,
  transferHook: spl.ExtensionType.TransferHook,
  metadata: spl.ExtensionType.MetadataPointer,
};

const programId = (program) =>
  program === "token-2022" ? spl.TOKEN_2022_PROGRAM_ID : spl.TOKEN_PROGRAM_ID;

const symbolFor = (name) =>
  "D" +
  name
    .replace(/^Devnet /, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 5)
    .toUpperCase();

const metadataFor = (spec, mint) => ({
  mint,
  name: spec.name,
  symbol: symbolFor(spec.name),
  uri: "",
  additionalMetadata: [],
});

/** Instructions that create and initialize one mint; the mint keypair signs. */
async function mintInstructions(spec, mint) {
  const program = programId(spec.program);
  const extensions = spec.extensions.map((e) => EXTENSION_TYPES[e]);
  const mintLen = spl.getMintLen(extensions);
  const hasMetadata = spec.extensions.includes("metadata");
  const metadataLen = hasMetadata
    ? spl.TYPE_SIZE +
      spl.LENGTH_SIZE +
      splMeta.pack(metadataFor(spec, mint.publicKey)).length
    : 0;
  const lamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataLen,
  );

  const ixs = [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: program,
    }),
  ];
  for (const ext of spec.extensions) {
    switch (ext) {
      case "transferFee":
        ixs.push(
          spl.createInitializeTransferFeeConfigInstruction(
            mint.publicKey,
            payer.publicKey,
            payer.publicKey,
            100, // 1%
            BigInt(1_000_000),
            program,
          ),
        );
        break;
      case "nonTransferable":
        ixs.push(
          spl.createInitializeNonTransferableMintInstruction(
            mint.publicKey,
            program,
          ),
        );
        break;
      case "transferHook":
        ixs.push(
          spl.createInitializeTransferHookInstruction(
            mint.publicKey,
            payer.publicKey,
            PublicKey.default, // no hook program; transfers just work
            program,
          ),
        );
        break;
      case "metadata":
        ixs.push(
          spl.createInitializeMetadataPointerInstruction(
            mint.publicKey,
            payer.publicKey,
            mint.publicKey,
            program,
          ),
        );
        break;
    }
  }
  ixs.push(
    spl.createInitializeMint2Instruction(
      mint.publicKey,
      6,
      payer.publicKey,
      null,
      program,
    ),
  );
  if (hasMetadata) {
    const meta = metadataFor(spec, mint.publicKey);
    ixs.push(
      splMeta.createInitializeInstruction({
        programId: program,
        mint: mint.publicKey,
        metadata: mint.publicKey,
        mintAuthority: payer.publicKey,
        updateAuthority: payer.publicKey,
        name: meta.name,
        symbol: meta.symbol,
        uri: meta.uri,
      }),
    );
  }
  return ixs;
}

/**
 * Greedily fills transactions up to the packet size: mints with metadata are
 * far bigger than plain ones, so a fixed count would either waste space or
 * overflow.
 */
export async function packBatches(specs) {
  const batches = [];
  let current = null;
  // serialize throws on an oversized transaction instead of returning it.
  const fits = (tx) => {
    try {
      return (
        tx.serialize({ requireAllSignatures: false, verifySignatures: false })
          .length <= PACKET_DATA_SIZE
      );
    } catch {
      return false;
    }
  };
  const fresh = () =>
    new Transaction({
      feePayer: payer.publicKey,
      recentBlockhash: "11111111111111111111111111111111",
    });
  for (const spec of specs) {
    const keypair = Keypair.generate();
    const ixs = await mintInstructions(spec, keypair);
    if (current) {
      const trial = fresh().add(...current.tx.instructions, ...ixs);
      if (fits(trial)) {
        current.batch.push(spec);
        current.keypairs.push(keypair);
        current.tx = trial;
        continue;
      }
    }
    current = { batch: [spec], keypairs: [keypair], tx: fresh().add(...ixs) };
    if (!fits(current.tx)) {
      throw Error(`${spec.name} alone does not fit in a packet`);
    }
    batches.push(current);
  }
  // The real blockhash is set by sendAndConfirmTransaction.
  for (const b of batches) b.tx = new Transaction().add(...b.tx.instructions);
  return batches;
}

async function create(outFile) {
  const done = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, "utf8"))
    : [];
  const doneNames = new Set(done.map((m) => m.name));
  const todo = SPECS.filter((s) => !doneNames.has(s.name));
  console.log(`payer ${payer.publicKey.toBase58()} on ${RPC}`);
  console.log(
    `balance ${(await connection.getBalance(payer.publicKey)) / 1e9} SOL`,
  );
  console.log(`${done.length} done, ${todo.length} to create`);

  for (const { batch, keypairs, tx } of await packBatches(todo)) {
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, ...keypairs],
      { commitment: "confirmed" },
    );
    for (const [j, spec] of batch.entries()) {
      done.push({
        id: keypairs[j].publicKey.toBase58(),
        name: spec.name,
        tokenProgram: programId(spec.program).toBase58(),
      });
    }
    fs.writeFileSync(outFile, JSON.stringify(done, null, 2) + "\n");
    console.log(`${batch.map((s) => s.name).join(", ")} -> ${sig}`);
  }
  console.log(
    `balance ${(await connection.getBalance(payer.publicKey)) / 1e9} SOL`,
  );
}

async function sweep(recipient) {
  const to = new PublicKey(recipient);
  const balance = await connection.getBalance(payer.publicKey);
  const fee = 5000;
  if (balance <= fee) throw Error(`nothing to sweep: ${balance} lamports`);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: to,
      lamports: balance - fee,
    }),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  console.log(`sent ${(balance - fee) / 1e9} SOL to ${recipient}: ${sig}`);
  console.log(
    `remaining ${await connection.getBalance(payer.publicKey)} lamports`,
  );
}

export { SPECS, payer };

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "create") await create(arg);
  else if (cmd === "sweep") await sweep(arg);
  else throw Error("usage: create <out.json> | sweep <recipient>");
}
