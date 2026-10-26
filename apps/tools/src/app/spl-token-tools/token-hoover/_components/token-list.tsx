import { notify } from "@/components";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient, type KitClient } from "@/connector/use-kit-client";
import { compress, normalizeTokenAmount } from "@/lib/solana";
import { getTransferHookProgram } from "@blastctrl/kit-extensions";
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
  decodeMint,
  findAssociatedTokenPda,
  getBurnInstruction,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import {
  address,
  fetchEncodedAccounts,
  flattenTransactionPlanResult,
  nonDivisibleSequentialInstructionPlan,
  parallelInstructionPlan,
  type Address,
  type GetMultipleAccountsApi,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type TokenAction = "transfer" | "burn";

type MintInfo = { decimals: number; transferHook: Address | null };

/**
 * What a transfer needs to know about each mint: its decimals, which
 * `TransferChecked` carries, and whether its transfers must call a hook
 * program.
 */
async function fetchMintInfo(
  rpc: Rpc<GetMultipleAccountsApi>,
  mints: Address[],
): Promise<Map<Address, MintInfo>> {
  const accounts = await fetchEncodedAccounts(rpc, mints);
  return new Map(
    accounts.map((account) => {
      if (!account.exists) {
        throw Error(`Mint ${compress(account.address, 4)} does not exist`);
      }
      return [
        account.address,
        {
          decimals: decodeMint(account).data.decimals,
          transferHook: getTransferHookProgram(account.data),
        },
      ];
    }),
  );
}

/**
 * Burns the whole balance, or moves it to `recipient`'s ATA (created if
 * missing), then closes the account so its rent goes to `recipient`.
 *
 * The transfer is a `TransferChecked`, which names the mint: Token-2022
 * refuses a plain `Transfer` from an account carrying transfer-fee or
 * transfer-hook state (every PYUSD account, for one), as it needs the mint
 * to compute the fee or find the hook.
 */
async function tokenInstructions(
  account: ParsedTokenAccount,
  action: TokenAction,
  source: KeyPairSigner,
  recipient: TransactionSigner,
  decimals: number,
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
      getTransferCheckedInstruction(
        {
          source: tokenAccount,
          mint,
          destination,
          authority: source,
          amount: account.balance,
          decimals,
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

/**
 * Sends the selected burns and transfers, the connected wallet paying and
 * receiving, and returns the signatures of the transactions that landed.
 *
 * A transfer of a mint with an active transfer hook is refused up front:
 * the hook's extra accounts are not resolved here, and the program would
 * reject the transfer without them. Burning such a token still works.
 */
async function sendTokenActions(
  client: KitClient,
  selected: { account: ParsedTokenAccount; action: TokenAction }[],
  sourceWallet: KeyPairSigner,
) {
  const mints = await fetchMintInfo(client.rpc, [
    ...new Set(selected.map(({ account }) => address(account.mint))),
  ]);
  for (const { account, action } of selected) {
    const hook = mints.get(address(account.mint))?.transferHook;
    if (action === "transfer" && hook) {
      throw Error(
        `Transfers of ${compress(account.mint, 4)} must call its transfer hook program (${compress(hook, 4)}), which this tool does not support. The token can be burnt instead.`,
      );
    }
  }

  const groups = await Promise.all(
    selected.map(({ account, action }) =>
      tokenInstructions(
        account,
        action,
        sourceWallet,
        client.payer,
        mints.get(address(account.mint))!.decimals,
      ),
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
  return flattenTransactionPlanResult(result)
    .filter((r) => r.status === "successful")
    .map((r) => r.context.signature);
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
      const signatures = await sendTokenActions(client, selected, sourceWallet);

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
