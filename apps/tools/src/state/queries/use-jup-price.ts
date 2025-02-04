import { useQuery } from "@tanstack/react-query";

export function useJupPrice(mintOrSymbol: string, vsMint: string) {
  return useQuery<string, Error>({
    enabled: !!mintOrSymbol && !!vsMint,
    queryKey: ["jup-price", mintOrSymbol, vsMint],
    queryFn: async () => {
      const priceResponse = await fetch(
        `/api/octane/price?mint=${mintOrSymbol}&vsMint=${vsMint}`,
      );
      if (!priceResponse.ok) {
        throw new Error("Error fetching price");
      }

      return priceResponse.text();
    },
    retry: 2,
  });
}
