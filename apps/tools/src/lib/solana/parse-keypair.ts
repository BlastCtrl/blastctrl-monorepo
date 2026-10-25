import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  isSolanaError,
  SOLANA_ERROR__CODECS__INVALID_STRING_FOR_BASE,
  type KeyPairSigner,
} from "@solana/kit";

interface ParseKeypairError {
  success: false;
  error: string;
}

interface ParseKeypairSuccess {
  success: true;
  signer: KeyPairSigner;
}

export type ParseKeypairResult = ParseKeypairError | ParseKeypairSuccess;

/**
 * Reads a 64-byte secret key into a kit signer. Accepts the Solana CLI JSON
 * format (`[12, 34, …]`) or a base58 string, the way wallets export it.
 *
 * Validation is Kit's: `createKeyPairSignerFromBytes` rejects anything but 64
 * bytes and a public key that does not match the private key, so a mangled
 * array fails there as well.
 */
export async function parseSecretKey(
  input: string,
): Promise<ParseKeypairResult> {
  const trimmed = input.trim();
  try {
    const bytes = trimmed.startsWith("[")
      ? Uint8Array.from(JSON.parse(trimmed) as ArrayLike<number>)
      : getBase58Encoder().encode(trimmed);
    return { success: true, signer: await createKeyPairSignerFromBytes(bytes) };
  } catch (err) {
    // These two errors quote the input, which is a secret; keep it out of the UI.
    if (err instanceof SyntaxError) {
      return { success: false, error: "Not a valid JSON byte array" };
    }
    if (isSolanaError(err, SOLANA_ERROR__CODECS__INVALID_STRING_FOR_BASE)) {
      return { success: false, error: "Not a valid base58 string" };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Reads a Solana CLI style keypair file (JSON array of 64 bytes) into a kit signer. */
export async function parseJsonKeypair(
  file: File,
): Promise<ParseKeypairResult> {
  return parseSecretKey(await file.text());
}
