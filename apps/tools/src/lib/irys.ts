import { WebIrys } from "@irys/sdk";
import type { UploadResponse } from "@irys/sdk/build/cjs/common/types";
import type { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import BigNumber from "bignumber.js";
import type { Amount } from "@/types";
import { lamports, toBigNumber } from "@/types";

const nodes = {
  "mainnet-beta": [
    "https://node1.irys.xyz",
    process.env.NEXT_PUBLIC_RPC_ENDPOINT!,
  ],
  testnet: ["https://devnet.irys.xyz", "https://api.devnet.solana.com"],
  devnet: ["https://devnet.irys.xyz", "https://api.devnet.solana.com"],
} as const;

export class IrysStorage {
  private webIrys: WebIrys;
  private constructor(irys: WebIrys) {
    this.webIrys = irys;
  }

  static async makeWebIrys(
    network: WalletAdapterNetwork,
    provider: WalletContextState,
  ) {
    const [irysNode, rpcUrl] = nodes[network] ?? nodes["mainnet-beta"];
    const wallet = { rpcUrl, name: "solana", provider };
    const webIrys = new WebIrys({ url: irysNode, token: "solana", wallet });
    await webIrys.ready();
    return new IrysStorage(webIrys);
  }

  async uploadFile(file: File): Promise<UploadResponse> {
    const tags = [{ name: "Content-Type", value: file.type }];
    const amount = await this.webIrys.getPrice(file.size);
    await this.webIrys.fund(amount, 1.5);
    const response = await this.webIrys.uploadFile(file, { tags });

    console.log(`File uploaded ==> https://gateway.irys.xyz/${response.id}`);
    return response;
  }

  async getBalance() {
    const balance = await this.webIrys.getLoadedBalance();

    return bigNumberToAmount(balance);
  }

  async getUploadPrice(bytes: number): Promise<Amount> {
    const price = await this.webIrys.getPrice(bytes);

    return bigNumberToAmount(price.multipliedBy(1.5));
  }

  async withdrawAll() {
    const balance = await this.webIrys.getLoadedBalance();
    const minimumBalance = new BigNumber(5000);

    if (balance.isLessThan(minimumBalance)) {
      throw Error(`Withdraw error: insufficient balance.`);
    }

    const balanceToWithdraw = balance.minus(minimumBalance);
    return this.webIrys.withdrawBalance(balanceToWithdraw);
  }
}

function bigNumberToAmount(bigNumber: BigNumber): Amount {
  return lamports(toBigNumber(bigNumber.decimalPlaces(0).toString()));
}
