# Blastctrl Monorepo

This monorepo hosts the Blast Tools Nextjs application and the rent reclaimer MCP server. The project is originally based on the [Solana dApp Scaffold repo](https://github.com/solana-labs/dapp-scaffold).

### Structure

```
├── apps : applications
│   ├── tools : Blastctrl Tools (a nextjs web app)
│   ├── mcp : read-only MCP server that estimates reclaimable rent for an address (see its README)
├── packages : shared libraries and configuration
│   ├── eslint-config : ESLint 10 flat configs (base, React, Next.js)
│   ├── prettier-config : shared Prettier configuration
│   ├── kit-extensions : internal @solana/kit helpers, including the Token-2022 mint parsing
│   ├── rent-reclaimer : token-account scan, reclaim rules and quotes shared by the tools app and the MCP server
│   ├── tailwind-config : Tailwind v4 theme and PostCSS configuration
│   ├── typescript-config : TypeScript 6 base, Next.js, React and bundler presets
│   ├── mpl-core : Codama-generated @solana/kit client for Metaplex Core (see its README)
│   ├── mpl-token-metadata : Codama-generated @solana/kit client for Metaplex Token Metadata (see its README)
│   ├── octane-core : fork of Octane used by the gasless-swap tool
│   ├── solace-sdk : Orval-generated Blast API client (see its README)
│   ├── squads : Codama-generated @solana/kit client for Squads v4 multisigs (see its README)
│   ├── ui : React components consumed directly from source
├── e2e-tests : Playwright tests and Node.js scripts
```

### Installation and setup

The project uses Node.js 24 and pnpm 11.28.4. TypeScript stays on 6.0.3 across the workspace. To install all dependencies, run `pnpm install` from the root directory.

To run the development server for the tools app:

```bash
pnpm dev
```

You will need to setup the following environment variables in the `apps/tools/.env` file:

```
NEXT_PUBLIC_RPC_ENDPOINT=
JUP_SWAP_API=
REDIS_URL=
REDIS_TOKEN=
OCTANE_SECRET_KEYPAIR=
OCTANE_PLATFORM_FEE_BPS=
```

The rent reclaimer MCP server in `apps/mcp` needs its own `apps/mcp/.env`
(see `apps/mcp/.env.example` and [its README](apps/mcp/README.md)):

```bash
pnpm dev:mcp
pnpm test:mcp
```

### Workspace checks

```bash
pnpm lint        # ESLint 10 in every workspace containing JavaScript/TypeScript
pnpm typecheck   # TypeScript 6 checks across apps, libraries and tooling
pnpm build       # Build the SDK and the Next.js app
```

Each code package has an `eslint.config.mjs` importing a shared preset from
`@blastctrl/eslint-config`. The presets use the recommended JavaScript,
TypeScript, React Hooks and Next.js rules with Prettier compatibility. The
existing allowance for explicit `any` at SDK boundaries is retained. Generated
SDK files and build/test artifacts are excluded; handwritten SDK code, scripts
and configuration files are linted.

TypeScript presets live in `@blastctrl/typescript-config`: `base.json` defaults
to NodeNext, `nextjs.json` configures Next.js, `react-library.json` enables React
JSX, and `bundler.json` supports source packages consumed by the app. The SDK
continues emitting JavaScript and declarations into `dist`. Non-emitting presets
disable declarations to avoid TypeScript 6 portability checks on inferred app
and config exports.

`@blastctrl/tailwind-config` exports the shared theme stylesheet and `/postcss`
configuration. The app imports the stylesheet and explicitly scans the UI
package's source, so UI components do not need a separate CSS build.

### Production domains

The `apps/tools` Vercel project serves both `tools.blastctrl.com` and
`reclaim.blastctrl.com`. Host-specific rules in `apps/tools/next.config.js` serve
the reclaim page and its sitemap at the reclaim domain's root. The old
`tools.blastctrl.com/reclaim-sol` URL redirects permanently to the new domain;
other page paths on the reclaim domain redirect to the toolbox. API routes,
the `/blast-api` proxy, and static assets stay available on both domains.

The hostname rules leave localhost and Vercel preview URLs unchanged, so the
reclaim page remains available at `/reclaim-sol` there. Routing regression tests
can be run with `pnpm --filter @blastctrl/tools exec vitest run next.config.test.ts`.

### Using custom Swap API urls

You can set custom URLs via the configuration for any self-hosted Jupiter APIs, like the [V6 Swap API](https://station.jup.ag/docs/apis/self-hosted) or [QuickNode's Metis API](https://marketplace.quicknode.com/add-on/metis-jupiter-v6-swap-api). Here is an example

```
JUP_SWAP_API=https://metis.quiknode.pro/D3ADB33F/quote
```
