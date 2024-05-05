import { useCallback } from "react";

import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type {
  Commitment,
  RpcResponseAndContext,
  SignatureResult,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TransactionMessage, VersionedTransaction } from "@solana/web3.js";

interface SendTransactionOptions {
  commitment?: Commitment;
  skipPreflight?: boolean;
}

export interface SendAndConfirmReturnType {
  signature: string;
  result: RpcResponseAndContext<SignatureResult>;
}

export const useWalletConnection = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected, signAllTransactions } =
    useWallet();

  const sendAndConfirmTransaction = useCallback(
    async (
      transaction: Transaction,
      opts?: SendTransactionOptions,
    ): Promise<SendAndConfirmReturnType> => {
      if (!publicKey) throw new WalletNotConnectedError();

      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext(opts?.commitment);

      const signature = await sendTransaction(transaction, connection, {
        minContextSlot,
        maxRetries: 0,
        preflightCommitment: opts?.commitment,
        skipPreflight: opts?.skipPreflight,
      });

      console.log(signature);

      const result = await connection.confirmTransaction(
        { blockhash, lastValidBlockHeight, signature },
        opts?.commitment,
      );

      if (result.value.err) throw Error(JSON.stringify(result.value.err));

      return { signature, result };
    },
    [publicKey, sendTransaction, connection],
  );

  const simulateVersionedTransaction = useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) throw new WalletNotConnectedError();
      const {
        value: { blockhash },
      } = await connection.getLatestBlockhashAndContext();

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);

      return await connection.simulateTransaction(tx);
    },
    [connection, publicKey],
  );

  const sendAndConfirmVersionedTransaction = useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) throw new WalletNotConnectedError();
      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext();

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      const signature = await sendTransaction(tx, connection, {
        minContextSlot,
      });
      const result = await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      });

      return { signature, result };
    },
    [connection, publicKey, sendTransaction],
  );

  return {
    connected,
    wallet: publicKey,
    connection,
    sendAndConfirmTransaction,
    sendAndConfirmVersionedTransaction,
    simulateVersionedTransaction,
    signAllTransactions,
  };
};
