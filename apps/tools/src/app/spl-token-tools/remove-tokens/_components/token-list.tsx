import { useAssetData } from "@/state/queries/use-asset-data";
import type { ParsedTokenAccount } from "@/state/queries/use-owner-assets";
import { ownerAssetsKey } from "@/state/queries/use-owner-assets";
import { compress, normalizeTokenAmount } from "@/lib/solana";
import { Button, CopyButton } from "@blastctrl/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import type { Keypair } from "@solana/web3.js";
import { PublicKey, SendTransactionError, Transaction } from "@solana/web3.js";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createBurnInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { retryWithBackoff } from "@/lib/utils";
import { notify } from "@/components";

type TokenAction = "transfer" | "burn" | null;

type TokenWithAction = {
  account: ParsedTokenAccount;
  action: TokenAction;
};

export const TokenList = ({
  tokenAccounts,
  sourceWallet,
}: {
  tokenAccounts: ParsedTokenAccount[];
  sourceWallet: Keypair;
}) => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [tokenActions, setTokenActions] = useState<Map<string, TokenAction>>(
    new Map(),
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const handleActionChange = (tokenAccount: string, action: TokenAction) => {
    setTokenActions((prev) => {
      const newMap = new Map(prev);
      if (action === null) {
        newMap.delete(tokenAccount);
      } else {
        newMap.set(tokenAccount, action);
      }
      return newMap;
    });
  };

  const selectedCount = Array.from(tokenActions.values()).filter(
    (action) => action !== null,
  ).length;

  const handleSubmit = async () => {
    if (!publicKey || isProcessing || !signTransaction) return;

    const selectedTokens = tokenAccounts
      .map((account) => {
        const action = tokenActions.get(account.token_account);
        if (!action) return null;

        return {
          mint: account.mint,
          balance: account.balance,
          action,
          tokenAccount: account.token_account,
          tokenProgram: account.token_program,
        };
      })
      .filter((item) => item !== null);

    if (selectedTokens.length === 0) return;

    console.log("Selected tokens to process:", selectedTokens);

    setIsProcessing(true);

    try {
      // Build transaction instructions
      const instructions = [];

      for (const token of selectedTokens) {
        const tokenAccountPubkey = new PublicKey(token.tokenAccount);
        const mintPubkey = new PublicKey(token.mint);
        const tokenProgramPubkey = new PublicKey(token.tokenProgram);

        if (token.action === "burn") {
          // Burn all tokens
          instructions.push(
            createBurnInstruction(
              tokenAccountPubkey,
              mintPubkey,
              sourceWallet.publicKey,
              token.balance,
              [],
              tokenProgramPubkey,
            ),
          );
        } else if (token.action === "transfer") {
          // Get or create the destination ATA for the connected wallet
          const destinationAta = getAssociatedTokenAddressSync(
            mintPubkey,
            publicKey,
            false,
            tokenProgramPubkey,
          );

          // Transfer all tokens to the connected wallet
          instructions.push(
            createTransferInstruction(
              tokenAccountPubkey,
              destinationAta,
              sourceWallet.publicKey,
              token.balance,
              [],
              tokenProgramPubkey,
            ),
          );
        }

        // Close the token account and recover rent
        instructions.push(
          createCloseAccountInstruction(
            tokenAccountPubkey,
            publicKey,
            sourceWallet.publicKey,
            [],
            tokenProgramPubkey,
          ),
        );
      }

      // Get latest blockhash
      const { context, value } = await retryWithBackoff(() =>
        connection.getLatestBlockhashAndContext("confirmed"),
      );

      // Create and sign transaction
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: value.blockhash,
        lastValidBlockHeight: value.lastValidBlockHeight,
      }).add(...instructions);

      // Sign with source wallet (the one we have the private key for)
      tx.partialSign(sourceWallet);
      // const signed = await signTransaction(tx);

      // Send transaction - wallet will sign as fee payer
      const signature = await sendTransaction(tx, connection, {
        minContextSlot: context.slot,
        maxRetries: 0,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });

      const loadingToastId = notify({
        type: "loading",
        title: "Transaction sent",
        description: "Confirming transaction...",
      });

      // Confirm transaction
      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: value.blockhash,
          lastValidBlockHeight: value.lastValidBlockHeight,
        },
        "confirmed",
      );

      if (result.value.err) {
        throw new Error(JSON.stringify(result.value.err));
      }

      // Update the loading toast with success
      notify(
        {
          type: "success",
          title: "Transaction confirmed",
          description: `Successfully processed ${selectedTokens.length} token${selectedTokens.length > 1 ? "s" : ""}`,
          txid: signature,
        },
        loadingToastId,
      );

      // Wait half a second before invalidating queries
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Invalidate the query cache for both wallets
      await queryClient.invalidateQueries({
        queryKey: ownerAssetsKey(publicKey.toBase58()),
      });

      await queryClient.invalidateQueries({
        queryKey: ownerAssetsKey(sourceWallet.publicKey.toBase58()),
      });

      // Clear selections
      setTokenActions(new Map());
    } catch (err: any) {
      console.error("Transaction error:", err);
      if (err instanceof SendTransactionError) {
        console.log(err.logs);
      }
      notify({
        type: "error",
        title: "Transaction failed",
        description: err?.message || "An unknown error occurred",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="size-full">
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="text-sm">
          {selectedCount} token{selectedCount !== 1 ? "s" : ""} selected
        </div>
        <div className="text-sm text-gray-600">
          Source wallet: {compress(sourceWallet.publicKey.toBase58(), 4)}
        </div>
      </div>

      <Table
        dense
        className="scroller -mx-4 h-[500px] max-h-[500px] overflow-auto rounded pb-4 sm:-mx-6"
      >
        <TableHead className="sticky top-0 z-[1]">
          <TableRow className="bg-zinc-100 font-medium text-zinc-500">
            <TableHeader className="sticky top-0">Token Info</TableHeader>
            <TableHeader className="sticky top-0">Balance</TableHeader>
            <TableHeader className="sticky top-0">Account</TableHeader>
            <TableHeader className="sticky top-0 text-right">
              Action
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {tokenAccounts.map((account) => {
            const currentAction = tokenActions.get(account.token_account);
            return (
              <TableRow key={account.token_account}>
                <TableCell>
                  <TokenMetadataCell mint={account.mint} />
                </TableCell>
                <TableCell>
                  <TokenAmountCell
                    amount={account.balance}
                    mint={account.mint}
                  />
                </TableCell>
                <TableCell>
                  <CopyButton
                    clipboard={account.token_account}
                    className="text-zinc-500 hover:text-zinc-800"
                  >
                    {({ copied }) =>
                      copied ? "Copied!" : compress(account.token_account, 4)
                    }
                  </CopyButton>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() =>
                        handleActionChange(
                          account.token_account,
                          currentAction === "transfer" ? null : "transfer",
                        )
                      }
                      className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                        currentAction === "transfer"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Transfer
                    </button>
                    <button
                      onClick={() =>
                        handleActionChange(
                          account.token_account,
                          currentAction === "burn" ? null : "burn",
                        )
                      }
                      className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                        currentAction === "burn"
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Burn
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2 pb-4 pt-6">
        <Button
          color="indigo"
          onClick={handleSubmit}
          disabled={selectedCount === 0 || isProcessing}
        >
          {isProcessing
            ? "Processing..."
            : `Process Selected Tokens (${selectedCount})`}
        </Button>
      </div>
    </div>
  );
};

const TokenAmountCell = ({
  amount,
  mint,
}: {
  amount: bigint;
  mint: string;
}) => {
  const { data } = useAssetData(mint);
  const decimals = data?.token_info?.decimals ?? 9;
  const formattedAmount = normalizeTokenAmount(
    amount.toString(),
    decimals,
  ).toLocaleString();

  return <div className="font-mono text-sm">{formattedAmount}</div>;
};

const TokenMetadataCell = ({ mint }: { mint: string }) => {
  const { data } = useAssetData(mint);

  return (
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data?.content?.links?.image}
        loading="lazy"
        alt=""
        height={28}
        width={28}
        className="size-7 rounded-full"
      />
      <div>
        <div className="truncate font-medium">
          {data?.content?.metadata.name}
        </div>
        <CopyButton
          clipboard={mint}
          className="text-zinc-500 hover:text-zinc-800 focus:text-zinc-800"
        >
          {({ copied }) => (copied ? "Copied!" : compress(mint, 4))}
        </CopyButton>
      </div>
    </div>
  );
};
