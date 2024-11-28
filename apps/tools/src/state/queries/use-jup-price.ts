import { useQuery } from "@tanstack/react-query";

// # Unit price of 1 JUP & 1 SOL based on the Derived Price in USDC
// https://api.jup.ag/price/v2?ids=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,So11111111111111111111111111111111111111112
//https://api.jup.ag/price/v2?ids=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN&vsToken=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&showExtraInfo=true

type TokenData = {
  id: string;
  type: "derivedPrice";
  price: string;
};

type JupiterPriceResponse = {
  data: {
    [key: string]: TokenData;
  };
  timeTaken: number;
};

const BASE_URL = "https://price.jup.ag/v6/price";

export function useJupPrice(mintOrSymbol: string, vsMint: string) {
  return useQuery<JupiterPriceResponse["data"], Error>({
    enabled: !!mintOrSymbol && !!vsMint,
    queryKey: ["jup-price", mintOrSymbol, vsMint],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("ids", mintOrSymbol);
      params.append("vsToken", vsMint);
      const url = new URL(BASE_URL);
      url.search = params.toString();

      const priceResponse = await fetch(url);
      if (!priceResponse.ok) {
        throw new Error("Error fetching price");
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return priceResponse.json().then((res) => res?.data);
    },
  });
}
