/**
 * Reference values produced by the Squads SDK this package replaces
 * (`@sqds/multisig` on `@solana/web3.js` 1), for the tests to match
 * byte-for-byte. `sdk-golden.json` holds the SDK's output for:
 *
 * - `single`, `mixed`: the vault, web3-style instructions (base58 keys, hex
 *   data) and the compact message bytes `vaultTransactionCreate` /
 *   `batchAddTransaction` would carry; `mixed` repeats accounts with
 *   different roles and has a 300-byte payload (u16 data length);
 * - `batchAddTransaction`, `batchCreate`, `proposalCreate`,
 *   `proposalActivate`, `proposalApprove`: instruction keys and data for
 *   multisig `Bf48…`, member `HJ8i…`, batch / transaction index 8.
 */
import {
  AccountRole,
  address,
  getBase16Encoder,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";

import golden from "./sdk-golden.json";

export { golden };

export type Web3Key = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export const hex = (text: string): ReadonlyUint8Array =>
  getBase16Encoder().encode(text);

export function web3Role({ isSigner, isWritable }: Web3Key): AccountRole {
  if (isSigner) {
    return isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  }
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

/** A web3.js `TransactionInstruction` as JSON, as a kit instruction. */
export function kitInstruction(instruction: {
  programId: string;
  keys: Web3Key[];
  data: string;
}): Instruction {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.keys.map((key) => ({
      address: address(key.pubkey),
      role: web3Role(key),
    })),
    data: hex(instruction.data),
  };
}
