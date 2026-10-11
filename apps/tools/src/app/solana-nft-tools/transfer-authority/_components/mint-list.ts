import { isPublicKey } from "@/lib/solana/common";

export type MintList = {
  /** Valid, unique mint addresses in the order they were given. */
  mints: string[];
  /** Lines that aren't a single public key. */
  invalid: string[];
  /** How many repeated mints were dropped. */
  duplicates: number;
};

/**
 * Reads one mint address per line. Blank lines are skipped, and a line that
 * isn't exactly one address is reported as invalid.
 */
export function parseMintList(text: string): MintList {
  const seen = new Set<string>();
  const mints: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry) continue;
    if (!isPublicKey(entry)) {
      invalid.push(entry);
    } else if (seen.has(entry)) {
      duplicates++;
    } else {
      seen.add(entry);
      mints.push(entry);
    }
  }
  return { mints, invalid, duplicates };
}
