import type {
  FieldProps as HeadlessFieldProps,
  SwitchProps as HeadlessSwitchProps,
} from "@headlessui/react";
import {
  Field as HeadlessField,
  Switch as HeadlessSwitch,
} from "@headlessui/react";
import type React from "react";
import { cn } from ".";

export function SwitchGroup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="control"
      {...props}
      className={cn(
        // Basic groups
        "space-y-3 **:data-[slot=label]:font-normal",
        // With descriptions
        "has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium",
        className,
      )}
    />
  );
}

export function SwitchField({ className, ...props }: HeadlessFieldProps) {
  return (
    <HeadlessField
      data-slot="field"
      {...props}
      className={cn(
        // Base layout
        "grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-1 sm:grid-cols-[1fr_auto]",

        // Control layout
        "*:data-[slot=control]:col-start-2 *:data-[slot=control]:self-center",

        // Label layout
        "*:data-[slot=label]:col-start-1 *:data-[slot=label]:row-start-1 *:data-[slot=label]:justify-self-start",

        // Description layout
        "*:data-[slot=description]:col-start-1 *:data-[slot=description]:row-start-2",

        // With description
        "has-data-[slot=description]:**:data-[slot=label]:font-medium",
        className,
      )}
    />
  );
}

const colors = {
  indigo: [
    "[--switch-bg-ring:var(--color-indigo-600)]/90 [--switch-bg:var(--color-indigo-500)]",
    "[--switch:white] [--switch-ring:var(--color-indigo-600)]/90 [--switch-shadow:var(--color-indigo-900)]/20",
  ],
};

export function Switch({
  className,
  ...props
}: {
  className?: string;
  children?: React.ReactNode;
} & Omit<HeadlessSwitchProps, "children">) {
  return (
    <HeadlessSwitch
      data-slot="control"
      className={cn(
        className,

        // Base styles
        "group relative isolate inline-flex h-6 w-10 cursor-default rounded-full p-[3px] sm:h-5 sm:w-8",

        // Transitions
        "transition duration-0 ease-in-out data-changing:duration-200",

        // Outline and background color in forced-colors mode so switch is still visible
        "forced-colors:outline-solid forced-colors:[--switch-bg:Highlight]",

        // Unchecked
        "bg-zinc-200 ring-1 ring-black/5 ring-inset",

        // Checked
        "data-checked:bg-(--switch-bg) data-checked:ring-(--switch-bg-ring)",

        // Focus
        "focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500 data-focus:outline-solid",

        // Hover
        "data-hover:ring-black/15 data-hover:data-checked:ring-(--switch-bg-ring)",
        "dark:data-hover:data-checked:ring-(--switch-bg-ring)",

        // Disabled
        "data-disabled:bg-zinc-200 data-disabled:opacity-50 data-disabled:data-checked:bg-zinc-200 data-disabled:data-checked:ring-black/5",

        // eslint-disable-next-line @typescript-eslint/dot-notation
        colors["indigo"],
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          // Basic layout
          "pointer-events-none relative inline-block size-4.5 rounded-full sm:size-3.5",

          // Transition
          "translate-x-0 transition duration-200 ease-in-out",

          // Invisible border so the switch is still visible in forced-colors mode
          "border border-transparent",

          // Unchecked
          "bg-white shadow-sm ring-1 ring-black/5",

          // Checked
          "group-data-checked:bg-(--switch) group-data-checked:shadow-(--switch-shadow) group-data-checked:ring-(--switch-ring)",
          "group-data-checked:translate-x-4 sm:group-data-checked:translate-x-3",

          // Disabled
          "group-data-checked:group-data-disabled:bg-white group-data-checked:group-data-disabled:shadow-sm group-data-checked:group-data-disabled:ring-black/5",
        )}
      />
    </HeadlessSwitch>
  );
}
