import type { Metadata } from "next";
import { Landing } from "./_components/landing";
import { OneClickReclaim } from "./_components/one-click-reclaim";

const title = "Reclaim your SOL | BlastCtrl";
const description =
  "Solana lowered rent. Take back the extra SOL your token accounts still hold, in one go, and keep every token.";
const images = ["https://cdn.blastctrl.com/bc/img/og_tools_image.png"];
const url = "https://reclaim.blastctrl.com/";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  twitter: { card: "summary_large_image", title, description, images },
  openGraph: {
    type: "website",
    title,
    description,
    url,
    locale: "en_US",
    images,
  },
};

export default function ReclaimSolPage() {
  return (
    <Landing>
      <OneClickReclaim />
    </Landing>
  );
}
