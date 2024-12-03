import { notify } from "@/components/notification";
import { retryWithBackoff } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import {
  ComputeBudgetProgram,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";

type MergeStakeArgs = {
  sourceStakePubKey: PublicKey;
  stakePubkey: PublicKey;
};

export function useMergeStakesMutation() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  return useMutation({
    onSuccess: (data, args) => {
      notify({
        type: "success",
        title: "Stake accounts merged",
        description: `The staked funds have been merged into the ${args.stakePubkey.toString()} account.`,
        txid: data.signature,
      });
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Error merging stake accounts",
        description: error.message,
      });
    },
    mutationFn: async (args: MergeStakeArgs) => {
      if (!publicKey || !sendTransaction) {
        throw Error("Connect your wallet");
      }

      window.confirm(
        "This tool doesn't exhaustively cover all the conditions in which staked accounts cannot be merged. If there is an error, examine the error message for hints as to why merging isn't possible.",
      );

      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      const tx = new Transaction();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1e6 }),
        StakeProgram.merge({ authorizedPubkey: publicKey, ...args }),
      );

      const signature = await sendTransaction(tx, connection, {
        minContextSlot: context.slot,
        maxRetries: 0,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });

      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: value.blockhash,
          lastValidBlockHeight: value.lastValidBlockHeight,
        },
        "confirmed",
      );

      if (result.value.err) throw Error(JSON.stringify(result.value.err));

      return { signature, result };
    },
  });
}
