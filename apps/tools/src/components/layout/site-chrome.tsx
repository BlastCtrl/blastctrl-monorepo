"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { Footer } from "./footer";
import { Topbar } from "./topbar";

/**
 * Pages that bring their own header and footer: landing pages meant to be
 * shared on their own, outside the toolbox.
 */
const STANDALONE = ["/reclaim-sol"];

/** The toolbox's top bar, breadcrumbs and footer around every other page. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (STANDALONE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return children;
  }

  return (
    <>
      <Topbar />
      <Breadcrumbs />
      <main className="mx-auto w-full max-w-7xl grow p-4">{children}</main>
      <Footer />
    </>
  );
}
