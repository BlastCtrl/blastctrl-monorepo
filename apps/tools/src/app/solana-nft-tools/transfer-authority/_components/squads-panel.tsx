import { notify } from "@/components";
import {
  WalletRefusedError,
  errorMessage,
  sendInOrder,
} from "@/lib/solana/send-batches";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { BatchProposal, Steps, SquadsMultisig } from "./squads";
import {
  approveInstruction,
  batchProposalSteps,
  executeSteps,
  fetchBatchProposal,
  fetchSquadsMultisig,
} from "./squads";
import type { Batch } from "./transactions";

type Props = {
  /** The NFT updates that are ready, packed for Squads. */
  batches: Batch[];
  multisig: SquadsMultisig;
  /** After anything was sent, to read the NFTs again. */
  onSettled: () => void;
  onBusyChange: (busy: boolean) => void;
  /** Blocks creating a proposal, e.g. until the user confirms an address. */
  disabled?: boolean;
};

/**
 * Puts the NFT updates into one Squads batch proposal from a member's
 * wallet, so the multisig approves once for all of them, then lets members
 * approve and execute it here or in the Squads app.
 */
export function SquadsPanel({
  batches,
  multisig: info,
  onSettled,
  onBusyChange,
  disabled,
}: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [index, setIndex] = useState<bigint | null>(null);
  const [indexInput, setIndexInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const me = wallet.publicKey?.toBase58();
  const member = info.members.find((m) => m.address === me);

  const proposal = useQuery({
    queryKey: [
      "squads-batch",
      connection.rpcEndpoint,
      info.address,
      index?.toString(),
    ],
    queryFn: () => fetchBatchProposal(connection, info.address, index!),
    enabled: index !== null,
    refetchInterval: busy ? false : 20_000,
  });

  const ready = batches.reduce((sum, b) => sum + b.mints.length, 0);
  const current = proposal.data;
  const closed =
    !current || current.status === "Rejected" || current.status === "Cancelled";

  const run = async (label: string, steps: () => Promise<Steps>) => {
    setBusy(true);
    onBusyChange(true);
    try {
      await sendInOrder(await steps(), { connection, wallet }, (done, total) =>
        setProgress(`${label}: ${done} of ${total} transactions confirmed`),
      );
    } catch (err) {
      const refused = err instanceof WalletRefusedError;
      notify({
        type: "error",
        title: refused ? "Cancelled in your wallet" : `${label} failed`,
        description: refused
          ? undefined
          : `${errorMessage(err)} Whatever confirmed before this stays; check the status and carry on from there.`,
      });
    } finally {
      setBusy(false);
      onBusyChange(false);
      setProgress(null);
      void proposal.refetch();
      onSettled();
    }
  };

  const create = () =>
    run("Creating the proposal", async () => {
      // Read the multisig again for the index the batch will get.
      const fresh = await fetchSquadsMultisig(connection, info.address);
      if (!fresh || !member) throw Error("Couldn't read the multisig");
      const next = fresh.transactionIndex + 1n;
      setIndex(next);
      setIndexInput(next.toString());
      return batchProposalSteps({
        multisig: fresh,
        member,
        index: next,
        batches,
      });
    });

  const finish = (draft: BatchProposal) =>
    run("Finishing the proposal", async () =>
      batchProposalSteps({
        multisig: info,
        member: member!,
        index: draft.index,
        batches,
        from: draft.size + 1,
      }),
    );

  const approve = (active: BatchProposal) =>
    run("Approving", async () => [
      [approveInstruction(info, member!, active.index)],
    ]);

  const execute = (approved: BatchProposal) =>
    run("Executing", () => executeSteps(connection, info, member!, approved));

  const memberProblem = !wallet.publicKey
    ? "Connect the wallet of a multisig member to create, approve or execute the proposal."
    : !member
      ? "The connected wallet isn't a member of this multisig."
      : null;

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-gray-500">
        {info.threshold} of {info.members.length}{" "}
        {info.members.length === 1 ? "member" : "members"} must approve.
        {member &&
          ` You're a member who can ${[
            member.initiate && "create",
            member.vote && "approve",
            member.execute && "execute",
          ]
            .filter(Boolean)
            .join(", ")} proposals.`}
      </p>

      {memberProblem && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>{memberProblem}</span>
          {!wallet.publicKey && (
            <Button outline onClick={() => setVisible(true)}>
              Connect wallet
            </Button>
          )}
        </div>
      )}

      {index !== null && (
        <ProposalStatus
          index={index}
          proposal={current}
          loading={proposal.isPending}
          threshold={info.threshold}
          timeLock={info.timeLock}
          expected={batches.length}
          me={me}
        />
      )}

      {progress && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <SpinnerIcon className="size-4 animate-spin text-indigo-600" />
          {progress}. Keep this window open.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {index !== null && (
          <Button
            plain
            disabled={busy || proposal.isFetching}
            onClick={() => void proposal.refetch()}
          >
            Refresh status
          </Button>
        )}
        {member && closed && (
          <Button
            color="indigo"
            disabled={busy || disabled || ready === 0 || !member.initiate}
            onClick={create}
          >
            Create a proposal for {ready} {ready === 1 ? "NFT" : "NFTs"}
          </Button>
        )}
        {member && current?.status === "Draft" && (
          <Button
            color="indigo"
            disabled={busy || !member.initiate}
            onClick={() => finish(current)}
          >
            Finish creating the proposal
          </Button>
        )}
        {member &&
          current?.status === "Active" &&
          member.vote &&
          !current.approved.includes(me!) && (
            <Button
              color="indigo"
              disabled={busy}
              onClick={() => approve(current)}
            >
              Approve
            </Button>
          )}
        {member &&
          (current?.status === "Approved" || current?.status === "Executing") &&
          member.execute && (
            <Button
              color="indigo"
              disabled={busy}
              onClick={() => execute(current)}
            >
              Execute {current.size - current.executed}{" "}
              {current.size - current.executed === 1
                ? "transaction"
                : "transactions"}
            </Button>
          )}
      </div>

      {member && closed && ready > 0 && (
        <p className="text-xs text-gray-500">
          Creating it takes {batches.length + 2} transactions from your wallet,
          which also pays the rent for the proposal&apos;s accounts. Members
          approve it once, here or in the Squads app.
        </p>
      )}

      <form
        className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 text-sm text-gray-600"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d+$/.test(indexInput)) setIndex(BigInt(indexInput));
        }}
      >
        <label htmlFor="squads-proposal">Already created one? Proposal #</label>
        <input
          id="squads-proposal"
          inputMode="numeric"
          value={indexInput}
          onChange={(e) => setIndexInput(e.target.value.trim())}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 font-mono text-sm"
        />
        <Button outline type="submit" disabled={busy}>
          Load
        </Button>
      </form>
    </div>
  );
}

