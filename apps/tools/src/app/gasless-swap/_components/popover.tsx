import { cn } from "@blastctrl/ui";
import { Popover as PopoverPrimitive } from "@headlessui/react";
import type { ComponentPropsWithoutRef, ComponentRef } from "react";
import React from "react";

export const Popover = PopoverPrimitive;
export const PopoverButton = PopoverPrimitive.Button;

const PopoverPanel = React.forwardRef<
  ComponentRef<typeof PopoverPrimitive.Panel>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Panel>
>((props, ref) => {
  const { className, children, ...rest } = props;

  return (
    <>
      <PopoverPrimitive.Overlay className="xs:hidden fixed inset-0 isolate z-10 bg-black/60" />
      <PopoverPrimitive.Panel
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
      </PopoverPrimitive.Panel>
    </>
  );
});

PopoverPanel.displayName = "PopoverPanel";

export { PopoverPanel };
