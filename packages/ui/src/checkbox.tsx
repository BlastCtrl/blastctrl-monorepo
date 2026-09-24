import React from "react";
import { cn } from ".";

// The check and dash marks from @tailwindcss/forms. They are drawn as
// background images so the checkbox stays a single native <input>: refs,
// `indeterminate` and `disabled:` utilities keep working as usual.
const svgUrl = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const marks = {
  "--checkbox-check": svgUrl(
    '<svg viewBox="0 0 16 16" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>',
  ),
  "--checkbox-dash": svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16"><path stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h8"/></svg>',
  ),
} as React.CSSProperties;

const styles = [
  // Base
  "inline-block size-4 shrink-0 appearance-none p-0 align-middle select-none [print-color-adjust:exact]",
  "rounded-sm border border-gray-500 bg-white bg-origin-border text-blue-600",
  // Focus
  "focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white",
  // Checked and indeterminate, filled with the text color
  "checked:border-transparent checked:bg-current checked:bg-(image:--checkbox-check)",
  "indeterminate:border-transparent indeterminate:bg-current indeterminate:bg-(image:--checkbox-dash)",
  "bg-size-[100%_100%] bg-center bg-no-repeat",
  // Use the system checkbox in Windows high contrast mode
  "forced-colors:checked:appearance-auto forced-colors:indeterminate:appearance-auto",
];

export const Checkbox = React.forwardRef(function Checkbox(
  {
    className,
    style,
    ...props
  }: Omit<React.ComponentPropsWithoutRef<"input">, "type">,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      {...props}
      style={{ ...marks, ...style }}
      className={cn(styles, className)}
    />
  );
});
