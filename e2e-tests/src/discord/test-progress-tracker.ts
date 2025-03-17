import { createComprehensiveTestReport } from "./messages.js";

export class TestProgressTracker {
  testId: string;
  startTime: Date;
  initialBalances: {
    funder: { sol: number; usdc: number };
    swapper: { sol: number; usdc: number };
  };
  finalBalances: {
    funder: { sol: number; usdc: number };
    swapper: { sol: number; usdc: number };
  } | null = null;

  fundingStatus: {
    success: boolean;
    transactionId?: string;
    amount: number;
    duration: number;
    errorReason?: string;
  } | null = null;

  swapStatus: {
    success: boolean;
    swapAmount: number;
    receivedAmount?: number;
    duration: number;
    transactionId?: string;
    errorReason?: string;
  } | null = null;

  cleanupStatus: {
    success: boolean;
    tokensTxId?: string;
    solTxId?: string;
    returnedTokens: number;
    returnedSol: number;
    errorReason?: string;
  } | null = null;

  overallSuccess: boolean = false;

  constructor(testId: string, startTime: Date, initialBalances: any) {
    this.testId = testId;
    this.startTime = startTime;
    this.initialBalances = initialBalances;
  }

  recordFundingStatus(
    success: boolean,
    data: {
      transactionId?: string;
      amount: number;
      duration: number;
      errorReason?: string;
    },
  ): void {
    this.fundingStatus = { success, ...data };
  }

  recordSwapStatus(
    success: boolean,
    data: {
      swapAmount: number;
      receivedAmount?: number;
      duration: number;
      transactionId?: string;
      errorReason?: string;
    },
  ): void {
    this.swapStatus = { success, ...data };
  }

  recordCleanupStatus(
    success: boolean,
    data: {
      tokensTxId?: string;
      solTxId?: string;
      returnedTokens: number;
      returnedSol: number;
      errorReason?: string;
    },
  ): void {
    this.cleanupStatus = { success, ...data };
  }

  recordFinalBalances(balances: any, success: boolean): void {
    this.finalBalances = balances;
    this.overallSuccess = success;
  }

  generateComprehensiveReport(): any {
    if (!this.finalBalances || !this.fundingStatus || !this.swapStatus || !this.cleanupStatus) {
      throw new Error("Cannot generate report: Missing required test data");
    }

    return createComprehensiveTestReport({
      testId: this.testId,
      startTime: this.startTime,
      endTime: new Date(),
      initialBalances: this.initialBalances,
      finalBalances: this.finalBalances,
      fundingStatus: this.fundingStatus,
      swapStatus: this.swapStatus,
      cleanupStatus: this.cleanupStatus,
      overallSuccess: this.overallSuccess,
    });
  }
}
