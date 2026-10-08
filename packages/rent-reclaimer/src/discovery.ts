import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import type { AccountInfo, Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { keepOpenReason } from "./types.js";
import type {
  DiscoveredAccount,
  DiscoveredMintLookup,
  ParsedTokenState,
} from "./types.js";

export type DiscoveryConnection = Pick<
  Connection,
  | "getParsedTokenAccountsByOwner"
  | "getMultipleAccountsInfo"
  | "getMinimumBalanceForRentExemption"
  | "getAccountInfo"
>;

type ParsedTokenAccountInfo = ParsedTokenState & {
  mint: string;
  owner: string;
  isNative: boolean;
  tokenAmount: { amount: string; uiAmountString: string };
};

export class ScanLimitError extends Error {
  constructor() {
    super(
      "This address has too many token accounts for one scan. No estimate was returned.",
    );
    this.name = "ScanLimitError";
  }
}

/** Existing BlastCtrl discovery: both token programs, then controlled mints
 * referenced by those accounts. This does not find every controlled mint. */
export async function discoverReclaimableAccounts(
  connection: DiscoveryConnection,
  owner: string,
  { maxAccounts = Infinity }: { maxAccounts?: number } = {},
): Promise<DiscoveredAccount[]> {
  if (!owner) throw Error("No address provided");
  const tokenAccounts = await fetchTokenAccounts(
    connection,
    owner,
    maxAccounts,
  );
  const mints = await fetchControlledMints(connection, owner, [
    ...new Set(tokenAccounts.map((a) => a.mint)),
  ]);
  return [...tokenAccounts, ...mints];
}

/** Checks an explicitly supplied mint with the same authority rules as discovery. */
export async function lookupReclaimableMint(
  connection: DiscoveryConnection,
  address: string,
  owner: string,
): Promise<DiscoveredMintLookup> {
  const info = await connection.getAccountInfo(new PublicKey(address));
  if (!info) return { status: "not-found" };
  const result = classifyMint(address, info, owner);
  if (result.status !== "ok") return result;
  const minimum = await connection.getMinimumBalanceForRentExemption(
    info.data.length,
  );
  return { status: "ok", account: { ...result.account, minimum } };
}

type Unnamed = DiscoveredAccount;

async function fetchTokenAccounts(
  connection: DiscoveryConnection,
  owner: string,
  maxAccounts: number,
) {
  const ownerKey = new PublicKey(owner);
  const programs = [
    { id: TOKEN_PROGRAM_ID, program: "token" as const },
    { id: TOKEN_2022_PROGRAM_ID, program: "token-2022" as const },
  ];

  const results = await Promise.all(
    programs.map(async ({ id, program }) => {
      const { value } = await connection.getParsedTokenAccountsByOwner(
        ownerKey,
        { programId: id },
      );
      return value.map(({ pubkey, account }) => {
        const info = account.data.parsed.info as ParsedTokenAccountInfo;
        return {
          id: pubkey.toBase58(),
          kind: "token-account" as const,
          address: pubkey.toBase58(),
          mint: info.mint,
          program,
          tokenBalance: info.tokenAmount.uiAmountString,
          isEmpty: info.tokenAmount.amount === "0",
          dataLength: account.data.space,
          lamports: account.lamports,
          blockedReason: info.isNative
            ? "Wrapped SOL accounts aren't supported"
            : undefined,
          keepOpenReason: keepOpenReason(info, owner),
        };
      });
    }),
  );

  const accounts = results.flat();
  if (accounts.length > maxAccounts) throw new ScanLimitError();
  return withMinimums(connection, accounts);
}

async function fetchControlledMints(
  connection: DiscoveryConnection,
  owner: string,
  mints: string[],
) {
  const infos = (
    await mapConcurrent(chunk(mints, 100), (batch) =>
      connection.getMultipleAccountsInfo(batch.map((m) => new PublicKey(m))),
    )
  ).flat();

  const controlled: Omit<Unnamed, "minimum">[] = [];
  infos.forEach((info, i) => {
    if (!info) return;
    const result = classifyMint(mints[i]!, info, owner);
    if (result.status === "ok") controlled.push(result.account);
  });

  return withMinimums(connection, controlled);
}

/** One rent lookup per distinct account size covers everything. */
async function withMinimums<T extends { dataLength: number }>(
  connection: DiscoveryConnection,
  accounts: T[],
) {
  const sizes = [...new Set(accounts.map((a) => a.dataLength))];
  const minimums = new Map(
    await mapConcurrent(
      sizes,
      async (size) =>
        [
          size,
          await connection.getMinimumBalanceForRentExemption(size),
        ] as const,
    ),
  );
  return accounts.map((a) => ({ ...a, minimum: minimums.get(a.dataLength)! }));
}

/**
 * Decides whether a mint's excess can be withdrawn by `owner`. The minimum is
 * filled in by the caller. Returns `not-a-mint` for anything that isn't a
 * token program mint, e.g. a token account or a wallet.
 */
function classifyMint(
  address: string,
  info: AccountInfo<Buffer>,
  owner: string,
):
  | { status: "ok"; account: Omit<Unnamed, "minimum"> }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" } {
  const program = info.owner.equals(TOKEN_PROGRAM_ID)
    ? ("token" as const)
    : info.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? ("token-2022" as const)
      : null;
  if (!program) return { status: "not-a-mint" };

  let authority: PublicKey | null;
  try {
    authority = unpackMint(
      new PublicKey(address),
      info,
      info.owner,
    ).mintAuthority;
  } catch {
    return { status: "not-a-mint" };
  }

  if (!authority) return { status: "no-authority", name: "" };
  if (authority.toBase58() !== owner) {
    return {
      status: "other-authority",
      name: "",
      authority: authority.toBase58(),
    };
  }

  return {
    status: "ok",
    account: {
      id: `mint-${address}`,
      kind: "mint",
      address,
      mint: address,
      program,
      tokenBalance: "",
      isEmpty: false,
      dataLength: info.data.length,
      lamports: info.lamports,
    },
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    batches.push(items.slice(i, i + size));
  return batches;
}

/** Bound RPC fan-out without changing the order of discovered accounts. */
async function mapConcurrent<T, R>(
  items: T[],
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}
