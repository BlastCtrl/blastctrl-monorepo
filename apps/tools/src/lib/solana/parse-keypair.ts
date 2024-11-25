import { Keypair } from "@solana/web3.js";
interface ParseKeypairError {
  success: false;
  error: string;
}

interface ParseKeypairSuccess {
  success: true;
  keypair: Keypair;
}

type ParseKeypairResult = ParseKeypairError | ParseKeypairSuccess;

export async function parseJsonKeypair(
  file: File,
): Promise<ParseKeypairResult> {
  try {
    const jsonString = await file.text();
    const parsed = JSON.parse(jsonString);

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

    const secretKey = Uint8Array.from(parsed);
    const keypair = Keypair.fromSecretKey(secretKey);

    return {
      success: true,
      keypair,
    };
  } catch (err) {
    return {
      success: false,
      error: "Failed to parse JSON keypair: " + (err as Error).message,
    };
  }
}
