import {
  address,
  getAddressDecoder,
  getU16Decoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";

/**
 * What the app needs from Token-2022 without `@solana-program/token-2022`,
 * which is not installed because it peers on `@solana/zk-sdk`. The token
 * client's instruction builders accept the program address via
 * `programAddress`, and the extension list below is a plain TLV walk.
 */

export const TOKEN_2022_PROGRAM_ADDRESS = address(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

/** Extension type ids (`ExtensionType` in the program) the app reasons about. */
export const MINT_EXTENSION = {
  TransferFeeConfig: 1,
  DefaultAccountState: 6,
  NonTransferable: 9,
  PermanentDelegate: 12,
  TransferHook: 14,
} as const;

const MINT_SIZE = 82;
const TOKEN_ACCOUNT_SIZE = 165;
const ACCOUNT_TYPE_MINT = 1;
const TLV_START = TOKEN_ACCOUNT_SIZE + 1;

/**
 * Whether token program account data is a mint: the 82-byte base on its own,
 * or Token-2022's form padded past the token-account size with the mint
 * account type before its extensions. A token account is 165 bytes, or
 * carries the token account type there instead.
 */
export function isMintAccountData(data: ReadonlyUint8Array): boolean {
  return (
    data.length === MINT_SIZE ||
    (data.length >= TLV_START && data[TOKEN_ACCOUNT_SIZE] === ACCOUNT_TYPE_MINT)
  );
}

/**
 * Extension type ids present on a mint account's data. Token-2022 pads the
 * 82-byte mint to the token-account size, writes an account-type byte, then
 * TLV entries of `u16 type, u16 length, data`. A classic Token mint has none.
 */
export function getMintExtensionTypes(data: ReadonlyUint8Array): number[] {
  return getMintExtensions(data).map(({ type }) => type);
}

/** The TLV entries of a Token-2022 mint's data; empty for a classic mint. */
function getMintExtensions(
  data: ReadonlyUint8Array,
): { type: number; offset: number; length: number }[] {
  if (
    data.length <= TLV_START ||
    data[TOKEN_ACCOUNT_SIZE] !== ACCOUNT_TYPE_MINT
  ) {
    return [];
  }

  const u16 = getU16Decoder();
  const entries: { type: number; offset: number; length: number }[] = [];
  let offset = TLV_START;
  while (offset + 4 <= data.length) {
    const type = u16.decode(data, offset);
    if (type === 0) break; // Uninitialized: only padding follows.
    const length = u16.decode(data, offset + 2);
    entries.push({ type, offset: offset + 4, length });
    offset += 4 + length;
  }
  return entries;
}

/**
 * The program a transfer of this mint must call, or `null` when the mint has
 * no transfer hook or the hook is unset (the extension present with an
 * all-zero program id, as PYUSD has it). A `TransferChecked` of a hooked mint
 * needs the hook's extra accounts appended, which the hook program lists.
 */
export function getTransferHookProgram(
  data: ReadonlyUint8Array,
): Address | null {
  const hook = getMintExtensions(data).find(
    ({ type }) => type === MINT_EXTENSION.TransferHook,
  );
  // Layout: authority (32 bytes), program id (32 bytes).
  if (!hook || hook.length < 64) return null;
  const programId = data.subarray(hook.offset + 32, hook.offset + 64);
  if (programId.every((byte) => byte === 0)) return null;
  return getAddressDecoder().decode(programId);
}
