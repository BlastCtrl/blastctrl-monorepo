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
concurrency, delayMs, abortSignal })`: the recover-nested tool's automatic
  search, token accounts owned by the wallet's own associated token accounts
  and whether the ATA program can recover each. The page checks one ATA at a
  time with an 800 ms pause (the defaults); the server checks several at once
  with no pause.

Instructions (revoke, recover) stay in the tools app. This workspace package
exports TypeScript source directly, like `@blastctrl/rent-reclaimer`.

```bash
pnpm -F @blastctrl/token-scans test
pnpm -F @blastctrl/token-scans typecheck
pnpm -F @blastctrl/token-scans lint
```
