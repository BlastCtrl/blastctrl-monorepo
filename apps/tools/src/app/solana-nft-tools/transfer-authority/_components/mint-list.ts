import { isPublicKey } from "@/lib/solana/common";

export type MintList = {
  /** Valid, unique mint addresses in the order they were given. */
  mints: string[];
  /** Entries that aren't public keys. */
  invalid: string[];
  /** How many repeated mints were dropped. */
  duplicates: number;
};

/** Keys an object entry in a JSON list may keep its mint under. */
const MINT_KEYS = ["mint", "mintAddress", "address", "id"] as const;

/**
 * Reads a list of mints from text: either JSON, or addresses separated by
 * whitespace or commas. JSON can be an array of addresses, an array of
 * objects with a `mint` (or `mintAddress`, `address`, `id`) field, or an
 * object with such an array under `mints`.
 */
export function parseMintList(text: string): MintList {
  const trimmed = text.trim();
  if (!trimmed) return { mints: [], invalid: [], duplicates: 0 };

  let entries: string[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    entries = fromJson(trimmed);
  } else {
    entries = trimmed.split(/[\s,;]+/).filter(Boolean);
  }

  const seen = new Set<string>();
  const mints: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of entries) {
    const entry = raw.trim().replace(/^["']|["']$/g, "");
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

function fromJson(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The list looks like JSON, but it can't be parsed.");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.mints)
      ? parsed.mints
      : null;
  if (!list) {
    throw new Error(
      'Expected a JSON array of mint addresses, or an object with a "mints" array.',
    );
  }
  return list.map((item: unknown) => {
    if (typeof item === "string") return item;
    if (isRecord(item)) {
      for (const key of MINT_KEYS) {
        if (typeof item[key] === "string") return item[key];
      }
    }
    return JSON.stringify(item);
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
