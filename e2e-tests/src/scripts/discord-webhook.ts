import { createInitialTestMessage, createComprehensiveTestReport } from "../discord/messages.js";
import { DiscordWebhookClient } from "../discord/webhook-client.js";
import config from "../config.js";
import { sleep } from "../solana-lib.js";

// 1. Initial test message
const initialMessage = createInitialTestMessage({
  testId: "GS-TEST-20230715-001",
  startTime: new Date(),
  funderBalances: { sol: 5.2345, usdc: 1000.25 },
  swapperBalances: { sol: 0.0, usdc: 0.0 },
});

const reportMessage = createComprehensiveTestReport({
  testId: "GS-TEST-20230715-001",
  startTime: new Date(Date.now() - 15000), // 15 seconds ago
  endTime: new Date(),
  initialBalances: {
    funder: { sol: 5.2345, usdc: 1000.25 },
    swapper: { sol: 0.0, usdc: 0.0 },
  },
  finalBalances: {
    funder: { sol: 5.2324, usdc: 996.3 },
    swapper: { sol: 0.0, usdc: 0.0 },
  },
  fundingStatus: { success: true, amount: 6, duration: 10 },
  cleanupStatus: {
    success: true,
    returnedSol: 0.1214,
    returnedTokens: 3,
    txId: "1233123",
  },
  swapStatus: {
    success: true,
    duration: 5,
    swapAmount: 3,
    receivedAmount: 0.1234,
    transactionId: "dgdgsdg",
  },
  overallSuccess: true,
});

const webhookClient = new DiscordWebhookClient(config.discordWebhookUrl);

await webhookClient.sendMessage(initialMessage);
await sleep(4000);
await webhookClient.sendMessage(reportMessage);