function ProposalStatus({
  index,
  proposal,
  loading,
  threshold,
  timeLock,
  expected,
  me,
}: {
  index: bigint;
  proposal: BatchProposal | null | undefined;
  loading: boolean;
  threshold: number;
  timeLock: number;
  expected: number;
  me: string | undefined;
}) {
  const text = () => {
    if (loading) return "Loading…";
    if (!proposal) {
      return "Not found. It may not have been created yet, or it isn't one of this tool's batch proposals.";
    }
    switch (proposal.status) {
      case "Draft":
        return `Draft: ${proposal.size} of ${expected} transactions added. Finish creating it so members can approve.`;
      case "Active":
        return `Waiting for approvals: ${proposal.approved.length} of ${threshold}${
          me && proposal.approved.includes(me) ? ", including yours" : ""
        }. Members can approve here or in the Squads app.`;
      case "Approved":
      case "Executing":
        return `Approved. ${proposal.executed} of ${proposal.size} transactions executed.${
          timeLock > 0
            ? ` The multisig has a ${timeLock} second time lock after approval.`
            : ""
        }`;
      case "Executed":
        return "Executed. Check the NFTs again to see the result.";
      case "Rejected":
        return "Rejected by the members.";
      case "Cancelled":
        return "Cancelled.";
    }
  };
  return (
    <div className="rounded-md border border-gray-200 px-3 py-2 text-sm">
      <span className="font-medium text-gray-900">
        Proposal #{index.toString()}
      </span>
      <span className="ml-2 text-gray-600">{text()}</span>
    </div>
  );
}
