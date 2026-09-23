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
const HEIGHT = 212;
const LEFT = 8;
const TOP = 34;
const BOTTOM = 168;
const COLUMN = (WIDTH - LEFT * 2) / RENT_STEPS.length;

const paid = minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE);
const y = (lamports: number) => BOTTOM - ((BOTTOM - TOP) * lamports) / paid;

/**
 * The deposit a token account has to hold, dropping step by step. The space
 * between what was paid and the line is what the owner can take back.
 */
export function RentScheduleChart({
  lamportsPerByte,
}: {
  lamportsPerByte: number;
}) {
  const currentIndex = currentStepIndex(lamportsPerByte);
  const current = RENT_STEPS[currentIndex]!;
  const last = RENT_STEPS[RENT_STEPS.length - 1]!;
  const currentMin = minimumBalance(
    TOKEN_ACCOUNT_SIZE,
    current.lamportsPerByte,
  );
  const lastMin = minimumBalance(TOKEN_ACCOUNT_SIZE, last.lamportsPerByte);

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`The required deposit for a token account falls from ${formatSol(paid)} SOL to ${formatSol(currentMin)} SOL today, and to ${formatSol(lastMin)} SOL after the last step.`}
        className="h-auto w-full text-[11px]"
      >
        {/* What was paid when the account was created */}
        <line
          x1={LEFT}
          x2={WIDTH - LEFT}
          y1={TOP}
          y2={TOP}
          className="stroke-zinc-400"
          strokeDasharray="2 3"
        />
        <text x={LEFT} y={TOP - 8} className="fill-zinc-500">
          Deposit paid, {formatSol(paid, 5)} SOL
        </text>

        {RENT_STEPS.map((step, i) => {
          const x = LEFT + COLUMN * i;
          const level = y(
            minimumBalance(TOKEN_ACCOUNT_SIZE, step.lamportsPerByte),
          );
          const status = stepStatus(i, lamportsPerByte);
          const isCurrent = status === "current";
          const isUpcoming = status === "upcoming";
          const next = RENT_STEPS[i + 1];
          const nextUpcoming =
            next && stepStatus(i + 1, lamportsPerByte) === "upcoming";

          return (
            <g key={step.label}>
              {/* Reclaimable space above the line */}
              <rect
                x={x}
                y={TOP}
                width={COLUMN}
                height={level - TOP}
                className={
                  isCurrent
                    ? "fill-indigo-500/25"
                    : isUpcoming
                      ? "fill-indigo-500/[7%]"
                      : "fill-zinc-500/[7%]"
                }
              />
              {/* Deposit that has to stay */}
              <rect
                x={x}
                y={level}
                width={COLUMN}
                height={BOTTOM - level}
                className={isCurrent ? "fill-zinc-300" : "fill-zinc-200/70"}
              />
              <line
                x1={x}
                x2={x + COLUMN}
                y1={level}
                y2={level}
                strokeWidth={isCurrent ? 2.5 : 1.5}
                strokeDasharray={isUpcoming ? "4 3" : undefined}
                className={
                  isCurrent
                    ? "stroke-indigo-600"
                    : isUpcoming
                      ? "stroke-indigo-300"
                      : "stroke-zinc-400"
                }
              />
              {next && (
                <line
                  x1={x + COLUMN}
                  x2={x + COLUMN}
                  y1={level}
                  y2={y(
                    minimumBalance(TOKEN_ACCOUNT_SIZE, next.lamportsPerByte),
                  )}
                  strokeWidth={1}
                  strokeDasharray={nextUpcoming ? "4 3" : undefined}
                  className={
                    nextUpcoming ? "stroke-indigo-300" : "stroke-zinc-400"
                  }
                />
              )}
              <text
                x={x + COLUMN / 2}
                y={BOTTOM + 14}
                textAnchor="middle"
                className={
                  isCurrent ? "fill-indigo-700 font-semibold" : "fill-zinc-500"
                }
              >
                {step.label}
              </text>
            </g>
          );
        })}

        {/* Timeline under the step names */}
        <text
          x={LEFT + COLUMN}
          y={BOTTOM + 28}
          textAnchor="middle"
          className="fill-zinc-400"
        >
          September
        </text>
        <text
          x={LEFT + COLUMN * (currentIndex + 0.5)}
          y={BOTTOM + 28}
          textAnchor="middle"
          className="fill-indigo-700"
        >
          Today
        </text>
        <text
          x={LEFT + COLUMN * 4.5}
          y={BOTTOM + 28}
          textAnchor="middle"
          className="fill-zinc-400"
        >
          Expected in November
        </text>

        {/* Callouts for today and for the last step */}
        <text
          x={LEFT + COLUMN * (currentIndex + 0.5)}
          y={(TOP + y(currentMin)) / 2 + 3.5}
          textAnchor="middle"
          className="fill-indigo-800 font-semibold tabular-nums"
        >
          {formatSol(paid - currentMin, 5)}
        </text>
        <text
          x={LEFT + COLUMN * 5.5}
          y={(TOP + y(lastMin)) / 2 + 3.5}
          textAnchor="middle"
          className="fill-indigo-400 tabular-nums"
        >
          {formatSol(paid - lastMin, 5)}
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-zinc-500">
        The deposit one token account has to hold. The shaded space above the
        line is SOL you can take back, per account.
      </figcaption>
    </figure>
  );
}
