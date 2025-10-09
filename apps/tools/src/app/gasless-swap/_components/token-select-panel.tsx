import { useDebounce } from "@/lib/hooks/use-debounce";
import { compress } from "@/lib/solana";
import { useJupTokens } from "@/state/queries/use-jup-tokens";
import { SpinnerIcon } from "@blastctrl/ui";
import { LinkIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useWallet } from "@solana/wallet-adapter-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { PopoverButton } from "./popover";
import { Checkbox } from "@headlessui/react";

type Token = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
};

export function TokenSelectPanel({
  onSelect,
}: {
  onSelect: (token: Token) => void;
}) {
  const { publicKey } = useWallet();
  const [enableUnknownTokens, setEnableUnknownTokens] = useState(false);
  const { data, status, error } = useJupTokens(
    publicKey?.toString(),
    enableUnknownTokens,
  );
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebounce(filter, 400);
  const filteredTokens =
    data?.filter(
      (token) =>
        token.symbol.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        token.name.toLowerCase().includes(debouncedFilter.toLowerCase()),
    ) ?? [];

  // The scrollable element for your list
  const parentRef = useRef<HTMLDivElement>(null);

  // The virtualizer
  const rowVirtualizer = useVirtualizer({
    count: filteredTokens.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
  });

  if (status === "error") {
    return (
      <div className="w-[280px] bg-white">
        <p>Error: token list could not be displayed</p>
        <p className="text-gray-700">{error.message}</p>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex h-[440px] w-[280px] flex-col bg-white">
        <div className="-mt-1 flex w-full justify-end pb-1">
          <Checkbox
            onChange={(checked) => {
              setEnableUnknownTokens(checked);
            }}
            className="cursor-default rounded-full px-2.5 py-1 text-sm/6 font-medium text-zinc-500 ring-1 ring-zinc-200 transition-colors data-[checked]:bg-indigo-500 data-[checked]:data-[hover]:bg-indigo-400 data-[checked]:text-white [&:not([data-checked])]:data-[hover]:bg-zinc-100"
          >
            Enable Unverified Tokens
          </Checkbox>
        </div>
        <SpinnerIcon className="mx-auto mt-auto size-8 animate-spin" />
        <span className="mb-auto pt-4 text-center text-sm text-zinc-500">
          Loading tokens can take a long time, especially if unverified tokens
          are included.
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-[440px] w-[280px] flex-col bg-white">
      <div className="-mt-1 flex w-full justify-end pb-1">
        <Checkbox
          onChange={(checked) => {
            setEnableUnknownTokens(checked);
          }}
          className="cursor-default rounded-full px-2.5 py-1 text-sm/6 font-medium text-zinc-500 ring-1 ring-zinc-200 transition-colors data-[checked]:bg-indigo-500 data-[checked]:data-[hover]:bg-indigo-400 data-[checked]:text-white [&:not([data-checked])]:data-[hover]:bg-zinc-100"
        >
          Enable Unverified Tokens
        </Checkbox>
      </div>
      <div className="relative pb-3">
        <MagnifyingGlassIcon className="absolute left-2 mt-2.5 size-5 text-gray-400" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search for tokens"
          className="w-full border-x-0 border-b-2 border-t-0 border-gray-400 px-3 py-2 pl-9 placeholder:text-gray-400 focus:border-b-2 focus:border-indigo-600 focus:ring-0"
        />
      </div>

      <div ref={parentRef} className="scroller -mx-4 grow">
        <ul
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          className="relative flex w-full flex-col"
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => (
            <li
              key={virtualItem.key}
              className="w-full hover:bg-indigo-100"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <PopoverButton
                onClick={() => {
                  const t = filteredTokens[virtualItem.index];
                  if (t) {
                    onSelect({
                      address: t.id,
                      decimals: t.decimals,
                      name: t.name,
                      symbol: t.symbol,
                    });
                  }
                }}
                className="flex h-full w-full items-center gap-3 px-4 py-3"
              >
                {filteredTokens[virtualItem.index]?.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    src={filteredTokens[virtualItem.index]?.icon}
                    alt=""
                    height={40}
                    width={40}
                    className="aspect-square h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-6 rounded-full bg-gray-400" />
                )}
                <span className="font-medium">
                  {filteredTokens[virtualItem.index]?.symbol}
                </span>
                <a
                  href={`https://solscan.io/token/${filteredTokens[virtualItem.index]?.id}`}
                  target="_blank"
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-nowrap items-center rounded-md bg-gray-300 px-3 py-1 text-xs"
                  rel="noreferrer"
                >
                  <span className="text-xs font-medium">
                    {compress(filteredTokens[virtualItem.index]?.id ?? "", 4)}
                  </span>
                  <LinkIcon aria-hidden="true" className="ml-1 size-4" />
                </a>
              </PopoverButton>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
