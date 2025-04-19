import clsx from "clsx";
import { ReactNode } from "react";

export function Box({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-visible bg-white ring-black/5 sm:rounded-lg sm:p-6 sm:pb-5 sm:shadow sm:ring-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
