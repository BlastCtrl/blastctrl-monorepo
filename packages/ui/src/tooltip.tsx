/* eslint-disable @typescript-eslint/no-unsafe-argument */
"use client";

import { cloneElement, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Placement } from "@floating-ui/react";
import {
  flip,
  shift,
  offset,
  useFloating,
  autoUpdate,
  useInteractions,
  useHover,
  useFocus,
  useRole,
  useDismiss,
  FloatingPortal,
  useMergeRefs,
  arrow,
  FloatingArrow,
  useTransitionStyles,
} from "@floating-ui/react";
import { cn } from ".";

type Props = {
  content: ReactNode;
  children: JSX.Element;
  placement?: Placement;
  className?: string;
  arrowClassName?: string;
};

const OPEN_DELAY = 200;
const CLOSE_DELAY = 300;
const ARROW_HEIGHT = 7;
// const ARROW_WIDTH = 14;

export function Tooltip({
  content,
  children,
  placement = "bottom",
  className,
  arrowClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    placement,
    open,
    onOpenChange: (open) => {
      setOpen(open);
    },
    middleware: [
      offset(4 + ARROW_HEIGHT),
      flip(),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: OPEN_DELAY, restMs: CLOSE_DELAY }),
    useFocus(context),
    useRole(context, { role: "tooltip" }),
    useDismiss(context),
  ]);

  const { isMounted, styles } = useTransitionStyles(context, {
    duration: { open: 200, close: 100 },
    initial: {
      opacity: 0,
      transform: "scale(0.8)",
    },
  });

  const childrenRef = (children as any).ref;
  const ref = useMergeRefs([refs.setReference, childrenRef]);

  return (
    <>
      {cloneElement(
        children,
        getReferenceProps({
          ref,
          ...children.props,
          "data-state": open ? "open" : "closed",
        }),
      )}
      <FloatingPortal>
        {isMounted && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            <div
              style={styles}
              className={cn(
                "z-50 max-w-[400px] break-words rounded-lg bg-gray-600 px-3 py-2 text-left text-sm text-white",
                className,
              )}
            >
              <FloatingArrow
                className={cn("fill-gray-600", arrowClassName)}
                tipRadius={2}
                ref={arrowRef}
                context={context}
              />
              {content}
            </div>
          </div>
        )}
      </FloatingPortal>
    </>
  );
}
