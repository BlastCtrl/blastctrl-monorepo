# BlastCtrl MCP: Rent Reclaimer

This server lets ChatGPT check a Solana address for reclaimable rent.
It uses the same account scan as the BlastCtrl website, from
`packages/rent-reclaimer`, and reads the chain with `@solana/kit`.

The flow is:

1. The user supplies a Solana address in ChatGPT.
2. ChatGPT calls `analyze_rent_reclaim` on this server.
3. The server reads mainnet account data and returns an estimate.
4. ChatGPT shows the result and a link to BlastCtrl.
5. The user opens BlastCtrl, connects the wallet, and scans again before reclaiming.

MCP is the protocol used for steps 2 and 3. ChatGPT supplies the chat interface.
The server needs no OpenAI API key. It has no wallet, private key, transaction
builder, or signing tool. It does not serve an embedded interface.

## Run locally

Use Node 24 and the repository's pnpm version. From the repository root:

```sh
pnpm install
cp apps/mcp/.env.example apps/mcp/.env
```

Edit `apps/mcp/.env`:

- Set `RPC_ENDPOINT` to an HTTPS mainnet RPC endpoint. Nothing checks the
  network, so a devnet URL would quote devnet balances as mainnet.
- Set `RECLAIM_RENT_FEE_BPS` to the website's effective service fee rate.
  For example, use `500` for 5%. Use `0` only when the website has no fee.
  The website enables the fee only when its recipient and rate are both set.
  Keep this value in sync with the website's deployment.
- Keep `HOST=127.0.0.1` for local work.

Start the server:

```sh
pnpm dev:mcp
```

The MCP URL is `http://127.0.0.1:8787/mcp`. The health URL is
`http://127.0.0.1:8787/health`.

There is no build step. The server runs from TypeScript through `tsx`, the
way the workspace packages it imports are shipped (as source):

```sh
pnpm --filter @blastctrl/mcp start
```

## Test the tool

Run the tests from the repository root:

```sh
pnpm test:mcp
pnpm -F @blastctrl/rent-reclaimer test
```

The tests use RPC fixtures and an actual MCP client over local HTTP.
They do not send transactions or use an external RPC provider. The scan
itself is tested in `packages/rent-reclaimer`.

For a manual test, start MCP Inspector:

```sh
pnpm dlx @modelcontextprotocol/inspector
```

In Inspector, select Streamable HTTP and use the MCP URL above. List tools.
Call `analyze_rent_reclaim` with:

```json
{ "address": "YOUR_SOLANA_ADDRESS" }
```

Inspector's browser origins on port 6274 are allowed. Requests from other
browser origins are rejected unless the origin matches `PUBLIC_ORIGIN`.
ChatGPT's server requests do not need browser CORS permission.

## Connect it to ChatGPT

Local HTTP tests do not connect this server to your ChatGPT account.
For a test connection, expose port 8787 through an HTTPS development tunnel:

```sh
ngrok http 8787
```

Set `PUBLIC_ORIGIN` in `.env` to that tunnel's HTTPS origin. Use no path or
trailing slash. Restart the server. This permits the public Host header.

In ChatGPT Plugins, select **Add custom MCP server**. Supply the HTTPS URL
with `/mcp` at the end. Select no authentication. Install the resulting test
plugin, enable it in a new chat, and ask:

> Check this Solana address for reclaimable rent: ADDRESS

Test a valid address, an empty address, an invalid address, and an RPC failure.
Check that ChatGPT reports the estimate as closing the empty accounts. Check that the link opens
reclaim.blastctrl.com. The link does not prefill an address; the user must
connect the address that was analyzed.

No portable plugin package is needed for this custom-server test. Public
distribution is a later step. It requires a stable HTTPS URL, plugin metadata,
domain verification, and review. The current OpenAI guidelines restrict
crypto-transfer execution. Confirm whether rent analysis and its external
reclaim link are eligible before submitting a public plugin.

## Result limits

- Mainnet only. The tool accepts an address, not an RPC URL.
- The scan covers SPL Token and Token-2022 accounts. It checks mint authority
  only for mints referenced by those accounts. It does not find every mint.
- `estimate` closes eligible empty token accounts, like reclaim.blastctrl.com
  does, and separates excess rent from the closure deposit. Accounts that
  can't close (frozen, another close authority, withheld or confidential
  Token-2022 balances) give up only their excess.
- Service fees use the existing excess-only rule, rounded down per batch.
  Network fees use the website's estimate of 5,000 lamports per transaction
  and ten accounts per batch. Wallet priority fees are not included.
- Quotes are estimates. They do not prove control of the address or support
  multisig signing. Account balances can change before the user reclaims.
- Amounts use decimal strings for integer lamports and SOL. No floating-point
  SOL calculation is needed in the client.
- The account list contains at most 20 relevant accounts. Totals include all
  scanned accounts. The result says when the displayed list is shorter.
- A scan with more than 5,000 token accounts fails with no estimate. RPC
  failures also return errors. They are not treated as zero balances.
- Each scan has a 25-second deadline. RPC requests use the same abort signal.
- Each process permits four concurrent scans and 30 scan starts per minute.
  Multiple replicas need a shared limit at the deployment boundary.
- POST bodies are limited to 16 KiB. RPC URLs and provider error details are
  not included in tool errors or startup logs.
- This first version does not use DAS metadata, a database, or persistent scans.
- Kit's RPC client does not retry on rate limits, so a 429 from the provider
  fails the scan instead of stretching it past its deadline.

For deployment, set `HOST=0.0.0.0`, set `PUBLIC_ORIGIN`, and place the Node
server behind HTTPS. Keep the RPC credential in the host's secret storage.
The HTTP endpoint is intentionally unauthenticated. The limits above are a
small test deployment budget, not per-user quotas.

## Sources

- [OpenAI MCP quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

Documentation checked on 2026-10-08. ChatGPT account and workspace settings
can affect access to custom MCP servers.
