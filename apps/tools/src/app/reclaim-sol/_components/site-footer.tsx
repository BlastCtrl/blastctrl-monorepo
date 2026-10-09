import BlastCtrlIconWhite from "@/../public/blastctrl_icon_white.svg";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const LINK =
  "inline-flex items-center gap-2 rounded-sm text-neutral-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Where to go from here: the full tool, the rest of the toolbox, BlastCtrl. */
export function SiteFooter() {
  return (
    <footer className="bg-[#333] text-sm">
      <div className="mx-auto grid max-w-5xl gap-x-16 gap-y-10 px-4 pt-12 pb-10 sm:grid-cols-2 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex flex-col">
          <Link
            href="/"
            className="-m-1 inline-flex items-center gap-2.5 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Image src={BlastCtrlIconWhite} alt="" className="size-7" />
            <span className="font-display text-lg font-bold tracking-tight text-white">
              BlastCtrl
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-neutral-400">
            A small toolbox for the adventuring Solana degen.
          </p>
          <p className="mt-auto text-xs text-neutral-400">
            &copy; 2026 BlastCtrl
          </p>
        </div>

        <LinkGroup title="Tools">
          <li>
            <Link href="/spl-token-tools/reclaim-rent" className={LINK}>
              Reclaim rent, with options
            </Link>
          </li>
          <li>
            <Link href="/" className={LINK}>
              All BlastCtrl tools
            </Link>
          </li>
        </LinkGroup>

        <LinkGroup title="BlastCtrl">
          <li>
            <a
              href="https://blastctrl.com"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              <Image
                src={BlastCtrlIconWhite}
                alt=""
                className="size-4 opacity-80"
              />
              blastctrl.com
            </a>
          </li>
          <li>
            <a
              href="https://twitter.com/BlastCtrl"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4 fill-current"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @BlastCtrl
            </a>
          </li>
          <li>
            <a
              href="https://discord.gg/KHar5PyXtE"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="size-4 fill-current"
              >
                <path d="M13.545 2.907a13.227 13.227 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.19 12.19 0 0 0-3.658 0 8.258 8.258 0 0 0-.412-.833.051.051 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.041.041 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032c.001.014.01.028.021.037a13.276 13.276 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019c.308-.42.582-.863.818-1.329a.05.05 0 0 0-.01-.059.051.051 0 0 0-.018-.011 8.875 8.875 0 0 1-1.248-.595.05.05 0 0 1-.02-.066.051.051 0 0 1 .015-.019c.084-.063.168-.129.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.052.052 0 0 1 .053.007c.08.066.164.132.248.195a.051.051 0 0 1-.004.085 8.254 8.254 0 0 1-1.249.594.05.05 0 0 0-.03.03.052.052 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.235 13.235 0 0 0 4.001-2.02.049.049 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.034.034 0 0 0-.02-.019Zm-8.198 7.307c-.789 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.316 0c-.788 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612Z" />
              </svg>
              Discord
            </a>
          </li>
          <li>
            <a
              href="https://t.me/BlastCtrl"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="size-4 fill-current"
              >
                <path
                  clipRule="evenodd"
                  d="m24 12c0 6.6274-5.3726 12-12 12-6.62742 0-12-5.3726-12-12 0-6.62742 5.37258-12 12-12 6.6274 0 12 5.37258 12 12zm-11.57-3.14107c-1.1671.48547-3.49985 1.49027-6.99809 3.01437-.56806.2259-.86563.4469-.89272.663-.04579.3652.41154.509 1.0343.7048.08471.0267.17249.0543.26247.0835.6127.1992 1.43688.4322 1.86535.4414.38865.0084.82244-.1518 1.30135-.4807 3.26854-2.2063 4.95574-3.32149 5.06164-3.34553.0748-.01696.1783-.03829.2485.02408.0701.06235.0633.18045.0558.21215-.0453.1931-1.8405 1.8621-2.7695 2.7258-.2896.2692-.495.4602-.537.5038-.0941.0978-.19.1902-.2821.279-.5692.5487-.99607.9602.0236 1.6322.4901.3229.8822.5899 1.2734.8563.4272.291.8533.5812 1.4046.9426.1405.0921.2746.1877.4053.2808.4972.3545.9439.6729 1.4957.6221.3207-.0295.6519-.331.8201-1.2302.3975-2.1252 1.1789-6.7299 1.3595-8.62742.0159-.16625-.004-.37901-.02-.4724-.016-.0934-.0494-.22647-.1708-.32498-.1438-.11666-.3657-.14126-.465-.13952-.4514.00796-1.1438.24874-4.4764 1.63485z"
                  fillRule="evenodd"
                />
              </svg>
              Telegram
            </a>
          </li>
        </LinkGroup>
      </div>
    </footer>
  );
}

function LinkGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <nav aria-label={title}>
      <h2 className="font-semibold text-white">{title}</h2>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </nav>
  );
}
