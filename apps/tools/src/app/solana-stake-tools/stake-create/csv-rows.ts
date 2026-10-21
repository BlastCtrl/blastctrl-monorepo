import { MIN_DELEGATION_LAMPORTS } from "@/lib/solana/stake-account";
import { isAddress, lamports, lamportsToSol } from "@solana/kit";
import Papa from "papaparse";
import {
  decimalFixedPointToNumber,
  decimalFixedPointToString,
} from "@solana/fixed-points";

export interface CSVRow {
  stake_amount: string;
  withdraw_authority?: string;
  stake_authority?: string;
  validator?: string;
  unlock_date?: string;
  lockup_custodian?: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ParsedData {
  rows: CSVRow[];
  totalSol: number;
  errors: ValidationError[];
}

export const MAX_ROWS = 50;
/** Minimum delegation under SIMD-0490 (Stake v5), in lamports. */
export const MIN_STAKE_LAMPORTS = Number(MIN_DELEGATION_LAMPORTS);
/** The same, as SOL for messages. */
export const MIN_STAKE_SOL = decimalFixedPointToString(
  lamportsToSol(lamports(BigInt(MIN_STAKE_LAMPORTS))),
);

export const EXAMPLE_CSV = `stake_amount,withdraw_authority,stake_authority,validator,unlock_date,lockup_custodian
1000000000,,,GREEDkpTvpKzcGvBu9qd36yk6BfjTWPShB67gLWuixMv,,
1500000000,9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM,,,2030-12-31T23:59:59Z,
2000000000,,,,2030-01-15T12:00:00Z,5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1`;

export const validateRow = (row: CSVRow, index: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const at = (field: string, message: string) =>
    errors.push({ row: index + 1, field, message });

  if (!row.stake_amount) {
    at("stake_amount", "Stake amount is required");
  } else if (!/^\d+$/.test(row.stake_amount)) {
    at("stake_amount", "Stake amount must be a whole number of lamports");
  } else if (Number(row.stake_amount) < MIN_STAKE_LAMPORTS) {
    at("stake_amount", `Minimum stake is ${MIN_STAKE_SOL} SOL (SIMD-0490)`);
  }

  if (row.withdraw_authority && !isAddress(row.withdraw_authority)) {
    at("withdraw_authority", "Invalid public key format");
  }
  if (row.stake_authority && !isAddress(row.stake_authority)) {
    at("stake_authority", "Invalid public key format");
  }
  if (row.validator && !isAddress(row.validator)) {
    at("validator", "Invalid validator vote address format");
  }
  if (row.unlock_date) {
    const ms = Date.parse(row.unlock_date);
    if (Number.isNaN(ms)) {
      at(
        "unlock_date",
        "Invalid date format (use RFC3339 format, e.g., 2024-12-31T23:59:59Z)",
      );
    } else if (ms <= Date.now()) {
      at("unlock_date", "Unlock date must be in the future");
    }
  }
  if (row.lockup_custodian && !isAddress(row.lockup_custodian)) {
    at("lockup_custodian", "Invalid lockup custodian public key format");
  }

  return errors;
};

const validateRows = (rows: CSVRow[]): ParsedData => {
  const errors: ValidationError[] = [];
  let totalLamports = 0;

  if (rows.length > MAX_ROWS) {
    errors.push({
      row: 0,
      field: "file",
      message: `Too many rows: ${rows.length}. Maximum ${MAX_ROWS} rows allowed (excluding header).`,
    });
  }
  rows.forEach((row, index) => {
    errors.push(...validateRow(row, index));
    const amount = Number(row.stake_amount);
    if (Number.isInteger(amount) && amount > 0) totalLamports += amount;
  });

  return {
    rows,
    totalSol: decimalFixedPointToNumber(
      lamportsToSol(lamports(BigInt(totalLamports))),
    ),
    errors,
  };
};

/** Parses and validates a stake-accounts CSV. Never rejects; parse failures become a file error. */
export const parseStakeCsv = (file: File) =>
  new Promise<ParsedData>((resolve) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(validateRows(results.data)),
      error: (error) =>
        resolve({
          rows: [],
          totalSol: 0,
          errors: [
            {
              row: 0,
              field: "file",
              message: `Failed to parse CSV: ${error.message}`,
            },
          ],
        }),
    });
  });
