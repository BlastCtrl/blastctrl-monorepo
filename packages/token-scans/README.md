# Token Scans

Read-only scans of a wallet's token accounts, shared by the tools in
`apps/tools` and the MCP server in `apps/mcp`. They read through any
`@solana/kit` RPC with the methods they use and have no React, wallet or
environment-variable dependency.

- `fetchDelegatedTokenAccounts(rpc, owner, { abortSignal })`: Token and
  Token-2022 accounts of `owner` with a delegate set (the revoke-delegations
  tool's list).
- `fetchTokenAccountsByOwner`, `filterAssociatedTokenAccounts`,
  `isAssociatedTokenAccount` and `findNestedAta({ rpc, walletAccounts,
concurrency, intervalMs, maxRetries, retryBaseMs, abortSignal })`: the
  recover-nested tool's automatic search, token accounts owned by the
  wallet's own associated token accounts and whether the ATA program can
  recover each. The defaults (`PUBLIC_RPC_NESTED_SCAN`: four ATAs at once, a
  new one at most every 100 ms, so at most 20 requests per second) suit the
  page's public, rate-limited RPC; the server checks ten at once with no
  interval. Rate-limited requests (HTTP 429) are retried with a doubling
  backoff that pauses the whole scan.

Instructions (revoke, recover) stay in the tools app. This workspace package
exports TypeScript source directly, like `@blastctrl/rent-reclaimer`.

```bash
pnpm -F @blastctrl/token-scans test
pnpm -F @blastctrl/token-scans typecheck
pnpm -F @blastctrl/token-scans lint
```
