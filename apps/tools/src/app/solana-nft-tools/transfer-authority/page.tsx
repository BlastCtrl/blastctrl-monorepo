"use client";

import { errorMessage } from "@/lib/solana/send-batches";
import { compress } from "@/lib/solana/common";
import { cn } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo, useState } from "react";
import { MintListInput } from "./_components/mint-list-input";
import { parseMintList } from "./_components/mint-list";
import { TransferStep } from "./_components/transfer-step";
import { VerifyStep } from "./_components/verify-step";

const STEPS = [
  {
    title: "1. Transfer",
    description:
      "Connect the current update authority. It hands the NFTs to the new update authority and puts the new creator in its place, unverified.",
  },
  {
    title: "2. Verify creator",
    description:
      "Connect the new creator's wallet. It verifies itself as a creator on each NFT.",
  },
];

export default function TransferAuthority() {
  const { publicKey } = useWallet();
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    try {
      return parseMintList(text);
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }, [text]);
  const mints = "error" in parsed ? [] : parsed.mints;

  return (
    <div className="mx-auto w-[min(100%,var(--breakpoint-md))] overflow-visible bg-white px-4 pb-5 sm:rounded-lg sm:p-6 sm:shadow-sm">
      <h1 className="mb-4 font-display text-3xl font-semibold">
        Transfer NFT update authority
      </h1>
      <p className="text-sm text-gray-500">
        Move many Metaplex Token Metadata NFTs to a new update authority and
        creator. It takes two steps with two wallets: the current update
        authority transfers them, then the new creator verifies itself.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2" role="tablist">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={step === i}
            disabled={busy}
            onClick={() => setStep(i)}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed",
              step === i
                ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                : "border-gray-300 hover:bg-gray-50",
            )}
          >
            <span className="font-medium text-gray-900">{s.title}</span>
            <span className="mt-0.5 hidden text-xs text-gray-500 sm:block">
              {s.description}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-gray-500">
        {publicKey ? (
          <>
            Connected as{" "}
            <span className="font-mono text-gray-900">
              {compress(publicKey.toBase58(), 6)}
            </span>
          </>
        ) : (
          "No wallet connected"
        )}
      </p>

      <div className="mt-4">
        <MintListInput
          value={text}
          onChange={setText}
          parsed={parsed}
          disabled={busy}
        />
      </div>

      {/* Both steps stay mounted so switching tabs keeps their state. */}
      <div className="mt-6" hidden={step !== 0}>
        <TransferStep mints={mints} onBusyChange={setBusy} />
      </div>
      <div className="mt-6" hidden={step !== 1}>
        <VerifyStep mints={mints} onBusyChange={setBusy} />
      </div>
    </div>
  );
}
