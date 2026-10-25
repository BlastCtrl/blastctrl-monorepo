import { notify } from "@/components/notification";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { getMergeInstruction } from "@solana-program/stake";
import type { Address } from "@solana/kit";
import { useMutation } from "@tanstack/react-query";

type MergeStakeArgs = {
  /** Account that is drained into the destination. */
  sourceStake: Address;
  /** Account that is kept. */
  destinationStake: Address;
};

export function useMergeStakesMutation() {
  const { client } = useKitClient();

  return useMutation({
    onSuccess: (signature, args) => {
      notify({
        type: "success",
        title: "Stake accounts merged",
        description: `The staked funds have been merged into the ${args.destinationStake} account.`,
        txid: signature,
      });
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Error merging stake accounts",
        description: transactionErrorMessage(error),
      });
    },
    mutationFn: async (args: MergeStakeArgs) => {
      if (!client) throw Error("Connect your wallet");

      if (
        !window.confirm(
          "This tool doesn't exhaustively cover all the conditions in which staked accounts cannot be merged. If there is an error, examine the error message for hints as to why merging isn't possible. Continue?",
        )
      ) {
        throw Error("Merge cancelled");
      }

      const result = await client.sendTransaction([
        getMergeInstruction({
          destinationStake: args.destinationStake,
          sourceStake: args.sourceStake,
          stakeAuthority: client.payer,
        }),
      ]);
      return result.context.signature;
    },
  });
}
