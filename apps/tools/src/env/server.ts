import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    REDIS_URL: z.string().url(),
    REDIS_TOKEN: z.string().min(1),
    OCTANE_SECRET_KEYPAIR: z.string().min(1),
  },
  runtimeEnv: process.env,
});
