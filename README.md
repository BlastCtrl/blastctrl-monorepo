# Blastctrl Monorepo

This monorepo currently hosts the Blast Tools Nextjs application, but it could be used for other purposes in the future. The project is originally based on the [Solana dApp Scaffold repo](https://github.com/solana-labs/dapp-scaffold).

### Structure

```
├── apps : applications
│   ├── tools : Blastctrl Tools (a nextjs web app)
├── packages : private packages used by apps
│   ├── octane-core : fork of the Octane project that provides functions used by the gasless-swap tool
│   ├── ui : reusable UI components for React apps (bundling is not setup here )
├── tooling : tooling packages (code formatting, linting, etc) which are used by the apps and packages
│   ├── eslint : base and nextjs-specific eslint configs
│   ├── prettier : base config for prettier
│   ├── tailwind : base config for tailwind
│   ├── typescript : base typescript config which can be extended
```

### Installation and setup

The project uses the `pnpm` package manager for managing dependencies. To install all dependencies, run `pnpm install` from the root directory.

To run the development server for the tools app:

```bash
pnpm dev
```

You will need to setup the following environment variables in the `apps/tools/.env` file:

```
NEXT_PUBLIC_RPC_ENDPOINT=
NEXT_PUBLIC_DAS_API=
JUP_SWAP_API=
REDIS_URL=
REDIS_TOKEN=
OCTANE_SECRET_KEYPAIR=
BONK_BURN_FEE_BPS=
OCTANE_PLATFORM_FEE_BPS=
```

### Using custom Swap API urls

You can set custom URLs via the configuration for any self-hosted Jupiter APIs, like the [V6 Swap API](https://station.jup.ag/docs/apis/self-hosted) or [QuickNode's Metis API](https://marketplace.quicknode.com/add-on/metis-jupiter-v6-swap-api). Here is an example

```
JUP_SWAP_API=https://metis.quiknode.pro/D3ADB33F/quote
```
