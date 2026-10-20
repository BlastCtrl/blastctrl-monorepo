import {
  OnDemandFunding,
  TurboFactory,
  type SolanaWalletAdapter,
  type TurboAuthenticatedClient,
} from "@ardrive/turbo-sdk/web";
import type { WalletAdapterCompatible } from "@solana/connector/compat";
import {
  formatDecimalFixedPoint,
  rawDecimalFixedPoint,
  type DecimalFixedPoint,
} from "@solana/fixed-points";
import {
  getBase58Encoder,
  lamports,
  sol,
  solToLamports,
  type Lamports,
} from "@solana/kit";

/** Turbo credits, counted in "winc": a credit has twelve decimals. */
export type TurboCredits = DecimalFixedPoint<"unsigned", 64, 12>;
const turboCredits = rawDecimalFixedPoint("unsigned", 64, 12);

/** `credits` for display, up to all twelve decimals, trailing zeros dropped. */
export const formatTurboCredits = (credits: TurboCredits) =>
  formatDecimalFixedPoint(
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 12 }),
    credits,
  );

export type TurboUploadResult = { id: string };

/** The slice of the connector's wallet-adapter compat object that Turbo needs. */
export type TurboWallet = Pick<
  WalletAdapterCompatible,
  "publicKey" | "signMessage" | "signTransaction"
>;

export class TurboStorage {
  private turbo: TurboAuthenticatedClient;
  private constructor(turbo: TurboAuthenticatedClient) {
    this.turbo = turbo;
  }

  static make(wallet: TurboWallet) {
    const { publicKey, signMessage, signTransaction } = wallet;
    if (!publicKey) {
      throw new Error("Wallet is not connected");
    }
    if (!signMessage) {
      throw new Error("Wallet does not support signing messages");
    }

    // Turbo's Solana adapter is modelled on the legacy wallet adapter; the
    // connector's compat bridge provides the same signing functions over a
    // base58 address string.
    const walletAdapter: SolanaWalletAdapter = {
      publicKey: {
        toString: () => publicKey,
        toBuffer: () => Buffer.from(getBase58Encoder().encode(publicKey)),
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

  async getBalance(): Promise<TurboCredits> {
    const { winc } = await this.turbo.getBalance();
    return turboCredits(BigInt(winc));
  }

  /**
   * What `bytes` cost to upload, in lamports, with half as much again on
   * top so a price that moves before the upload settles doesn't fail it.
   * Turbo quotes in SOL; the result is rounded up to whole lamports.
   */
  async getUploadPrice(bytes: number): Promise<Lamports> {
    const { tokenPrice } = await this.turbo.getTokenPriceForBytes({
      byteCount: bytes,
    });
    const quoted = solToLamports(sol(tokenPrice, "ceil"));
    return lamports((quoted * 3n + 1n) / 2n);
  }
}
