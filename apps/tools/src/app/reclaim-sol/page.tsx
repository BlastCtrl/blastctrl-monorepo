import { RentStatusBoundary } from "@/app/spl-token-tools/reclaim-rent/_components/rent-status-boundary";
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

// How often the server reads the rent status again; see RentStatusBoundary.
export const revalidate = 300;

export default function ReclaimSolPage() {
  return (
    <RentStatusBoundary>
      <Landing>
        <OneClickReclaim />
      </Landing>
    </RentStatusBoundary>
  );
}
