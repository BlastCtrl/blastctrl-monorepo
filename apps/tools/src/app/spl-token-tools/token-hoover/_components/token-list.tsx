import { notify } from "@/components";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { compress, normalizeTokenAmount } from "@/lib/solana";
import { useAssetData } from "@/state/queries/use-asset-data";
import {
  ownerAssetsKey,
  useOwnerAssets,
  type ParsedTokenAccount,
} from "@/state/queries/use-owner-assets";
import { Button, CopyButton } from "@blastctrl/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import {
  findAssociatedTokenPda,
  getBurnInstruction,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
} from "@solana-program/token";
import {
  address,
  flattenTransactionPlanResult,
  nonDivisibleSequentialInstructionPlan,
  parallelInstructionPlan,
  type Instruction,
  type KeyPairSigner,
  type TransactionSigner,
} from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type TokenAction = "transfer" | "burn";

/**
 * Burns the whole balance, or moves it to `recipient`'s ATA (created if
 * missing), then closes the account so its rent goes to `recipient`.
 */
async function tokenInstructions(
  account: ParsedTokenAccount,
  action: TokenAction,
  source: KeyPairSigner,
  recipient: TransactionSigner,
): Promise<Instruction[]> {
  const tokenAccount = address(account.token_account);
  const mint = address(account.mint);
  const tokenProgram = address(account.token_program);
  const config = { programAddress: tokenProgram };
  const instructions: Instruction[] = [];

  if (action === "burn") {
    instructions.push(
      getBurnInstruction(
        {
          account: tokenAccount,
          mint,
          authority: source,
          amount: account.balance,
        },
        config,
      ),
    );
  } else {
    const [destination] = await findAssociatedTokenPda({
      owner: recipient.address,
      mint,
      tokenProgram,
    });
    instructions.push(
      getCreateAssociatedTokenIdempotentInstruction({
        payer: recipient,
        ata: destination,
        owner: recipient.address,
        mint,
        tokenProgram,
      }),
      getTransferInstruction(
        {
          source: tokenAccount,
          destination,
          authority: source,
          amount: account.balance,
        },
        config,
      ),
    );
  }

  instructions.push(
    getCloseAccountInstruction(
      { account: tokenAccount, destination: recipient.address, owner: source },
      config,
    ),
  );
  return instructions;
}

export const TokenList = ({
  tokenAccounts,
  sourceWallet,
}: {
  tokenAccounts: ParsedTokenAccount[];
  sourceWallet: KeyPairSigner;
}) => {
  const { client } = useKitClient();
  const queryClient = useQueryClient();
  const { refetch } = useOwnerAssets(sourceWallet.address);
  const [tokenActions, setTokenActions] = useState<Map<string, TokenAction>>(
    new Map(),
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const handleActionChange = (
    tokenAccount: string,
    action: TokenAction | null,
  ) => {
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

  const selectedCount = tokenActions.size;

  const handleSubmit = async () => {
    if (!client || isProcessing) return;

    const selected = tokenAccounts.flatMap((account) => {
      const action = tokenActions.get(account.token_account);
      return action ? [{ account, action }] : [];
    });
    if (selected.length === 0) return;

    setIsProcessing(true);
    try {
      const groups = await Promise.all(
        selected.map(({ account, action }) =>
          tokenInstructions(account, action, sourceWallet, client.payer),
        ),
      );
      // Each token's instructions must land together (close after burn or
      // transfer); the groups are independent, so the planner packs as many
      // as fit into one transaction and sends any overflow as further ones.
      // The source wallet's keypair is attached to its instructions, so the
      // client signs with it after the connected wallet.
      const result = await client.sendTransactions(
        parallelInstructionPlan(
          groups.map((group) => nonDivisibleSequentialInstructionPlan(group)),
        ),
      );
      const signatures = flattenTransactionPlanResult(result)
        .filter((r) => r.status === "successful")
        .map((r) => r.context.signature);

      signatures.forEach((signature, index) => {
        notify({
          type: "success",
          title:
            signatures.length > 1
              ? `Transaction ${index + 1} of ${signatures.length} confirmed`
              : "Transaction confirmed",
          description:
            signatures.length === 1
              ? `Successfully processed ${selected.length} token${selected.length > 1 ? "s" : ""}`
              : undefined,
          txid: signature,
        });
      });

      // Give the RPC a moment before re-reading both wallets' token accounts.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({
          queryKey: ownerAssetsKey(client.payer.address),
        }),
      ]);
      setTokenActions(new Map());
    } catch (error) {
      notify({
        type: "error",
        title: "Transaction failed",
        description: transactionErrorMessage(error),
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
          Source wallet: {compress(sourceWallet.address, 4)}
        </div>
      </div>

      <Table
        dense
        className="scroller -mx-4 h-[500px] max-h-[500px] overflow-auto rounded-sm pb-4 sm:-mx-6"
      >
        <TableHead className="sticky top-0 z-1">
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

      <div className="flex items-center justify-end gap-2 pt-6 pb-4">
        <Button
          color="indigo"
          onClick={handleSubmit}
          disabled={!client || selectedCount === 0 || isProcessing}
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
