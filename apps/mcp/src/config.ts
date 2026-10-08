import { z } from "zod";

const schema = z.object({
  RPC_ENDPOINT: z
    .url()
    .refine(
      (url) => new URL(url).protocol === "https:",
      "Use an HTTPS mainnet RPC endpoint",
    ),
  // Required so a missing value cannot silently advertise the service as free.
  RECLAIM_RENT_FEE_BPS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(10_000)),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  PUBLIC_ORIGIN: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && url.origin === value;
    }, "Use the HTTPS origin without a path or trailing slash")
    .optional(),
});

export function readConfig(env: NodeJS.ProcessEnv) {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Report field names only. Never print the RPC URL or the environment.
    throw new Error(
      `Invalid MCP configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}. See .env.example.`,
    );
  }
  return result.data;
}
