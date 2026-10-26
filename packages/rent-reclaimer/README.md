# Rent Reclaimer

The scan and the rules behind reclaiming rent from token accounts and
controlled mints, shared by the reclaim tools in `apps/tools` and the MCP
server in `apps/mcp`. It reads through any `@solana/kit` RPC and has no
React, wallet or environment-variable dependency.

- `discoverReclaimableAccounts(rpc, owner, { maxAccounts, abortSignal })`:
  the wallet's token accounts in both token programs, the mints among them
  it is the mint authority of, and the live rent-exempt minimum for each
  size. Throws `ScanLimitError` past `maxAccounts` token accounts.
- `lookupReclaimableMint(rpc, mint, owner)`: one mint by address, with the
  same authority rule (the paste box on the tool's Mints tab).
- `excessLamports`, `closes`, `reclaimLamports`, `keepOpenReason`, `feeBase`:
  what an account returns and whether it can close.
- `quoteReclaim(accounts, closeEmpty, basisPoints)`: one preview scenario
  with the tool's batch size, the excess-only service fee rounded down per
  transaction, and the base network fee, as exact decimal strings.

The tools app adds DAS names and images, selection, the instructions and the
wallet; the MCP server only quotes. This workspace package exports TypeScript
source directly, like `@blastctrl/kit-extensions`.

```bash
pnpm -F @blastctrl/rent-reclaimer test
pnpm -F @blastctrl/rent-reclaimer typecheck
pnpm -F @blastctrl/rent-reclaimer lint
```
