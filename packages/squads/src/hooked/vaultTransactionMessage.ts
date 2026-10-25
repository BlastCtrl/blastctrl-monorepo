// Ported from the Squads v4 SDK, Squads-Protocol/v4 sdk/multisig/src/types.ts
// (`transactionMessageBeet`), src/utils.ts
// (`transactionMessageToMultisigTransactionMessageBytes`) and
// src/utils/compiled-keys.ts (`CompiledKeys`, itself adapted from web3.js)
// (MIT, per sdk/multisig/package.json).
/**
 * The compact transaction message that `vaultTransactionCreate` and
 * `batchAddTransaction` take as their `transactionMessage` bytes.
 *
 * This is not the Borsh `VaultTransactionMessage` the program stores in
 * `VaultTransaction` / `VaultBatchTransaction` accounts, whose vectors have
 * u32 lengths (the generated codec reads that one). The program parses these
 * bytes as its `TransactionMessage`, whose vectors have u8 lengths (u16 for
 * instruction data), which the IDL can't describe. The fields are the same,
 * so a compiled message can be handed to `vaultTransactionExecutionAccounts`.
 */
import {
  addDecoderSizePrefix,
  addEncoderSizePrefix,
  combineCodec,
  getAddressDecoder,
  getAddressEncoder,
  getArrayDecoder,
  getArrayEncoder,
  getBytesDecoder,
  getBytesEncoder,
  getStructDecoder,
  getStructEncoder,
  getU16Decoder,
  getU16Encoder,
  getU8Decoder,
  getU8Encoder,
  isSignerRole,
  isWritableRole,
  type Address,
  type Codec,
  type Decoder,
  type Encoder,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";

export type CompactCompiledInstruction = {
  /** Index of the program in `accountKeys`. */
  programIdIndex: number;
  /** Indices into `accountKeys` of the instruction's accounts, in order. */
  accountIndexes: ReadonlyUint8Array;
  data: ReadonlyUint8Array;
};

export type CompactAddressTableLookup = {
  /** The address lookup table. */
  accountKey: Address;
  /** Indices into the table of the writable accounts it loads. */
  writableIndexes: ReadonlyUint8Array;
  /** Indices into the table of the readonly accounts it loads. */
  readonlyIndexes: ReadonlyUint8Array;
};

export type CompactTransactionMessage = {
  /** The number of signers at the start of `accountKeys`. */
  numSigners: number;
  /** How many of the signers are writable (they come first). */
  numWritableSigners: number;
  /** How many of the non-signers are writable (they come first). */
  numWritableNonSigners: number;
  /**
   * Writable signers, readonly signers, writable non-signers, readonly
   * non-signers (programs included), each address once.
   */
  accountKeys: Address[];
  instructions: CompactCompiledInstruction[];
  addressTableLookups: CompactAddressTableLookup[];
};

const getU8BytesEncoder = () =>
  addEncoderSizePrefix(getBytesEncoder(), getU8Encoder());
const getU8BytesDecoder = () =>
  addDecoderSizePrefix(getBytesDecoder(), getU8Decoder());

export function getCompactTransactionMessageEncoder(): Encoder<CompactTransactionMessage> {
  const size = { size: getU8Encoder() };
  return getStructEncoder([
    ["numSigners", getU8Encoder()],
    ["numWritableSigners", getU8Encoder()],
    ["numWritableNonSigners", getU8Encoder()],
    ["accountKeys", getArrayEncoder(getAddressEncoder(), size)],
    [
      "instructions",
      getArrayEncoder(
        getStructEncoder([
          ["programIdIndex", getU8Encoder()],
          ["accountIndexes", getU8BytesEncoder()],
          ["data", addEncoderSizePrefix(getBytesEncoder(), getU16Encoder())],
        ]),
        size,
      ),
    ],
    [
      "addressTableLookups",
      getArrayEncoder(
        getStructEncoder([
          ["accountKey", getAddressEncoder()],
          ["writableIndexes", getU8BytesEncoder()],
          ["readonlyIndexes", getU8BytesEncoder()],
        ]),
        size,
      ),
    ],
  ]);
}

export function getCompactTransactionMessageDecoder(): Decoder<CompactTransactionMessage> {
  const size = { size: getU8Decoder() };
  return getStructDecoder([
    ["numSigners", getU8Decoder()],
    ["numWritableSigners", getU8Decoder()],
    ["numWritableNonSigners", getU8Decoder()],
    ["accountKeys", getArrayDecoder(getAddressDecoder(), size)],
    [
      "instructions",
      getArrayDecoder(
        getStructDecoder([
          ["programIdIndex", getU8Decoder()],
          ["accountIndexes", getU8BytesDecoder()],
          ["data", addDecoderSizePrefix(getBytesDecoder(), getU16Decoder())],
        ]),
        size,
      ),
    ],
    [
      "addressTableLookups",
      getArrayDecoder(
        getStructDecoder([
          ["accountKey", getAddressDecoder()],
          ["writableIndexes", getU8BytesDecoder()],
          ["readonlyIndexes", getU8BytesDecoder()],
        ]),
        size,
      ),
    ],
  ]);
}

export function getCompactTransactionMessageCodec(): Codec<CompactTransactionMessage> {
  return combineCodec(
    getCompactTransactionMessageEncoder(),
    getCompactTransactionMessageDecoder(),
  );
}

export type CompileVaultTransactionMessageInput = {
  /** The vault the transaction executes as; the inner message's fee payer. */
  vault: Address;
  instructions: readonly Instruction[];
};

/**
 * Compiles instructions into the message a vault transaction executes, as
 * the SDK does: the vault first, then writable signers, readonly signers,
 * writable non-signers and readonly non-signers (programs included), each
 * group in the order the addresses first appear (the vault, then each
 * instruction's program and its accounts), an address's roles merged across
 * instructions. The instructions' accounts become indices into that list.
 * No address lookup tables.
 *
 * This is the SDK's fork of web3.js's `CompiledKeys`
 * (sdk/multisig/src/utils/compiled-keys.ts) rather than kit's
 * `compileTransactionMessage`: kit sorts the addresses inside each group, so
 * its messages differ in key order (both execute the same) and wouldn't
 * match bytes the SDK produced.
 */
export function compileVaultTransactionMessage({
  vault,
  instructions,
}: CompileVaultTransactionMessageInput): CompactTransactionMessage {
  const keys = new Map<Address, { isSigner: boolean; isWritable: boolean }>();
  const meta = (address: Address) => {
    let entry = keys.get(address);
    if (!entry) {
      entry = { isSigner: false, isWritable: false };
      keys.set(address, entry);
    }
    return entry;
  };

  Object.assign(meta(vault), { isSigner: true, isWritable: true });
  for (const instruction of instructions) {
    meta(instruction.programAddress);
    for (const account of instruction.accounts ?? []) {
      const entry = meta(account.address);
      entry.isSigner ||= isSignerRole(account.role);
      entry.isWritable ||= isWritableRole(account.role);
    }
  }

  const entries = [...keys];
  if (entries.length > 256) {
    throw new Error(
      `A vault transaction message can hold 256 accounts, got ${entries.length}`,
    );
  }
  const group = (isSigner: boolean, isWritable: boolean) =>
    entries
      .filter(([, m]) => m.isSigner === isSigner && m.isWritable === isWritable)
      .map(([address]) => address);
  const writableSigners = group(true, true);
  const readonlySigners = group(true, false);
  const writableNonSigners = group(false, true);
  const readonlyNonSigners = group(false, false);
  const accountKeys = [
    ...writableSigners,
    ...readonlySigners,
    ...writableNonSigners,
    ...readonlyNonSigners,
  ];
  const indexOf = new Map(
    accountKeys.map((address, index) => [address, index]),
  );
  const index = (address: Address) => indexOf.get(address) as number;

  return {
    numSigners: writableSigners.length + readonlySigners.length,
    numWritableSigners: writableSigners.length,
    numWritableNonSigners: writableNonSigners.length,
    accountKeys,
    instructions: instructions.map((instruction) => ({
      programIdIndex: index(instruction.programAddress),
      accountIndexes: new Uint8Array(
        (instruction.accounts ?? []).map((account) => index(account.address)),
      ),
      data: instruction.data ?? new Uint8Array(),
    })),
    addressTableLookups: [],
  };
}

/**
 * {@link compileVaultTransactionMessage}, encoded: the `transactionMessage`
 * argument of `vaultTransactionCreate` and `batchAddTransaction`.
 */
export function encodeVaultTransactionMessage(
  input: CompileVaultTransactionMessageInput,
): ReadonlyUint8Array {
  return getCompactTransactionMessageEncoder().encode(
    compileVaultTransactionMessage(input),
  );
}
