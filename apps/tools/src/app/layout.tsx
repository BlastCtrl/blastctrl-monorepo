import { SiteChrome } from "@/components/layout/site-chrome";
import "@solana/wallet-adapter-react-ui/styles.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles/globals.css";
import "../styles/scroller.css";
import { Providers } from "./providers";
import localFont from "next/font/local";

export const metadata: Metadata = {
  title: "Solana Tools | BlastTools",
  description: "A small toolbox for the adventuring Solana degen.",
  keywords:
    "solana, blockchain, crypto, cryptocurrency, nft, defi, gaming, investing, fund, project, management, consulting, advice, ventures, capital, help, fundraising, tokenomics, business, strategy",
  twitter: {
    card: "summary_large_image",
    title: "BlastTools",
    description: "A small toolbox for the adventuring Solana degen.",
    images: ["https://cdn.blastctrl.com/bc/img/og_tools_image.png"],
  },
  openGraph: {
    type: "website",
    title: "BlastTools",
    description: "A small toolbox for the adventuring Solana degen.",
    url: "https://tools.blastctrl.com/",
    locale: "en_US",
    images: ["https://cdn.blastctrl.com/bc/img/og_tools_image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#e52525",
};

const roboto = localFont({
  src: [
    { path: "../fonts/roboto/roboto-v51-latin-300.woff2", weight: "300" },
    { path: "../fonts/roboto/roboto-v51-latin-regular.woff2", weight: "400" },
    { path: "../fonts/roboto/roboto-v51-latin-500.woff2", weight: "500" },
    { path: "../fonts/roboto/roboto-v51-latin-700.woff2", weight: "700" },
    { path: "../fonts/roboto/roboto-v51-latin-900.woff2", weight: "900" },
  ],
  display: "swap",
  style: "normal",
  variable: "--font-roboto",
});

const robotoSlab = localFont({
  src: "../fonts/roboto-slab/roboto-slab-latin-variable.woff2",
  display: "swap",
  style: "normal",
  variable: "--font-roboto-slab",
  weight: "300 900",
  adjustFontFallback: "Times New Roman",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoSlab.variable} h-full scrollbar-gutter-stable antialiased scheme-only-light dark:bg-white`}
    >
      <body className="flex h-full flex-col">
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
