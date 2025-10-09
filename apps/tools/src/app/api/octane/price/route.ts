import { z } from "zod";
import { isPublicKey } from "@/lib/solana/common";
import { redisClient } from "@/lib/redis";
import Decimal from "decimal.js";

export const maxDuration = 60;
export const runtime = "nodejs";

const REDIS_KEY_DURATION = 60; // seconds

type JupiterPriceResponse = {
  [key: string]: {
    blockId?: number;
    decimals: number;
    usdPrice: number;
    priceChange24h?: number;
  };
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const schema = z.object({
    mint: z
      .string()
      .refine((val) => isPublicKey(val), "Must be a valid Solana public key"),
  });
  const result = schema.safeParse({
    mint: searchParams.get("mint"),
  });
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
    });
  }

  // mint is usually SOL
  // vsMint is the token we are comparing to
  const vsMint = "So11111111111111111111111111111111111111112";

  const key = PriceSerializer.serializeKey(result.data.mint, vsMint);
  try {
    const cachedPriceData = await redisClient.get<string>(key);
    if (cachedPriceData !== null) {
      return new Response(cachedPriceData);
    }
  } catch (error) {
    // NOTIFY!
    console.error(
      `Failed to load redis data for key ${key}: ${(error as Error).message}`,
    );
  }

  const params = new URLSearchParams();
  params.append("ids", `${result.data.mint},${vsMint}`);
  const url = new URL("https://lite-api.jup.ag/price/v3");
  url.search = params.toString();

  const priceResponse = await fetch(url);
  if (!priceResponse.ok) {
    console.error(await priceResponse.text());
    return new Response(
      JSON.stringify({ error: "Error while fetching prices" }),
      {
        status: 500,
      },
    );
  }

  const priceData = (await priceResponse.json()) as JupiterPriceResponse;

  if (result.data.mint in priceData && vsMint in priceData) {
    const mintUsdPrice = priceData[result.data.mint]!.usdPrice;
    const solUsdPrice = priceData[vsMint]!.usdPrice;

    const solPrice = new Decimal(solUsdPrice).div(mintUsdPrice);

    try {
      await redisClient.set(key, solPrice, {
        ex: REDIS_KEY_DURATION,
      });
    } catch (error) {
      // NOTIFY!
      console.error(
        `Failed to save redis data for key ${key}: ${(error as Error).message}`,
      );
    }
    return new Response(solPrice.toFixed());
  } else {
    return new Response(JSON.stringify({ error: "No price data found" }), {
      status: 500,
    });
  }
}

class PriceSerializer {
  static serializeKey(mint: string, vsMint: string) {
    return `${mint}-${vsMint}`;
  }
}
