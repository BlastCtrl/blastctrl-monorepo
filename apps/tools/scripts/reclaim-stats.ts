/**
 * Usage statistics for the reclaim-rent tool, read from the fee wallet's
 * transaction history. Every use of the tool that charged a fee ends with a
 * SOL transfer to the fee wallet, in the same transaction as the account
 * closes and withdrawals, so that wallet's history is the usage log.
 *
 *   node --env-file=.env.local scripts/reclaim-stats.ts [options]
 *
 *   --address <pubkey>   fee wallet; default NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT
 *   --rpc <url>          RPC endpoint; default NEXT_PUBLIC_RPC_ENDPOINT
 *   --since <YYYY-MM-DD> ignore transactions before this UTC date
 *   --bucket <day|week|month>
 *                        time series granularity; default picked from the span
 *   --json <path>        also write the per-transaction rows and summary
 *
 * Needs a Triton endpoint: it uses getTransactionsForAddress with full
 * transactions, one request per 100.
 *
 * Blind spots: a transaction whose fee rounded down to zero lamports has no
 * transfer and never touches this wallet, and the two UIs build identical
 * transactions, so usage cannot be split by page.
 */
import {
  address,
  createDefaultRpcTransport,
  createJsonRpcApi,
  createRpc,
  createSolanaRpc,
  type Address,
} from "@solana/kit";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const LAMPORTS_PER_SOL = 1_000_000_000;

// ---------------------------------------------------------------------------
// Fetching

/** Minimal view of a jsonParsed transaction. */
type ParsedTx = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  txFee: number;
  accountKeys: string[];
  preBalances: number[];
  postBalances: number[];
  instructions: ParsedInstruction[];
};

type ParsedInstruction = {
  programId: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};

type TritonOptions = {
  transactionDetails?: "signatures" | "full";
  sortOrder?: "asc" | "desc";
  limit?: number;
  paginationToken?: string | null;
  commitment?: "confirmed" | "finalized";
  encoding?: "json" | "jsonParsed" | "base58" | "base64";
  maxSupportedTransactionVersion?: number;
  filters?: {
    status?: "any" | "succeeded" | "failed";
    blockTime?: { gte?: number; gt?: number; lte?: number; lt?: number };
  };
};

type TritonApi = {
  getTransactionsForAddress(
    address: Address,
    options?: TritonOptions,
  ): { data: unknown[]; paginationToken: string | null };
};

type Loose = any;

/** Shapes a raw jsonParsed transaction from either method into ParsedTx. */
function normalize(raw: Loose): ParsedTx {
  const message = raw.transaction.message;
  return {
    signature: String(raw.transaction.signatures[0]),
    slot: Number(raw.slot),
    blockTime: raw.blockTime == null ? null : Number(raw.blockTime),
    err: raw.meta?.err ?? null,
    txFee: Number(raw.meta?.fee ?? 0),
    accountKeys: message.accountKeys.map((k: Loose) =>
      typeof k === "string" ? k : String(k.pubkey),
    ),
    preBalances: (raw.meta?.preBalances ?? []).map(Number),
    postBalances: (raw.meta?.postBalances ?? []).map(Number),
    instructions: message.instructions.map((ix: Loose) => ({
      programId: String(ix.programId),
      parsed: ix.parsed,
    })),
  };
}

async function fetchTransactions(
  url: string,
  wallet: Address,
  sinceUnix: number | undefined,
): Promise<ParsedTx[]> {
  // The generic API returns the raw JSON-RPC envelope; unwrap it here.
  const rpc = createRpc({
    api: createJsonRpcApi<TritonApi>({
      responseTransformer: (response: Loose) => {
        if (response.error) throw response.error;
        return response.result;
      },
    }),
    transport: createDefaultRpcTransport({ url }),
  });
  const out: ParsedTx[] = [];
  let paginationToken: string | null = null;
  for (;;) {
    const page = await rpc
      .getTransactionsForAddress(wallet, {
        transactionDetails: "full",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        sortOrder: "asc",
        limit: 100,
        paginationToken,
        filters: sinceUnix ? { blockTime: { gte: sinceUnix } } : undefined,
      })
      .send();
    for (const raw of page.data) out.push(normalize(raw));
    process.stderr.write(`\rfetched ${out.length} transactions`);
    if (!page.paginationToken || page.data.length === 0) break;
    paginationToken = page.paginationToken;
  }
  process.stderr.write("\n");
  return out;
}

