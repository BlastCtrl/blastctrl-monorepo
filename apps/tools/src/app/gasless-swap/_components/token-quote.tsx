import { formatNumber } from "@/lib/utils";
import { useJupPrice } from "@/state/queries/use-jup-price";
import { SpinnerIcon } from "@blastctrl/ui";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

type Props = {
  quoteToken: {
    name: string;
    address: string;
  } | null;
};

const SOL_MINT = "So11111111111111111111111111111111111111112";

export const TokenQuote = ({ quoteToken }: Props) => {
  const { data, error, isLoading } = useJupPrice(quoteToken?.address ?? "");

  if (!quoteToken) {
    return <div aria-hidden="true" className="h-12"></div>;
  }

  return (
    <div className="flex h-12 items-center justify-center">
      {error && <p>Failed to load token exchange rate</p>}

      {isLoading && (
        <div className="w-full">
          <SpinnerIcon className="mx-auto h-5 w-5 animate-spin" />
        </div>
      )}

      {data &&
        (() => {
          const price = Number(data ?? 0);
          const decimalCount = price > 1e6 ? 0 : price > 1e3 ? 2 : 3;

          return (
            <div className="flex flex-nowrap items-center justify-center gap-x-2 text-sm font-medium text-gray-600">
              <span>1 SOL</span>

              <div className="aspect-square w-6 rounded-full bg-gray-200 px-0.5 py-0.5">
                <ArrowsRightLeftIcon className="h-5 w-5 text-gray-900" />
              </div>

              <span>
                {formatNumber.format(price, decimalCount)} {quoteToken.name}
              </span>
            </div>
          );
        })()}
    </div>
  );
};
