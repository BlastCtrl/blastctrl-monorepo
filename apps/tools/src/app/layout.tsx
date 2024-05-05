import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Footer } from "@/components/layout/footer";
import { Topbar } from "@/components/layout/topbar";
import "@solana/wallet-adapter-react-ui/styles.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles/globals.css";
import "../styles/scroller.css";
import { Providers } from "./providers";
import { Roboto, Roboto_Slab } from "next/font/google";

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

const roboto = Roboto({
  display: "swap",
  style: "normal",
  variable: "--font-roboto",
  weight: ["300", "400", "500", "700", "900"],
  subsets: ["latin"],
});

const roboto_slab = Roboto_Slab({
  display: "swap",
  style: "normal",
  variable: "--font-roboto-slab",
  weight: ["300", "400", "500", "700", "900"],
  subsets: ["latin"],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${roboto_slab.variable} h-full antialiased [color-scheme:only_light] [scrollbar-gutter:stable]`}
    >
      <body className="flex h-full flex-col">
        <Providers>
          <Topbar />
          <Breadcrumbs />
          <main className="mx-auto w-full max-w-7xl grow p-4">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