// ---------------------------------------------------------------------------
// Classification

type Row = {
  signature: string;
  slot: number;
  time: string | null;
  kind: "reclaim" | "deposit" | "withdrawal" | "failed" | "other";
  wallet: string;
  /** Lamports the fee wallet gained (negative when it paid out). */
  feeLamports: number;
  /** Gross lamports the user's wallet received before the fee and tx fee. */
  reclaimedLamports: number;
  closed: number;
  withdrawn: number;
  tokenAccounts: number;
  token2022Accounts: number;
};

function classify(tx: ParsedTx, feeWallet: string): Row {
  const feeIndex = tx.accountKeys.indexOf(feeWallet);
  const feeDelta =
    feeIndex >= 0 ? tx.postBalances[feeIndex]! - tx.preBalances[feeIndex]! : 0;
  const signer = tx.accountKeys[0]!;
  const signerDelta = tx.postBalances[0]! - tx.preBalances[0]!;
  const time =
    tx.blockTime == null ? null : new Date(tx.blockTime * 1000).toISOString();

  let closed = 0;
  let withdrawn = 0;
  let tokenAccounts = 0;
  let token2022Accounts = 0;
  let transferToFee = 0;
  for (const ix of tx.instructions) {
    const type = ix.parsed?.type;
    if (ix.programId === TOKEN_PROGRAM || ix.programId === TOKEN_2022_PROGRAM) {
      if (type === "closeAccount") closed++;
      else if (type === "withdrawExcessLamports") withdrawn++;
      else continue;
      if (ix.programId === TOKEN_PROGRAM) tokenAccounts++;
      else token2022Accounts++;
    } else if (ix.programId === SYSTEM_PROGRAM && type === "transfer") {
      if (ix.parsed?.info?.destination === feeWallet)
        transferToFee += Number(ix.parsed.info.lamports);
    }
  }

  const base = {
    signature: tx.signature,
    slot: tx.slot,
    time,
    wallet: signer,
    feeLamports: feeDelta,
    closed,
    withdrawn,
    tokenAccounts,
    token2022Accounts,
  };
  if (tx.err) return { ...base, kind: "failed", reclaimedLamports: 0 };
  if (closed + withdrawn > 0 && transferToFee > 0) {
    return {
      ...base,
      kind: "reclaim",
      // What the closes and withdrawals paid into the user's wallet.
      reclaimedLamports: signerDelta + transferToFee + tx.txFee,
    };
  }
  if (feeDelta > 0) return { ...base, kind: "deposit", reclaimedLamports: 0 };
  if (feeDelta < 0)
    return { ...base, kind: "withdrawal", reclaimedLamports: 0 };
  return { ...base, kind: "other", reclaimedLamports: 0 };
}

// ---------------------------------------------------------------------------
// Aggregation

type Bucket = "day" | "week" | "month";

function pickBucket(rows: Row[]): Bucket {
  const times = rows.map((r) => r.time).filter((t): t is string => !!t);
  if (times.length < 2) return "day";
  const span =
    (Date.parse(times[times.length - 1]!) - Date.parse(times[0]!)) / 86_400_000;
  if (span <= 45) return "day";
  if (span <= 240) return "week";
  return "month";
}

/** UTC bucket label; weeks start on Monday and are labelled by that date. */
function bucketKey(iso: string, bucket: Bucket) {
  const d = new Date(iso);
  if (bucket === "month") return iso.slice(0, 7);
  if (bucket === "week") {
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - day);
  }
  return d.toISOString().slice(0, 10);
}

