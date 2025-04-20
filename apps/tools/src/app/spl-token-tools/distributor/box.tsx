import clsx from "clsx";
import { ReactNode } from "react";

export function Box({
  children,
  enableOnMobile = false,
  className,
}: {
  children?: ReactNode;
  enableOnMobile?: boolean
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-visible bg-white ring-black/5 sm:rounded-lg sm:p-6 sm:pb-5 sm:shadow sm:ring-1",
        enableOnMobile && "rounded bg-white p-4 shadow ring-1 ring-black/5",
        className,
      )}
    >
      {children}
    </div>
  );
}
