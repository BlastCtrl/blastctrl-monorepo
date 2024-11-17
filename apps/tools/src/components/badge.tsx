import { cn } from "@blastctrl/ui";

const colors = {
  green: "bg-green-500/15 text-green-700 group-data-[hover]:bg-green-500/25",
  zinc: "bg-zinc-600/10 text-zinc-700 group-data-[hover]:bg-zinc-600/20",
};

type BadgeProps = { color: keyof typeof colors };

export function Badge({
  color = "zinc",
  className,
  ...props
}: BadgeProps & React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={cn(
        className,
        "inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline",
        colors[color],
      )}
    />
  );
}
