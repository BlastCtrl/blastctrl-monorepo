"use client";

import {
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
} from "@/app/spl-token-tools/reclaim-rent/_components/rent";
import {
  Chips,
  ReclaimPill,
} from "@/app/spl-token-tools/reclaim-rent/_components/results/bits";
import { Stage } from "@/app/spl-token-tools/reclaim-rent/_components/results/stage";
import { useRentRate } from "@/app/spl-token-tools/reclaim-rent/_components/use-rent-rate";
import { isPublicKey } from "@/lib/solana/common";
import { cn } from "@blastctrl/ui";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { useId, useState } from "react";

/**
 * The results block's height with one row of coins and no "Customize",
 * from Tally's Tailwind sizes (and measured), so the invitation holds the
 * band at the height the results will need. Keep in step with Tally.
 *   Amount column: amount (48px, 60px from sm) + coins (16 + 12px, 14px
 *   from sm) + sentence (12 + 20px) + chips (20 + 32px) = 160px, 174px.
 *   Pill column: pill (32 + 28px) + gap (10px) + its line (20px) = 90px.
 *   Below md the columns stack with a 32px gap.
 */
const RESULTS_HEIGHT = "min-h-[282px] sm:min-h-[296px] md:min-h-[174px]";

/**
 * The tool's stage run edge to edge across the page: the dot-grid band the
 * whole reclaim happens on, from the first click to the green badge. Its
 * content keeps to the page's column.
 */
export function Band({
  moving,
  reduced,
  children,
}: {
  moving: boolean;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Reclaim"
      className="border-t border-zinc-200 px-4 sm:px-6"
    >
      <Stage moving={moving} reduced={reduced}>
        <div className="mx-auto max-w-[60rem]">{children}</div>
      </Stage>
    </section>
  );
}

/** Which way in the invitation offers while no wallet is connected. */
export type Entry = "wallet" | "address";

/**
 * The pill and the address field swap in the same spot: the old one leaves
 * upwards, the new one comes in from below, like the pill's own labels.
 */
const SWAP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const SWAP_IN = { duration: 0.2, ease: EASE_OUT };
const SWAP_OUT = { duration: 0.12, ease: EASE_OUT };
const AT_ONCE = { duration: 0 };

const LINK =
  "font-medium text-slate-800 underline decoration-zinc-300 underline-offset-2 hover:decoration-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800";

/**
 * What the band says before the first scan: what one account gives back,
 * and the pill to find out the rest, or, for anyone without a wallet to
 * hand, a field to paste an address into. Laid out like the results that
 * replace it, so the pill is where "Reclaim it" will be, and the band keeps
 * its height. While the scan runs it stays, invisible, to hold that height.
 */
export function Invitation({
  connected,
  entry,
  checking,
  failed,
  reduced,
  onCheck,
  onConnect,
  onEntry,
  onCheckAddress,
}: {
  connected: boolean;
  entry: Entry;
  checking: boolean;
  failed: boolean;
  reduced: boolean;
  /** The pill, once a wallet is connected. */
  onCheck: () => void;
  onConnect: () => void;
  onEntry: (entry: Entry) => void;
  onCheckAddress: (address: string) => void;
}) {
  const { lamportsPerByte } = useRentRate();
  const paid = minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE);
  const excess = paid - minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte);
  const byAddress = !connected && entry === "address";

  return (
    <div
      aria-hidden={checking || undefined}
      inert={checking}
      className={cn(
        "flex flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-12",
        RESULTS_HEIGHT,
        checking && "invisible",
      )}
    >
      <div className="min-w-0 md:max-w-xl">
        <h2 className="font-display text-xl font-bold text-balance text-slate-800 sm:text-2xl">
          About {formatSol(excess, 5)} SOL back from every token account.
        </h2>
        <p className="mt-3 max-w-md text-sm text-pretty text-zinc-600">
          Empty ones return their whole {formatSol(paid, 5)} SOL deposit. Active
          wallets often have dozens.
        </p>
        <Chips closesEmpty />
      </div>

      <div className="relative flex shrink-0 flex-col">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={byAddress ? "address" : "wallet"}
            className="flex flex-col items-stretch gap-2.5 md:items-end"
            initial={reduced ? false : SWAP.initial}
            animate={SWAP.animate}
            exit={{ ...SWAP.exit, transition: reduced ? AT_ONCE : SWAP_OUT }}
            transition={reduced ? AT_ONCE : SWAP_IN}
          >
            {byAddress ? (
              <AddressForm
                failed={failed}
                onCheck={onCheckAddress}
                onConnect={onConnect}
              />
            ) : (
              <>
                <ReclaimPill
                  disabled={false}
                  animated={!reduced}
                  onClick={connected ? onCheck : onConnect}
                  className="px-10 md:min-w-[18rem]"
                  label={connected ? "Check my wallet" : "Connect wallet"}
                />
                {failed ? (
                  <p role="alert" className="text-center text-sm text-red-700">
                    Couldn&apos;t load your token accounts. Try again in a
                    moment.
                  </p>
                ) : connected ? (
                  <p className="text-center text-sm text-zinc-500 md:self-center">
                    Free to check. Nothing moves until you approve.
                  </p>
                ) : (
                  <p className="text-center text-sm text-zinc-500 md:self-center">
                    No wallet handy?{" "}
                    <button
                      type="button"
                      onClick={() => onEntry("address")}
                      className={LINK}
                    >
                      Paste an address
                    </button>
                  </p>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * An address to check without connecting: a field the size of the pill,
 * with the pill's red on its button. Checking only reads the chain, so any
 * address works; reclaiming still takes that wallet.
 */
function AddressForm({
  failed,
  onCheck,
  onConnect,
}: {
  failed: boolean;
  onCheck: (address: string) => void;
  onConnect: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = value.trim();
    if (isPublicKey(address)) onCheck(address);
    else setInvalid(true);
  };

  return (
    <>
      <form
        onSubmit={submit}
        className="flex h-[60px] w-full items-center gap-2 rounded-full bg-white py-1.5 pr-1.5 pl-5 shadow-sm ring-1 ring-zinc-300 transition-shadow focus-within:ring-2 focus-within:ring-slate-800 md:w-[22rem]"
      >
        <label htmlFor={`${id}-address`} className="sr-only">
          Wallet address
        </label>
        <input
          id={`${id}-address`}
          // It appears because someone asked for it.
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          placeholder="Paste a wallet address"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-note`}
          className="min-w-0 grow bg-transparent text-base text-slate-800 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          className="h-full shrink-0 rounded-full bg-primary px-6 font-display text-base font-bold text-white transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus active:translate-y-px"
        >
          Check
        </button>
      </form>
      <p
        id={`${id}-note`}
        className="text-center text-sm text-zinc-500 md:self-center"
      >
        {invalid ? (
          <span role="alert" className="text-red-700">
            That isn&apos;t a Solana address.
          </span>
        ) : failed ? (
          <span role="alert" className="text-red-700">
            Couldn&apos;t load its token accounts. Try again in a moment.
          </span>
        ) : (
          <button type="button" onClick={onConnect} className={LINK}>
            Connect a wallet instead
          </button>
        )}
      </p>
    </>
  );
}
