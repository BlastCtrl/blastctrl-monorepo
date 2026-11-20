import { useId } from "react";
import {
  RENT_STEPS,
  TOKEN_ACCOUNT_DEPOSIT,
  TOKEN_ACCOUNT_SIZE,
  currentStepIndex,
  formatDay,
  formatSol,
  isScheduled,
  minimumBalance,
  stepStatus,
  tokenAccountExcess,
  type RentStatus,
  type RentStepStatus,
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

const paid = TOKEN_ACCOUNT_DEPOSIT;
const y = (lamports: number) => BOTTOM - ((BOTTOM - TOP) * lamports) / paid;
const center = (i: number) => LEFT + COLUMN * (i + 0.5);
const LAST = RENT_STEPS.length - 1;
const lastExcess = tokenAccountExcess(RENT_STEPS[LAST]!.lamportsPerByte);

/**
 * The notes under the steps still to come, from what their feature gates
 * say: a day under each step that goes live when the epoch ends, and one
 * note under the rest. Without the gates, one note under all of them.
 */
function upcomingNotes(status: RentStatus, currentIndex: number) {
  const upcoming = RENT_STEPS.map((_, i) => i).filter((i) => i > currentIndex);
  const { nextEpochAt } = status;
  const scheduled =
    nextEpochAt === null ? [] : upcoming.filter((i) => isScheduled(status, i));
  const rest = upcoming.filter((i) => !scheduled.includes(i));

  const notes: { x: number; anchor: "middle" | "end"; text: string }[] =
    scheduled.map((i) => ({
      x: center(i),
      anchor: "middle",
      text: `~${formatDay(nextEpochAt!)}`,
    }));
  if (rest.length > 0) {
    const first = rest[0]!;
    const last = rest.at(-1)!;
    // The note is wider than a column, so under the last column alone it
    // ends at the chart's edge instead of running off it.
    const atEdge = first === LAST;
    notes.push({
      x: atEdge ? WIDTH - 2 : (center(first) + center(last)) / 2,
      anchor: atEdge ? "end" : "middle",
      text: !status.gates
        ? "Still to come"
        : first === last
          ? "Not scheduled"
          : "Not scheduled yet",
    });
  }
  return notes;
}

/**
 * What one token account holds at each step: the rent it has to keep, and
 * the excess on top of it that the owner can take back. Every column is the
 * same deposit, so the excess grows as the rent drops.
 *
 * Which step is today's, and when the next ones are due, comes from the
 * cluster's rent status. Until that is known (`status` is null) the chart
 * shows the steps without marking any of them.
 */
export function RentScheduleChart({ status }: { status: RentStatus | null }) {
  const id = useId().replace(/[^\w-]/g, "");
  const hatch = `${id}-hatch`;
  const pastHatch = `${id}-past-hatch`;

  const currentIndex = status ? currentStepIndex(status.lamportsPerByte) : null;
  const currentExcess =
    currentIndex === null
      ? null
      : tokenAccountExcess(RENT_STEPS[currentIndex]!.lamportsPerByte);
  const statusOf = (i: number): RentStepStatus =>
    status ? stepStatus(i, status.lamportsPerByte) : "upcoming";

  const pillX =
    currentIndex === null
      ? 0
      : Math.min(
          Math.max(center(currentIndex) - PILL_WIDTH / 2, 0),
          WIDTH - PILL_WIDTH,
        );
  // Today's pill is wider than a column, so its neighbours drop their labels.
  const hasRoom = (i: number) =>
    currentIndex === null || Math.abs(i - currentIndex) > 1;
  const notes =
    status && currentIndex !== null ? upcomingNotes(status, currentIndex) : [];

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          currentExcess === null
            ? `The required rent for a token account falls from ${formatSol(paid)} SOL to ${formatSol(paid - lastExcess)} SOL over five steps.`
            : currentIndex === LAST
              ? `The required rent for a token account has fallen from ${formatSol(paid)} SOL to ${formatSol(paid - lastExcess)} SOL, now that the last of five steps is live.`
              : `The required rent for a token account falls from ${formatSol(paid)} SOL to ${formatSol(paid - currentExcess)} SOL today, and to ${formatSol(paid - lastExcess)} SOL after the last step.`
        }
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
          const stepIs = statusOf(i);
          const isCurrent = stepIs === "current";
          const isUpcoming = stepIs === "upcoming";

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
                  fill={`url(#${stepIs === "past" ? pastHatch : hatch})`}
                  strokeWidth={OUTLINE}
                  strokeDasharray="3 2"
                  opacity={isUpcoming ? 0.45 : 1}
                  className={
                    stepIs === "past" ? "stroke-[#3e495edb]" : "stroke-primary"
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
        {currentIndex !== 0 && hasRoom(0) && (
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
        {currentIndex !== null &&
          currentExcess !== null &&
          currentIndex > 0 && (
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
                +{formatSol(currentExcess, 5)} SOL
              </text>
            </g>
          )}
        {hasRoom(LAST) && (
          <text
            x={center(LAST)}
            y={TOP - 11}
            textAnchor="middle"
            className="fill-primary/70 font-display text-[12px] font-bold tabular-nums"
          >
            +{formatSol(lastExcess, 5)}
          </text>
        )}

        {/* Timeline under the step names */}
        {currentIndex !== null && (
          <text
            x={center(currentIndex)}
            y={BOTTOM + 30}
            textAnchor="middle"
            className="fill-slate-800"
          >
            Today
          </text>
        )}
        {notes.map((note) => (
          <text
            key={note.x}
            x={note.x}
            y={BOTTOM + 30}
            textAnchor={note.anchor}
            className="fill-zinc-400"
          >
            {note.text}
          </text>
        ))}
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
