import {
  Description as HeadlessDescription,
  Field as HeadlessField,
  Fieldset as HeadlessFieldset,
  Label as HeadlessLabel,
  Legend as HeadlessLegend,
} from "@headlessui/react";
import type {
  DescriptionProps as HeadlessDescriptionProps,
  FieldProps as HeadlessFieldProps,
  FieldsetProps as HeadlessFieldsetProps,
  LabelProps as HeadlessLabelProps,
  LegendProps as HeadlessLegendProps,
} from "@headlessui/react";
import { cn } from ".";
import type React from "react";

export function Fieldset({
  className,
  ...props
}: { disabled?: boolean } & HeadlessFieldsetProps) {
  return (
    <HeadlessFieldset
      {...props}
      className={cn(
        "[&>*+[data-slot=control]]:mt-6 [&>[data-slot=text]]:mt-1",
        className,
      )}
    />
  );
}

export function Legend({ ...props }: HeadlessLegendProps) {
  return (
    <HeadlessLegend
      {...props}
      data-slot="legend"
      className={cn(
        "text-base/6 font-semibold text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/6",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        props.className,
      )}
    />
  );
}

export function FieldGroup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      data-slot="control"
      className={cn(className, "space-y-8")}
    />
  );
}

export function Field({ className, ...props }: HeadlessFieldProps) {
  return (
    <HeadlessField
      className={cn(
        className,
        "[&>[data-slot=label]+[data-slot=control]]:mt-3",
        "[&>[data-slot=label]+[data-slot=description]]:mt-1",
        "[&>[data-slot=description]+[data-slot=control]]:mt-3",
        "[&>[data-slot=control]+[data-slot=description]]:mt-3",
        "[&>[data-slot=control]+[data-slot=error]]:mt-3",
        "[&>[data-slot=label]]:font-medium",
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: { className?: string } & HeadlessLabelProps) {
  return (
    <HeadlessLabel
      {...props}
      data-slot="label"
      className={cn(
        className,
        "select-none text-base/6 text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/6",
      )}
    />
  );
}

export function Description({
  className,
  ...props
}: { className?: string } & HeadlessDescriptionProps) {
  return (
    <HeadlessDescription
      {...props}
      data-slot="description"
      className={cn(
        className,
        "text-base/6 text-zinc-500 data-[disabled]:opacity-50 sm:text-sm/6",
      )}
    />
  );
}

export function ErrorMessage({
  className,
  ...props
}: { className?: string } & HeadlessDescriptionProps) {
  return (
    <HeadlessDescription
      {...props}
      data-slot="error"
      className={cn(
        className,
        "text-base/6 text-red-600 data-[disabled]:opacity-50 sm:text-sm/6",
      )}
    />
  );
}
