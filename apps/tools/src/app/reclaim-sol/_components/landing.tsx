"use client";

import {
  SERVICE_FEE,
  formatFeeRate,
} from "@/app/spl-token-tools/reclaim-rent/_components/fee";
import { remainingSteps } from "@/app/spl-token-tools/reclaim-rent/_components/rent";
import { RentScheduleChart } from "@/app/spl-token-tools/reclaim-rent/_components/rent-schedule-chart";
import { useRentRate } from "@/app/spl-token-tools/reclaim-rent/_components/use-rent-rate";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** The page's column; the band's content lines up with it. */
const COLUMN = "mx-auto w-full max-w-5xl px-4 sm:px-8";

const FULL_TOOL = "/spl-token-tools/reclaim-rent";

const LINK =
  "font-medium text-slate-800 underline decoration-zinc-300 underline-offset-2 hover:decoration-slate-800";

/**
 * /reclaim-sol: the reclaim-rent tool with nothing to set, for anyone who
 * just wants their SOL back. The pitch and the chart that explains it, then
 * `children` (the band the reclaim happens on), then what to expect.
 */
export function Landing({ children }: { children: ReactNode }) {
  const { lamportsPerByte } = useRentRate();
  const chart = <RentScheduleChart lamportsPerByte={lamportsPerByte} />;

  return (
    <div className="flex grow flex-col bg-white">
      <SiteHeader />
      <main className="grow">
        <div
          className={`${COLUMN} grid items-center gap-x-14 pt-6 pb-12 sm:pt-10 sm:pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]`}
        >
          <div>
            <h1 className="font-display text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance text-slate-800 sm:text-6xl lg:text-5xl">
              <span className="sm:block">Solana lowered rent.</span>{" "}
              <span className="sm:block">Reclaim the difference.</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-zinc-600 sm:mt-6 sm:text-lg">
              Every token account holds a SOL deposit, and Solana is making it
              smaller. Accounts opened before the change still hold the old
              amount. Send the extra back to your wallet in one go, and keep
              every token.
            </p>
          </div>
          {/* Narrower than this, the chart waits until after the band, so
              the pill comes right after the pitch. */}
          <div className="hidden lg:block">{chart}</div>
        </div>

        {children}

        <GoodToKnow chart={chart} stepsLeft={remainingSteps(lamportsPerByte)} />
      </main>
      <SiteFooter />
    </div>
  );
}

function GoodToKnow({
  chart,
  stepsLeft,
}: {
  chart: ReactNode;
  stepsLeft: number;
}) {
  return (
    <section
      aria-labelledby="good-to-know-heading"
      className={`${COLUMN} py-14 sm:py-20`}
    >
      <div className="mb-14 max-w-md lg:hidden">{chart}</div>
      {/* The heading takes the first cell of the facts' grid. */}
      <div className="grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        <h2
          id="good-to-know-heading"
          className="font-display text-2xl font-bold text-balance text-slate-800 sm:col-span-2 sm:text-3xl lg:col-span-1"
        >
          Good to know before you reclaim
        </h2>
        <dl className="contents">
          <Fact term="Your tokens stay put.">
            Accounts that hold tokens stay open. Only the SOL they no longer
            need leaves them.
          </Fact>
          <Fact term="Empty accounts get closed.">
            They hold no tokens, so closing them returns their whole deposit. To
            keep some open, or pick accounts yourself, use the{" "}
            <Link href={FULL_TOOL} className={LINK}>
              full reclaim tool
            </Link>
            .
          </Fact>
          <Fact term="You approve everything.">
            Your wallet shows each transaction first, and nothing is sent until
            you approve it.
          </Fact>
          {SERVICE_FEE ? (
            <Fact
              term={`A ${formatFeeRate(SERVICE_FEE)} fee, already counted.`}
            >
              BlastCtrl keeps {formatFeeRate(SERVICE_FEE)} of the SOL reclaimed.
              The amount you see is what lands in your wallet, after that and
              network fees.
            </Fact>
          ) : (
            <Fact term="No fee.">
              The amount you see is what lands in your wallet, after network
              fees.
            </Fact>
          )}
          {stepsLeft > 0 && (
            <Fact term="There's more coming.">
              Rent drops again in November, and every step frees up more. Come
              back then for the next round.
            </Fact>
          )}
        </dl>
      </div>
    </section>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-slate-800">{term}</dt>
      <dd className="mt-1.5 max-w-sm text-pretty text-zinc-600">{children}</dd>
    </div>
  );
}
