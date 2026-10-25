import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  plugins: [tsconfigPaths()],
  test: {
    // `src/env/client.ts` validates at import, and this is all it requires.
    env: { NEXT_PUBLIC_RPC_ENDPOINT: "http://localhost:8899" },
  },
});
