import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";

interface ParseKeypairError {
  success: false;
  error: string;
}

interface ParseKeypairSuccess {
  success: true;
  signer: KeyPairSigner;
}

type ParseKeypairResult = ParseKeypairError | ParseKeypairSuccess;

/** Reads a Solana CLI style keypair file (JSON array of 64 bytes) into a kit signer. */
export async function parseJsonKeypair(
  file: File,
): Promise<ParseKeypairResult> {
  try {
    const parsed: unknown = JSON.parse(await file.text());

    if (!Array.isArray(parsed) || parsed.length !== 64) {
      return {
        success: false,
        error: "Invalid keypair format - must be array of 64 numbers",
      };
    }
    if (!parsed.every((n) => typeof n === "number" && n >= 0 && n <= 255)) {
      return {
        success: false,
        error: "Invalid keypair format - array must contain numbers 0-255",
      };
    }

    const signer = await createKeyPairSignerFromBytes(Uint8Array.from(parsed));
    return { success: true, signer };
  } catch (err) {
    return {
      success: false,
      error: "Failed to parse JSON keypair: " + (err as Error).message,
    };
  }
}
