import { cn } from "@blastctrl/ui";
import { PopoverPanel, PopoverOverlay } from "@headlessui/react";
import type { ComponentPropsWithoutRef, ComponentRef } from "react";
import React from "react";

const PopoverInternalPanel = React.forwardRef<
  ComponentRef<typeof PopoverPanel>,
  ComponentPropsWithoutRef<typeof PopoverPanel>
>((props, ref) => {
  const { className, children, ...rest } = props;

  return (
    <>
      <PopoverOverlay className="fixed inset-0 isolate z-10 bg-black/60 xs:hidden" />
      <PopoverPanel
        className={cn(
          "z-20 overflow-hidden rounded border border-black/5 bg-white p-4 shadow-md",
          "sm:absolute sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
          "fixed left-8 top-20",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          className,
        )}
        ref={ref}
        {...rest}
      >
        {children}
      </PopoverPanel>
    </>
  );
});

PopoverInternalPanel.displayName = "PopoverPanel";

export { PopoverInternalPanel as PopoverPanel };
export { Popover, PopoverButton } from "@headlessui/react";