function sol(lamports: number, digits = 4) {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const SESSION_GAP_MINUTES = 15;

/**
 * A session is one wallet's run of reclaim transactions with no gap longer
 * than SESSION_GAP_MINUTES between them. The tool sends ten accounts per
 * transaction, so one visit by a wallet with many accounts is several
 * transactions; sessions are the closer count of "times the tool was used".
 */
function sessionStarts(reclaims: Row[]) {
  const lastSeen = new Map<string, number>();
  const starts = new Set<string>();
  for (const r of reclaims) {
    if (!r.time) continue;
    const t = Date.parse(r.time);
    const prev = lastSeen.get(r.wallet);
    if (prev === undefined || t - prev > SESSION_GAP_MINUTES * 60_000)
      starts.add(r.signature);
    lastSeen.set(r.wallet, t);
  }
  return starts;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function table(headers: string[], rows: (string | number)[][]) {
  const cells = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, i) =>
    Math.max(...cells.map((r) => r[i]!.length)),
  );
  const line = (r: string[]) =>
    r
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of cells.slice(1)) console.log(line(r));
}

function report(
  rows: Row[],
  feeWallet: string,
  balance: number,
  bucket: Bucket,
) {
  const reclaims = rows.filter((r) => r.kind === "reclaim");
  const deposits = rows.filter((r) => r.kind === "deposit");
  const withdrawals = rows.filter((r) => r.kind === "withdrawal");
  const failed = rows.filter((r) => r.kind === "failed");
  const other = rows.filter((r) => r.kind === "other");

  const sum = (xs: Row[], f: (r: Row) => number) =>
    xs.reduce((a, r) => a + f(r), 0);
  const perWallet = new Map<string, number>();
  for (const r of reclaims)
    perWallet.set(r.wallet, (perWallet.get(r.wallet) ?? 0) + 1);
  const accountsPerTx = reclaims.map((r) => r.closed + r.withdrawn);
  const first = reclaims[0]?.time?.slice(0, 10) ?? "-";
  const last = reclaims[reclaims.length - 1]?.time?.slice(0, 10) ?? "-";
  const starts = sessionStarts(reclaims);
  const sessions = starts.size;

  console.log(`\nReclaim-rent usage — fee wallet ${feeWallet}\n`);
  const lines: [string, string | number][] = [
    ["First / last reclaim", `${first} → ${last}`],
    [
      "Scanned up to",
      new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    ],
    ["Unique wallets", perWallet.size],
    [`Sessions (one wallet, gaps under ${SESSION_GAP_MINUTES} min)`, sessions],
    ["Reclaim transactions", reclaims.length],
    [
      "Fees collected (SOL)",
      sol(
        sum(reclaims, (r) => r.feeLamports),
        6,
      ),
    ],
    [
      "Returned to users, gross (SOL)",
      sol(sum(reclaims, (r) => r.reclaimedLamports)),
    ],
    ["Accounts closed", sum(reclaims, (r) => r.closed)],
    ["Accounts with excess withdrawn", sum(reclaims, (r) => r.withdrawn)],
    ["  of which Token", sum(reclaims, (r) => r.tokenAccounts)],
    ["  of which Token-2022", sum(reclaims, (r) => r.token2022Accounts)],
    [
      "Accounts per tx (median / max)",
      `${median(accountsPerTx)} / ${Math.max(0, ...accountsPerTx)}`,
    ],
    [
      "Fee per tx (median / max, SOL)",
      `${sol(median(reclaims.map((r) => r.feeLamports)), 6)} / ${sol(Math.max(0, ...reclaims.map((r) => r.feeLamports)), 6)}`,
    ],
    ["Wallet balance now (SOL)", sol(balance)],
  ];
  const width = Math.max(...lines.map(([k]) => k.length));
  for (const [k, v] of lines) console.log(`${k.padEnd(width)}  ${v}`);

  console.log("\nWallets by number of reclaims");
  const repeat = [0, 0, 0];
  for (const n of perWallet.values()) repeat[Math.min(n, 3) - 1]!++;
  table(
    ["Reclaims", "Wallets"],
    [
      ["1", repeat[0]!],
      ["2", repeat[1]!],
      ["3+", repeat[2]!],
    ],
  );

  console.log(`\nReclaims per ${bucket}`);
  const seen = new Set<string>();
  const buckets = new Map<
    string,
    {
      txs: number;
      sessions: number;
      wallets: Set<string>;
      newWallets: number;
      accounts: number;
      fees: number;
      reclaimed: number;
    }
  >();
  for (const r of reclaims) {
    if (!r.time) continue;
    const key = bucketKey(r.time, bucket);
    let b = buckets.get(key);
    if (!b) {
      b = {
        txs: 0,
        sessions: 0,
        wallets: new Set(),
        newWallets: 0,
        accounts: 0,
        fees: 0,
        reclaimed: 0,
      };
      buckets.set(key, b);
    }
    b.txs++;
    if (starts.has(r.signature)) b.sessions++;
    b.wallets.add(r.wallet);
    if (!seen.has(r.wallet)) {
      seen.add(r.wallet);
      b.newWallets++;
    }
    b.accounts += r.closed + r.withdrawn;
    b.fees += r.feeLamports;
    b.reclaimed += r.reclaimedLamports;
  }
  table(
    [
      bucket === "week" ? "Week of" : bucket === "month" ? "Month" : "Day",
      "Wallets",
      "Sessions",
      "Txs",
      "New wallets",
      "Accounts",
      "Fees (SOL)",
      "Returned (SOL)",
    ],
    [...buckets.entries()].map(([k, b]) => [
      k,
      b.wallets.size,
      b.sessions,
      b.txs,
      b.newWallets,
      b.accounts,
      sol(b.fees),
      sol(b.reclaimed),
    ]),
  );

  console.log("\nNot tool usage");
  table(
    ["Kind", "Txs", "SOL"],
    [
      [
        "Deposits into the fee wallet",
        deposits.length,
        sol(sum(deposits, (r) => r.feeLamports)),
      ],
      [
        "Withdrawals from the fee wallet",
        withdrawals.length,
        sol(Math.abs(sum(withdrawals, (r) => r.feeLamports))),
      ],
      ["Failed transactions", failed.length, "-"],
      ["Unrecognised", other.length, "-"],
    ],
  );
  if (deposits.length + withdrawals.length + other.length > 0) {
    console.log();
    table(
      ["Time", "Kind", "Signer", "SOL", "Signature"],
      [...deposits, ...withdrawals, ...other]
        .sort((a, b) => a.slot - b.slot)
        .map((r) => [
          r.time?.slice(0, 16) ?? "-",
          r.kind,
          r.wallet,
          sol(r.feeLamports),
          r.signature,
        ]),
    );
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      address: { type: "string" },
      rpc: { type: "string" },
      since: { type: "string" },
      bucket: { type: "string" },
      json: { type: "string" },
    },
  });
  const url = values.rpc ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT;
  const feeWallet =
    values.address ?? process.env.NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT;
  if (!url || !feeWallet) {
    console.error(
      "Need an RPC URL (--rpc or NEXT_PUBLIC_RPC_ENDPOINT) and a fee wallet (--address or NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT).",
    );
    process.exit(1);
  }
  if (values.bucket && !["day", "week", "month"].includes(values.bucket)) {
    console.error("--bucket must be day, week or month");
    process.exit(1);
  }
  const sinceUnix = values.since
    ? Math.floor(Date.parse(`${values.since}T00:00:00Z`) / 1000)
    : undefined;
  if (values.since && Number.isNaN(sinceUnix)) {
    console.error("--since must be YYYY-MM-DD");
    process.exit(1);
  }

  const wallet = address(feeWallet);
  const txs = await fetchTransactions(url, wallet, sinceUnix);
  const balance = Number(
    (await createSolanaRpc(url).getBalance(wallet).send()).value,
  );

  const rows = txs.map((tx) => classify(tx, feeWallet));
  const bucket =
    (values.bucket as Bucket | undefined) ??
    pickBucket(rows.filter((r) => r.kind === "reclaim"));
  report(rows, feeWallet, balance, bucket);

  if (values.json) {
    writeFileSync(
      values.json,
      JSON.stringify(
        {
          feeWallet,
          fetchedAt: new Date().toISOString(),
          balanceLamports: balance,
          rows,
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${rows.length} rows to ${values.json}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
