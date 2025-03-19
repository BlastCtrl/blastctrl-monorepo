import config from "../config.js";

export class DiscordWebhookClient {
  private webhookUrl: string;
  private lastMessageId: string | null = null;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Send a new message to the Discord webhook
   */
  async sendMessage(message: any): Promise<void> {
    if (config.disableDiscordLogs) return;
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const data = await response.text();
      console.log(data);
    } catch (error) {
      console.error("Failed to send Discord webhook message:", error);
      throw error;
    }
  }

  async sendFinalReport(message: any): Promise<void> {
    if (config.disableDiscordLogs) return;
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      return;
    } catch (error) {
      console.error("Failed to send final Discord webhook message:", error);
      throw error;
    }
  }
}
