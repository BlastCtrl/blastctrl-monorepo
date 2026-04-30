import {
  OnDemandFunding,
  TurboFactory,
  type SolanaWalletAdapter,
  type TurboAuthenticatedClient,
} from "@ardrive/turbo-sdk/web";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import BigNumber from "bignumber.js";
import type { Amount } from "@/types";
import { amount, lamports, toBigNumber } from "@/types";

export const TURBO_CREDIT = {
  symbol: "Credits",
  decimals: 12,
} as const;
export type TurboCreditAmount = Amount<typeof TURBO_CREDIT>;

export type TurboUploadResult = { id: string };

export class TurboStorage {
  private turbo: TurboAuthenticatedClient;
  private constructor(turbo: TurboAuthenticatedClient) {
    this.turbo = turbo;
  }

  static async make(wallet: WalletContextState) {
    if (!wallet.publicKey) {
      throw new Error("Wallet is not connected");
    }
    if (!wallet.signMessage) {
      throw new Error("Wallet does not support signing messages");
    }
    if (!wallet.signTransaction) {
      throw new Error("Wallet does not support signing transactions");
    }

    const { publicKey, signMessage, signTransaction } = wallet;

    const walletAdapter: SolanaWalletAdapter = {
      publicKey: {
        toString: () => publicKey.toBase58(),
        toBuffer: () => publicKey.toBuffer(),
      },
      signMessage: (message) => signMessage(message),
      signTransaction: (tx) => signTransaction(tx),
    };

    const turbo = TurboFactory.authenticated({
      token: "solana",
      walletAdapter,
      gatewayUrl: process.env.NEXT_PUBLIC_RPC_ENDPOINT,
    });

    return new TurboStorage(turbo);
  }

  async uploadFile(file: File): Promise<TurboUploadResult> {
    const tags = [
      {
        name: "Content-Type",
        value: file.type || "application/octet-stream",
      },
    ];
    const { id } = await this.turbo.upload({
      data: file,
      dataItemOpts: { tags },
      fundingMode: new OnDemandFunding({ topUpBufferMultiplier: 1.5 }),
    });

    console.log(`File uploaded ==> https://arweave.net/${id}`);
    return { id };
  }

  async getBalance(): Promise<TurboCreditAmount> {
    const { winc } = await this.turbo.getBalance();
    return amount(toBigNumber(winc), TURBO_CREDIT);
  }

  async getUploadPrice(bytes: number) {
    const { tokenPrice } = await this.turbo.getTokenPriceForBytes({
      byteCount: bytes,
    });
    const buffered = new BigNumber(tokenPrice)
      .multipliedBy(1.5)
      .decimalPlaces(0);
    return lamports(toBigNumber(buffered.toString()));
  }
}
