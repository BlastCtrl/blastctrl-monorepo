import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_RPC_ENDPOINT: z.string().url(),
    NEXT_PUBLIC_DAS_API: z.string().url(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_RPC_ENDPOINT: process.env.NEXT_PUBLIC_RPC_ENDPOINT,
    NEXT_PUBLIC_DAS_API: process.env.NEXT_PUBLIC_DAS_API,
  },
});
