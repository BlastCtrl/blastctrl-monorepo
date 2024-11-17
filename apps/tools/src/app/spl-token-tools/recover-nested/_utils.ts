import { sleep } from "@/lib/utils";
import type { Account } from "@solana/spl-token";
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import type { Connection } from "@solana/web3.js";

export const findNestedAta = async ({
  connection,
  walletAccounts,
  onProgress,
}: {
  connection: Connection;
  walletAccounts: Account[];
  onProgress?: (index: number) => void;
}) => {
  const result: {
    parent: Account;
    nested: Account;
  }[] = [];

  for (let i = 0; i < walletAccounts.length; i++) {
    const account = walletAccounts[i];
    if (!account) continue;

    const maybeNested = await connection.getTokenAccountsByOwner(
      account.address,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

    if (maybeNested.value.length > 0) {
      maybeNested.value.forEach((nested) => {
        const nestedAcc = unpackAccount(nested.pubkey, nested.account);
        result.push({ parent: account, nested: nestedAcc });
      });
    }
    onProgress?.(i);

    await sleep(800);
  }
  return result;
};
