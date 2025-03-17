import { formatNumber } from "../solana-lib.js";

export function createInitialTestMessage(data: {
  testId: string;
  startTime: Date;
  funderBalances: { sol: number; usdc: number };
  swapperBalances: { sol: number; usdc: number };
}) {
  const { testId, startTime, funderBalances, swapperBalances } = data;

  // Format SOL with 4 decimal places and USDC with 2
  const formattedFunderSol = formatNumber(funderBalances.sol, 9);
  const formattedFunderUsdc = formatNumber(funderBalances.usdc, 6);
  const formattedSwapperSol = formatNumber(swapperBalances.sol, 9);
  const formattedSwapperUsdc = formatNumber(swapperBalances.usdc, 6);

  // Warning flags for unexpected balances
  const hasSwapperBalance = swapperBalances.sol > 0 || swapperBalances.usdc > 0;

  return {
    embeds: [
      {
        title: "🧪 Gasless Swap E2E Test Started",
        description: `Test ID: \`${testId}\`\nStarted at: <t:${Math.floor(startTime.getTime() / 1000)}:F>`,
        color: 0x3498db, // Blue color
        thumbnail: {
          url: "https://s3.eu-central-1.amazonaws.com/blastctrl.com/android-chrome-192x192.png",
          // url: "https://blastctrl.com/images/blast/BlastCtrl_Icon_Vector_Red.svg",
          // url: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png", // USDC logo
        },
        fields: [
          {
            name: "Pre-Test Balances",
            value: "\u200b", // Zero-width space to create a visual divider
            inline: false,
          },
          {
            name: "💰 Funder",
            value: `**${formattedFunderSol}** ◎\n**${formattedFunderUsdc}** $`,
            inline: true,
          },
          {
            name: "🧪 Swapper",
            value: `**${formattedSwapperSol}** ◎\n**${formattedSwapperUsdc}** $${hasSwapperBalance ? "\n\n⚠️ **WARNING:** Unexpected balance detected" : ""}`,
            inline: true,
          },
          { name: "", value: "\u200b", inline: false },
          {
            name: "🔄 **Initializing test...**",
            value: "",
            inline: false,
          },
        ],
        footer: {
          text: "Gasless Swap E2E Test Runner",
        },
        timestamp: startTime.toISOString(),
      },
    ],
  };
}

