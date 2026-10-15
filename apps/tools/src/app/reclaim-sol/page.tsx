import type { Metadata } from "next";
import { Landing } from "./_components/landing";
import { OneClickReclaim } from "./_components/one-click-reclaim";

const title = "Reclaim your SOL | BlastCtrl";
const description =
  "Solana lowered rent. Take back the extra SOL your token accounts still hold, in one go, and keep every token.";
const url = "https://reclaim.blastctrl.com/";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  alternates: { canonical: url },
  // Next.js uses the colocated Open Graph image for the Twitter card as well.
  twitter: { card: "summary_large_image", title, description },
  openGraph: {
    type: "website",
    title,
    description,
    url,
    locale: "en_US",
  },
};

export default function ReclaimSolPage() {
  return (
    <Landing>
      <OneClickReclaim />
    </Landing>
  );
}
