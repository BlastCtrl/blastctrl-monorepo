"use client";

import { navigation } from "@/app/_links";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { Footer } from "./footer";
import { Topbar } from "./topbar";

/**
 * Pages that bring their own header and footer: landing pages meant to be
 * shared on their own, outside the toolbox.
 */
const STANDALONE = ["reclaim-sol"];

/** The toolbox's top bar, breadcrumbs and footer around every other page. */
export function SiteChrome({ children }: { children: ReactNode }) {
  // Route segments identify the rendered page even when a rewrite changes
  // its public pathname (reclaim.blastctrl.com/ serves /reclaim-sol).
  const segment = useSelectedLayoutSegment();
  if (segment !== null && STANDALONE.includes(segment)) {
    return children;
  }

  return (
    <CommandPalette navigation={navigation}>
      <div className="flex grow flex-col">
        <Topbar />
        <Breadcrumbs />
        <main className="mx-auto w-full max-w-7xl grow p-4">{children}</main>
        <Footer />
      </div>
    </CommandPalette>
  );
}
