import { useQuery } from "@tanstack/react-query";

export function useJupPrice(mint: string) {
  return useQuery<string, Error>({
    enabled: !!mint,
    queryKey: ["jup-price", mint],
    queryFn: async () => {
      const priceResponse = await fetch(`/api/octane/price?mint=${mint}`);
      if (!priceResponse.ok) {
        throw new Error("Error fetching price");
      }

      return priceResponse.text();
    },
    retry: 2,
  });
}
