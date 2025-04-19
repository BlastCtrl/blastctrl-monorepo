import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    REDIS_URL: z.string().url(),
    REDIS_TOKEN: z.string().min(1),
    OCTANE_SECRET_KEYPAIR: z.string().min(1),
    BONK_BURN_FEE_BPS: z
      .string()
      .transform((v) => +v)
      .refine((amount) => !isNaN(amount), "Bonk burn fee must be a number"),
    OCTANE_PLATFORM_FEE_BPS: z
      .string()
      .transform((v) => +v)
      .refine(
        (amount) => !isNaN(amount),
        "Octane platform fee must be a number",
      ),
    BLAST_BACKEND_URL: z.string().url(),
  },
  runtimeEnv: process.env,
});
