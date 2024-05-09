import { DataInteractive as HeadlessDataInteractive } from "@headlessui/react";
import NextLink from "next/link";
import type { LinkProps } from "next/link";
import React from "react";

export const Link = React.forwardRef(function Link(
  props: LinkProps & React.ComponentPropsWithoutRef<"a">,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  return (
    <HeadlessDataInteractive>
      <NextLink {...props} ref={ref} />
    </HeadlessDataInteractive>
  );
});
