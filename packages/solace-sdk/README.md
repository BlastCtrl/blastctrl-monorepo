# @blastctrl/solace-sdk

Typed client for the Blast API, generated with [Orval](https://orval.dev) from
the checked-in `openapi.yaml`. Builds never download anything.

- `openapi.yaml`: the backend's OpenAPI document.
- `openapi.source.json`: the backend repo and the exact commit the schema was taken at.
- `src/generated/`: Orval output, do not edit by hand. One function per operation
  (`listAirdrops`, `createTokenAirdrop`, …) plus the `get…Url` helpers. URLs carry the
  `/blast-api` prefix from `orval.config.cjs`, which `apps/tools/next.config.js` proxies
  to the backend.
- `src/custom-fetch.ts`: Orval's mutator. A 2xx response resolves to its parsed body,
  typed as the operation's success schema; anything else throws `SolaceApiError`
  (`status`, the backend's `error` code, `message`).
- `src/index.ts`: re-exports the generated functions, the schema types and the error.

The package ships its source: `apps/tools` imports `src/index.ts` through
`transpilePackages`, the same way it consumes `@blastctrl/ui`. There is no build step.

## Using it

Every function takes `RequestInit` as its last argument. Authenticated endpoints need
the bearer token there; the app's `useSolaceAuth()` hands out a ready `requestInit`,
and TanStack's abort signal goes in the same object:

```ts
const { requestInit } = useSolaceAuth();
const airdrops = await listAirdrops({ ...requestInit, signal });
```

```ts
try {
  await startAirdrop(id, batches, requestInit);
} catch (error) {
  if (
    error instanceof SolaceApiError &&
    error.error === "FST_AUTHENTICATION_ERROR"
  ) {
    // sign in again
  }
}
```

## Updating the schema

The backend lives in a separate repo and commits its generated `openapi.yaml`.
From the monorepo root:

```sh
pnpm api:update --ref <backend-tag-or-commit>
```

The ref is required so every update is deliberate and pinned; the resolved
commit is written to `openapi.source.json`. The script uses the `gh` CLI, so
your normal `gh auth login` covers the private repo (or set `GH_TOKEN`).

It downloads the schema, checks it is an OpenAPI 3 document, runs `pnpm generate`
and type checks `apps/tools`. If Orval fails, the schema and generated client are
restored from git. If the type check fails, the new client is kept so you can fix
the call sites it points at. Renamed `operationId`s are the usual reason: functions
and their `…Body` / `…200` types follow them.

To test without the network: `pnpm api:update --from-file path/to/openapi.yaml`.

## Review and commit

Read `openapi.source.json` (right commit?), then `openapi.yaml` (the real
review), then skim `src/generated/` and any call-site changes in `apps/tools`.
Commit them together, mentioning the backend commit:

```sh
git add packages/solace-sdk apps/tools
git commit -m "Update Blast API schema to <backend-sha>"
```

Nothing is committed or pushed automatically.
