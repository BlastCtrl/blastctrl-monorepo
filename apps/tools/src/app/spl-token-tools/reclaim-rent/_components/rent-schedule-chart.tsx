import { useId } from "react";
import {
  ORIGINAL_LAMPORTS_PER_BYTE,
  RENT_STEPS,
  TOKEN_ACCOUNT_SIZE,
  currentStepIndex,
  formatSol,
  minimumBalance,
  stepStatus,
} from "./rent";

const WIDTH = 384;
const HEIGHT = 208;
const LEFT = 8;
const TOP = 38;
const BOTTOM = 168;
const COLUMN = (WIDTH - LEFT * 2) / RENT_STEPS.length;
const BAR = COLUMN - 6;
const RADIUS = 4;
/** Space between the rent that stays and the excess stacked on top of it. */
const GAP = 3;
const OUTLINE = 1.5;
const PILL_WIDTH = 96;
const PILL_HEIGHT = 22;
const PILL_TOP = TOP - PILL_HEIGHT - 8;

const paid = minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE);
const y = (lamports: number) => BOTTOM - ((BOTTOM - TOP) * lamports) / paid;
const center = (i: number) => LEFT + COLUMN * (i + 0.5);

/**
 * What one token account holds at each step: the rent it has to keep, and
 * the excess on top of it that the owner can take back. Every column is the
 * same deposit, so the excess grows as the rent drops.
 */
export function RentScheduleChart({
  lamportsPerByte,
}: {
  lamportsPerByte: number;
}) {
  const id = useId().replace(/[^\w-]/g, "");
  const hatch = `${id}-hatch`;
  const pastHatch = `${id}-past-hatch`;

  const currentIndex = currentStepIndex(lamportsPerByte);
  const current = RENT_STEPS[currentIndex]!;
  const lastIndex = RENT_STEPS.length - 1;
  const last = RENT_STEPS[lastIndex]!;
  const currentMin = minimumBalance(
    TOKEN_ACCOUNT_SIZE,
    current.lamportsPerByte,
  );
  const lastMin = minimumBalance(TOKEN_ACCOUNT_SIZE, last.lamportsPerByte);

  const pillX = Math.min(
    Math.max(center(currentIndex) - PILL_WIDTH / 2, 0),
    WIDTH - PILL_WIDTH,
  );
  // Today's pill is wider than a column, so its neighbours drop their labels.
  const hasRoom = (i: number) => Math.abs(i - currentIndex) > 1;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`The required rent for a token account falls from ${formatSol(paid)} SOL to ${formatSol(currentMin)} SOL today, and to ${formatSol(lastMin)} SOL after the last step.`}
        className="h-auto w-full text-[11px]"
      >
        <defs>
          <pattern
            id={hatch}
            width={7}
            height={7}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={7} height={7} className="fill-red-50" />
            <rect width={3.5} height={7} className="fill-red-200" />
          </pattern>
          <pattern
            id={pastHatch}
            width={7}
            height={7}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={7} height={7} className="fill-[#3e495e0f]" />
            <rect width={3.5} height={7} className="fill-[#3e495e4d]" />
          </pattern>
        </defs>

        {RENT_STEPS.map((step, i) => {
          const x = center(i) - BAR / 2;
          const level = y(
            minimumBalance(TOKEN_ACCOUNT_SIZE, step.lamportsPerByte),
          );
          const excess = level - GAP - TOP - OUTLINE;
          const status = stepStatus(i, lamportsPerByte);
          const isCurrent = status === "current";
          const isUpcoming = status === "upcoming";

          return (
            <g key={step.label}>
              {/* Excess the owner can take back, drawn inside its outline */}
              {excess > 0 && (
                <rect
                  x={x + OUTLINE / 2}
                  y={TOP + OUTLINE / 2}
                  width={BAR - OUTLINE}
                  height={excess}
                  rx={Math.min(RADIUS, excess / 2)}
                  fill={`url(#${status === "past" ? pastHatch : hatch})`}
                  strokeWidth={OUTLINE}
                  strokeDasharray="3 2"
                  opacity={isUpcoming ? 0.45 : 1}
                  className={
                    status === "past" ? "stroke-[#3e495edb]" : "stroke-primary"
                  }
                />
              )}
              {/* Rent that has to stay. The original rent is all of it. */}
              <rect
                x={x}
                y={level}
                width={BAR}
                height={BOTTOM - level}
                rx={Math.min(RADIUS, (BOTTOM - level) / 2)}
                className={
                  isCurrent
                    ? "fill-emerald-600"
                    : isUpcoming
                      ? "fill-emerald-600/30"
                      : "fill-[#3e495edb]"
                }
              />
              <text
                x={center(i)}
                y={BOTTOM + 16}
                textAnchor="middle"
                className={
                  isCurrent ? "fill-slate-800 font-semibold" : "fill-zinc-500"
                }
              >
                {step.label}
              </text>
            </g>
          );
        })}

        {/* What was paid when the account was created */}
        {currentIndex > 0 && hasRoom(0) && (
          <text
            x={center(0)}
            y={TOP - 11}
            textAnchor="middle"
            className="fill-slate-800 font-display text-[12px] font-bold tabular-nums"
          >
            <tspan className="fill-zinc-500 font-sans text-[11px] font-medium">
              Paid{" "}
            </tspan>
            {formatSol(paid, 5)}
          </text>
        )}

        {/* Today's excess, and what it will be after the last step */}
        {currentIndex > 0 && (
          <g>
            <rect
              x={pillX}
              y={PILL_TOP}
              width={PILL_WIDTH}
              height={PILL_HEIGHT}
              rx={PILL_HEIGHT / 2}
              className="fill-primary"
            />
            <text
              x={pillX + PILL_WIDTH / 2}
              y={PILL_TOP + PILL_HEIGHT / 2 + 4.5}
              textAnchor="middle"
              className="fill-white font-display text-[12px] font-bold tabular-nums"
            >
              +{formatSol(paid - currentMin, 5)} SOL
            </text>
          </g>
        )}
        {hasRoom(lastIndex) && (
          <text
            x={center(lastIndex)}
            y={TOP - 11}
            textAnchor="middle"
            className="fill-primary/70 font-display text-[12px] font-bold tabular-nums"
          >
            +{formatSol(paid - lastMin, 5)}
          </text>
        )}

        {/* Timeline under the step names */}
        <text
          x={center(currentIndex)}
          y={BOTTOM + 30}
          textAnchor="middle"
          className="fill-slate-800"
        >
          Today
        </text>
        <text
          x={center(4)}
          y={BOTTOM + 30}
          textAnchor="middle"
          className="fill-zinc-400"
        >
          Expected in November
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>Per token account:</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px] bg-emerald-600"
          />
          rent it has to hold,
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px] border border-dashed border-primary bg-[repeating-linear-gradient(135deg,#fecaca_0_2px,#fef2f2_2px_4px)]"
          />
          SOL you can take back.
        </span>
      </figcaption>
    </figure>
  );
}
