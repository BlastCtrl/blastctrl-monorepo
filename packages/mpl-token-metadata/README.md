# @blastctrl/mpl-token-metadata

A [`@solana/kit`](https://github.com/anza-xyz/kit) client for the Metaplex
Token Metadata program, generated with [Codama](https://github.com/codama-idl/codama)
from the program's own IDL. Nothing in the tools app uses it yet.

- `idl/token_metadata.json`: the program's Shank IDL, with `idl/source.json`
  recording the commit it was fetched from. `pnpm idl:fetch [--ref <ref>]`
  refreshes both from the program repository.
- `codama.mjs`: the Codama tree edits and the JS renderer, ported from
  upstream's own config for their `clients/js-kit` package. `pnpm generate`
  rewrites `src/generated`, which is committed.
- `src/hooked`: hand-written code the generated code links to (instruction
  resolvers, the associated-token and edition-marker PDAs, the delegate-role
  seed encoders), plus upstream's digital-asset fetchers and create helpers.
  Ported from upstream's `clients/js-kit/src/hooked`.
- `src/index.ts`: what the package exports (`generated` and `hooked`).
- `src/client.test.ts`: offline smoke tests (program address, PDAs, building
  `createV1`, the `Metadata` codec, digital-asset decoding).

The generated code imports only from `@solana/kit`, including its
`@solana/kit/program-client-core` subpath, so consumers need
`moduleResolution: "bundler"` (or `nodenext`). The hooked helpers also use
`@solana-program/token` for the mint and token account decoders.

After refetching the IDL, run `pnpm generate`, then `pnpm typecheck` and
`pnpm test`.