export function createComprehensiveTestReport(data: {
  testId: string;
  startTime: Date;
  endTime: Date;
  initialBalances: {
    funder: { sol: number; usdc: number };
    swapper: { sol: number; usdc: number };
  };
  finalBalances: { funder: { sol: number; usdc: number }; swapper: { sol: number; usdc: number } };
  fundingStatus: {
    success: boolean;
    transactionId?: string;
    amount: number;
    duration: number;
    errorReason?: string;
  };
  swapStatus: {
    success: boolean;
    swapAmount: number;
    receivedAmount?: number;
    duration: number;
    transactionId?: string;
    errorReason?: string;
  };
  cleanupStatus: {
    success: boolean;
    txId?: string;
    returnedTokens: number;
    returnedSol: number;
    errorReason?: string;
  };
  overallSuccess: boolean;
}) {
  const {
    testId,
    startTime,
    endTime,
    initialBalances,
    finalBalances,
    fundingStatus,
    swapStatus,
    cleanupStatus,
    overallSuccess,
  } = data;

  // Calculate duration in seconds
  const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;

  // Calculate balance changes
  const solChange = finalBalances.funder.sol - initialBalances.funder.sol;
  const usdcChange = finalBalances.funder.usdc - initialBalances.funder.usdc;

  // Calculate percentage changes
  const solPercentChange =
    initialBalances.funder.sol !== 0 ? (solChange / initialBalances.funder.sol) * 100 : 0;
  const usdcPercentChange =
    initialBalances.funder.usdc !== 0 ? (usdcChange / initialBalances.funder.usdc) * 100 : 0;

  const resultEmoji = overallSuccess ? "✅" : "❌";
  const resultColor = overallSuccess ? 0x2ecc71 : 0xe74c3c; // Green or Red

  const swapperHasBalance = finalBalances.swapper.sol > 0.01 || finalBalances.swapper.usdc > 0;

  // Create the embeds
  const embeds = [
    {
      title: "🔄 Test Phases",
      color: 0x3498db, // Blue
      fields: [
        // Funding phase
        {
          name: `\n${fundingStatus.success ? "✅" : "❌"} 1. Funding Phase`,
          value: `${fundingStatus.success ? "Successfully" : "Failed to"} transfer **${formatNumber(fundingStatus.amount, 6)} USDC** in ${fundingStatus.duration.toFixed(2)}s
          ${fundingStatus.transactionId ? `[View Transaction](https://explorer.solana.com/tx/${fundingStatus.transactionId})` : ""}
          ${fundingStatus.errorReason ? `\n❌ **Error:** ${fundingStatus.errorReason}` : ""}`,
          inline: false,
        },

        // Swap phase
        {
          name: `${swapStatus.success ? "✅" : "❌"} 2. Gasless Swap Phase`,
          value: `${swapStatus.success ? "Successfully" : "Failed to"} swap **${formatNumber(swapStatus.swapAmount, 6)} USDC** ${swapStatus.receivedAmount ? `for **${formatNumber(swapStatus.receivedAmount, 9)} SOL**` : ""} in ${swapStatus.duration.toFixed(2)}s
          ${swapStatus.transactionId ? `[View Transaction](https://explorer.solana.com/tx/${swapStatus.transactionId})` : ""}
          ${swapStatus.errorReason ? `\n❌ **Error:** ${swapStatus.errorReason}` : ""}`,
          inline: false,
        },

        // Cleanup phase
        {
          name: `${cleanupStatus.success ? "✅" : "❌"} 3. Cleanup Phase`,
          value: `${cleanupStatus.success ? "Successfully" : "Failed to"} return **${formatNumber(cleanupStatus.returnedTokens, 6)} USDC** and **${formatNumber(cleanupStatus.returnedSol, 9)} SOL**
          ${cleanupStatus.txId ? `[View Transaction](https://explorer.solana.com/tx/${cleanupStatus.txId})` : ""}
          ${cleanupStatus.errorReason ? `\n❌ **Error:** ${cleanupStatus.errorReason}` : ""}`,
          inline: false,
        },
      ],
    },

    {
      title: `${resultEmoji} Gasless Swap E2E Test ${overallSuccess ? "Completed" : "Failed"}`,
      description: `Test ID: \`${testId}\`\nTotal Duration: **${totalDuration.toFixed(2)}s**`,
      color: resultColor,
      fields: [
        {
          name: "💰 Funder Final Balances",
          value: `${formatNumber(finalBalances.funder.sol, 9)} ◎ (${solChange >= 0 ? "+" : ""}${formatNumber(solChange, 9)} ◎, ${solPercentChange >= 0 ? "+" : ""}${solPercentChange.toFixed(2)}%)\n${formatNumber(finalBalances.funder.usdc, 6)} $ (${usdcChange >= 0 ? "+" : ""}${formatNumber(usdcChange, 6)} $, ${usdcPercentChange >= 0 ? "+" : ""}${usdcPercentChange.toFixed(2)}%)`,
          inline: false,
        },
        {
          name: "🧪 Swapper Final Balances",
          value: `${formatNumber(finalBalances.swapper.sol, 9)} ◎\n${formatNumber(finalBalances.swapper.usdc, 6)} $${swapperHasBalance ? "\n\n⚠️ **WARNING:** Leftover balance detected" : ""}`,
          inline: false,
        },
      ],
      footer: {
        text: "Gasless Swap E2E Test Runner",
      },
      timestamp: endTime.toISOString(),
    },
  ];

  return { embeds };
}
