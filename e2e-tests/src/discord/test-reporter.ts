import { createInitialTestMessage, createComprehensiveTestReport } from "./messages.js";
import { DiscordWebhookClient } from "./webhook-client.js";
import { getSolBalance, getTokenBalance, formatNumber, sleep } from "../solana-lib.js";
import CONFIG from "../config.js";

export type CleanupStepData = {
  success: boolean;
  tokensToReturn: number;
  solToReturn: number;
  transferTxid?: string;
  transferErrorReason?: string;
  swapTxid?: string;
  swapErrorReason?: string;
};

export type SwapStepData = {
  success: boolean;
  swapAmount: number;
  duration: number;
  transactionId?: string;
  errorReason?: string;
};

/**
 * TestReporter handles both tracking test progress and reporting to Discord
 */
export class TestReporter {
  private webhookClient: DiscordWebhookClient;

  // Test metadata
  testId: string;
  startTime: Date;

  // Test state
  initialBalances: {
    funder: { sol: number; usdc: number };
    swapper: { sol: number; usdc: number };
  };
  finalBalances: {
    funder: { sol: number; usdc: number };
    swapper: { sol: number; usdc: number };
  } | null = null;

  // Test phases state
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

  cleanupStatus: CleanupStepData | null = null;

  overallSuccess: boolean = false;

  constructor(webhookUrl: string = CONFIG.discordWebhookUrl) {
    this.webhookClient = new DiscordWebhookClient(webhookUrl);

    // Generate a unique test ID
    this.testId = `GS-TEST-${new Date().toISOString().split("T")[0]}-${Math.floor(
      Math.random() * 1000,
    )
      .toString()
      .padStart(3, "0")}`;
    this.startTime = new Date();

    // Initialize with empty balances - will be populated in init()
    this.initialBalances = {
      funder: { sol: 0, usdc: 0 },
      swapper: { sol: 0, usdc: 0 },
    };
  }

  /**
   * Initialize the test reporter, get initial balances, and send the initial message
   */
  async init(): Promise<void> {
    try {
      // Get initial balances
      const funderSol = (await getSolBalance(CONFIG.funder.publicKey)) / 1e9;
      const funderUsdc = await getTokenBalance(CONFIG.funder.publicKey, CONFIG.usdcMint);
      const swapperSol = (await getSolBalance(CONFIG.swapper.publicKey)) / 1e9;
      const swapperUsdc = await getTokenBalance(CONFIG.swapper.publicKey, CONFIG.usdcMint);

      // Store initial balances
      this.initialBalances = {
        funder: { sol: funderSol, usdc: funderUsdc },
        swapper: { sol: swapperSol, usdc: swapperUsdc },
      };

      // Send the initial message
      const message = createInitialTestMessage({
        testId: this.testId,
        startTime: this.startTime,
        funderBalances: this.initialBalances.funder,
        swapperBalances: this.initialBalances.swapper,
      });

      await this.webhookClient.sendMessage(message);
    } catch (error) {
      console.error("Failed to initialize test reporter:", error);
      // If we can't get balances, we'll continue with empty balances
      // but still try to send initial message
      try {
        const message = createInitialTestMessage({
          testId: this.testId,
          startTime: this.startTime,
          funderBalances: this.initialBalances.funder,
          swapperBalances: this.initialBalances.swapper,
        });

        await this.webhookClient.sendMessage(message);
      } catch (msgError) {
        console.error("Failed to send initial message:", msgError);
      }
    }
  }

  /**
   * Record funding phase status
   */
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

  /**
   * Record swap phase status
   */
  recordSwapStatus(success: boolean, data: Omit<SwapStepData, "success">): void {
    this.swapStatus = { success, ...data };
  }

  /**
   * Record cleanup phase status
   */
  recordCleanupStatus(success: boolean, data: Omit<CleanupStepData, "success">): void {
    this.cleanupStatus = {
      success,
      tokensToReturn: data.tokensToReturn,
      solToReturn: data.solToReturn,
      swapErrorReason: data.swapErrorReason,
      transferErrorReason: data.transferErrorReason,
      swapTxid: data.swapTxid,
      transferTxid: data.transferTxid,
    };
  }

  /**
   * Send the final report to Discord
   */
  async reportTestCompletion(success: boolean): Promise<void> {
    try {
      // wait 5 seconds before getting the final balances
      await sleep(5000);
      const finalFunderSol = (await getSolBalance(CONFIG.funder.publicKey)) / 1e9;
      const finalFunderUsdc = await getTokenBalance(CONFIG.funder.publicKey, CONFIG.usdcMint);
      const finalSwapperSol = (await getSolBalance(CONFIG.swapper.publicKey)) / 1e9;
      const finalSwapperUsdc = await getTokenBalance(CONFIG.swapper.publicKey, CONFIG.usdcMint);

      // Store final balances and success status
      this.finalBalances = {
        funder: { sol: finalFunderSol, usdc: finalFunderUsdc },
        swapper: { sol: finalSwapperSol, usdc: finalSwapperUsdc },
      };
      this.overallSuccess = success;

      // Generate and send the final report
      await this.sendComprehensiveReport();
    } catch (error) {
      console.error("Error getting final balances:", error);

      // If we can't get final balances, use initial ones as a fallback
      this.finalBalances = this.initialBalances;
      this.overallSuccess = false;

      // Still try to send the report
      await this.sendComprehensiveReport();
    }
  }

  /**
   * Generate the comprehensive report and send it
   */
  private async sendComprehensiveReport(): Promise<void> {
    try {
      // Ensure we have all required data, with fallbacks if missing
      const finalBalances = this.finalBalances || this.initialBalances;
      const fundingStatus = this.fundingStatus || {
        success: false,
        amount: 0,
        duration: 0,
        errorReason: "Missing funding data",
      };
      const swapStatus = this.swapStatus || {
        success: false,
        swapAmount: 0,
        duration: 0,
        errorReason: "Missing swap data",
      };
      const cleanupStatus = this.cleanupStatus || {
        success: false,
        tokensToReturn: 0,
        solToReturn: 0,
        swapErrorReason: "Missing cleanup data",
      };

      // Generate the report
      const report = createComprehensiveTestReport({
        testId: this.testId,
        startTime: this.startTime,
        endTime: new Date(),
        initialBalances: this.initialBalances,
        finalBalances: finalBalances,
        fundingStatus: fundingStatus,
        swapStatus: swapStatus,
        cleanupStatus: cleanupStatus,
        overallSuccess: this.overallSuccess,
      });

      // Send the report
      await this.webhookClient.sendFinalReport(report);
    } catch (error) {
      console.error("Failed to send final report:", error);

      // Last-ditch effort: try to send a minimal error report
      try {
        const minimalReport = {
          embeds: [
            {
              title: "❌ Gasless Swap Test Failed",
              description: `Test ID: \`${this.testId}\`\nFailed to generate complete report.`,
              color: 0xe74c3c, // Red
              timestamp: new Date().toISOString(),
            },
          ],
        };
        await this.webhookClient.sendFinalReport(minimalReport);
      } catch (msgError) {
        console.error("Failed to send even minimal error report:", msgError);
      }
    }
  }
}
