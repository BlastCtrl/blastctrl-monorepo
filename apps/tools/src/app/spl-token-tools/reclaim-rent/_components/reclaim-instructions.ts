import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-2022";
import {
  getCloseAccountInstruction,
  getWithdrawExcessLamportsInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { address, type Instruction, type TransactionSigner } from "@solana/kit";
import type { ServiceFee } from "./fee";
import { createServiceFeeInstruction } from "./fee";
import type { ReclaimableAccount } from "./types";
import { closes, feeBase } from "./types";

/**
 * One instruction per account (closing it, or withdrawing its excess), then
 * the service fee if there is one. Both instructions take the same three
 * accounts and a one-byte payload, so a batch is the same size either way.
 */
export function buildReclaimInstructions(
  accounts: ReclaimableAccount[],
  wallet: TransactionSigner,
  fee: ServiceFee | null,
  closeEmpty: boolean,
): Instruction[] {
  const instructions: Instruction[] = accounts.map((account) => {
    const programAddress =
      account.program === "token-2022"
        ? TOKEN_2022_PROGRAM_ADDRESS
        : TOKEN_PROGRAM_ADDRESS;
    return closes(account, closeEmpty)
      ? getCloseAccountInstruction(
          {
            account: address(account.address),
            destination: wallet.address,
            owner: wallet,
          },
          { programAddress },
        )
      : getWithdrawExcessLamportsInstruction(
          {
            source: address(account.address),
            destination: wallet.address,
            authority: wallet,
          },
          { programAddress },
        );
  });
  if (fee) {
    const transfer = createServiceFeeInstruction(
      wallet,
      feeBase(accounts),
      fee,
    );
    if (transfer) instructions.push(transfer);
  }
  return instructions;
}
