import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";
import BlastCtrlTag from "@/../public/blastctrl_tag.png";
import BonkSmall from "@/../public/bonk_small.png";

export default function Page() {
  return (
    <div className="grid size-full items-start justify-center  pt-8 sm:items-center sm:pt-0 md:grid-cols-[45%_55%] md:gap-2 lg:gap-16">
      <Image
        priority
        src={BlastCtrlTag}
        alt="Logo"
        className="hidden h-auto w-full max-w-[360px] justify-self-end md:block"
      />
      <div>
        <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-gray-700 sm:text-5xl">
          Blast<span className="text-primary">Tools</span>
          <WrenchScrewdriverIcon className="ml-2 inline h-10 w-10 text-gray-600" />
        </h1>
        <div className="mb-8">
          <p className="text-base font-medium text-gray-500 sm:text-xl">
            A small toolbox for the adventuring Solana degen.
          </p>
          <p className="line-clamp-2 text-base font-medium text-gray-500 sm:text-xl">
            Use these to build, experiment and if needed, get out of trouble.
          </p>
        </div>
        <div className="flex max-w-md flex-col flex-wrap gap-2 sm:max-w-lg sm:flex-row">
          <Link
            href="/solana-nft-tools/update"
            className="inline-flex items-center justify-center rounded-lg border-2 border-indigo-600 px-3 py-1.5 text-indigo-950 shadow hover:bg-indigo-50 sm:justify-start"
          >
            Update NFT Metadata
          </Link>
          <Link
            href="/permanent-storage-tools/file-upload"
            className="inline-flex items-center justify-center rounded-lg border-2 border-orange-600 px-3 py-1.5 text-orange-950 shadow hover:bg-orange-50"
          >
            Upload files to Arweave
          </Link>
          <Link
            href="/solana-nft-tools/collections"
            className="inline-flex items-center justify-center rounded-lg border-2 border-cyan-600 px-3 py-1.5 text-cyan-950 shadow hover:bg-cyan-50"
          >
            Add/Remove NFT from collection
          </Link>
          <Link
            href="/solana-nft-tools/mint"
            className="inline-flex items-center justify-center rounded-lg border-2 border-sky-600 px-3 py-1.5 text-sky-950 shadow hover:bg-sky-50"
          >
            Mint NFTs
          </Link>
          <Link
            href="/spl-token-tools/recover-nested"
            className="inline-flex items-center justify-center rounded-lg border-2 border-violet-600 px-3 py-1.5 text-violet-950 shadow hover:bg-violet-50"
          >
            Recover nested accounts
          </Link>
          <Link
            href="/spl-token-tools/create-token"
            className="inline-flex items-center justify-center rounded-lg border-2 border-pink-600 px-3 py-1.5 text-pink-950 shadow hover:bg-pink-50"
          >
            Create fungible tokens
          </Link>
          <Link
            href="/gasless-swap"
            className="inline-flex items-center justify-center rounded-lg border-2 border-emerald-600 px-3 py-1.5 text-emerald-950 shadow hover:bg-emerald-50"
          >
            Gasless Swap
          </Link>
          <Link
            href="/gasless-bonk-swap"
            className="inline-flex items-center justify-center rounded-lg border-2 border-orange-600 bg-amber-300 px-3 py-1.5 text-orange-950 shadow hover:bg-amber-200"
          >
            <Image
              src={BonkSmall}
              height={24}
              width={24}
              alt=""
              className="size-6 rounded-full"
            />
            <span className="ml-2">Gasless Bonk Swap</span>
          </Link>
          <Link
            href="/spl-token-tools/close-empty"
            className="inline-flex items-center justify-center rounded-lg border-2 border-blue-600 px-3 py-1.5 text-blue-950 shadow hover:bg-blue-50"
          >
            Close empty accounts
          </Link>
          <Link
            href="/solana-stake-tools/stake-create"
            className="inline-flex items-center justify-center rounded-lg border-2 border-green-600 px-3 py-1.5 text-green-950 shadow hover:bg-green-50"
          >
            Create a stake account
          </Link>
          <Link
            href="/solana-stake-tools/stake-authorize"
            className="inline-flex items-center justify-center rounded-lg border-2 border-amber-600 px-3 py-1.5 text-amber-950 shadow hover:bg-amber-50"
          >
            Set stake account authorities
          </Link>
          <Link
            href="/solana-stake-tools/set-lockup"
            className="inline-flex items-center justify-center rounded-lg border-2 border-fuchsia-600 px-3 py-1.5 text-fuchsia-950 shadow hover:bg-fuchsia-50"
          >
            Set stake lockup
          </Link>
          <Link
            href="/solana-stake-tools/split-stake"
            className="inline-flex items-center justify-center rounded-lg border-2 border-red-600 px-3 py-1.5 text-red-950 shadow hover:bg-red-50"
          >
            Split stake
          </Link>
          <Link
            href="/solana-stake-tools/merge-stake"
            className="inline-flex items-center justify-center rounded-lg border-2 border-indigo-600 px-3 py-1.5 text-indigo-950 shadow hover:bg-indigo-50"
          >
            Merge stake accounts
          </Link>
          <Link
            href="/solana-stake-tools/mev-rewards"
            className="inline-flex items-center justify-center rounded-lg border-2 border-emerald-600 px-3 py-1.5 text-emerald-950 shadow hover:bg-emerald-50"
          >
            Withdraw MEV rewards
          </Link>
          <Link
            href="/spl-token-tools/token-hoover"
            className="inline-flex items-center justify-center rounded-lg border-2 border-rose-600 px-3 py-1.5 text-rose-950 shadow hover:bg-rose-50"
          >
            Clean up old wallet
          </Link>
        </div>
        <div className="mt-6 text-sm font-medium text-gray-700">
          More to come...
        </div>
      </div>
    </div>
  );
}
