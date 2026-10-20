import { Select } from "@/components";
import { cn } from "@blastctrl/ui";
import { CogIcon } from "@heroicons/react/24/outline";

/** The slippage a swap may suffer before it fails, in percent. */
export const SLIPPAGE_OPTIONS = [0.1, 0.5, 1] as const;

/** Percent as the basis points Jupiter takes. */
export const toSlippageBps = (percent: number) => Math.round(percent * 100);

const COLORS = {
  indigo: {
    button: "bg-indigo-500 hover:bg-indigo-600",
    selected: "bg-indigo-500 text-white",
    active: "bg-indigo-500/30",
  },
  amber: {
    button: "bg-amber-500 hover:bg-amber-600",
    selected: "bg-amber-500 text-white",
    active: "bg-amber-500/30",
  },
};

/** A cog that opens the slippage choices; sits beside a form's submit button. */
export function SlippageSelect({
  value,
  onChange,
  color = "indigo",
}: {
  value: number;
  onChange: (value: number) => void;
  color?: keyof typeof COLORS;
}) {
  const colors = COLORS[color];
  return (
    <Select value={value} onChange={onChange}>
      <Select.Button
        aria-label={`Slippage ${value}%`}
        className={cn(
          "group h-full grow-0 rounded-md px-3 text-white",
          colors.button,
        )}
      >
        {({ open }) => (
          <CogIcon
            className={cn(
              "h-6 w-6 transition-transform duration-200 group-hover:rotate-90",
              open && "rotate-90",
            )}
          />
        )}
      </Select.Button>
      <Select.Options>
        <div className="px-2 text-left text-sm text-gray-500">Slippage</div>
        {SLIPPAGE_OPTIONS.map((percent) => (
          <Select.Option
            key={percent}
            value={percent}
            className={({ selected, active }) =>
              cn(
                "cursor-pointer rounded-full px-3",
                selected && colors.selected,
                active && !selected && colors.active,
              )
            }
          >
            {percent}%
          </Select.Option>
        ))}
      </Select.Options>
    </Select>
  );
}
