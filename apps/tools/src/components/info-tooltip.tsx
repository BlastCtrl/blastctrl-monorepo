import { cn } from "@blastctrl/ui";
import { Tooltip } from "@blastctrl/ui/tooltip";
import { InformationCircleIcon } from "@heroicons/react/16/solid";
import { ReactNode } from "react";

type Placement =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-start"
  | "top-end"
  | "right-start"
  | "right-end"
  | "bottom-start"
  | "bottom-end"
  | "left-start"
  | "left-end";

export function InfoTooltip({
  children,
  className,
  tooltipClassName,
  placement,
}: {
  children: ReactNode;
  className?: string;
  tooltipClassName?: string;
  placement?: Placement;
}) {
  return (
    <Tooltip
      content={children}
      className={tooltipClassName}
      placement={placement}
    >
      <InformationCircleIcon
        className={cn("size-4 text-zinc-500", className)}
      />
    </Tooltip>
  );
}
