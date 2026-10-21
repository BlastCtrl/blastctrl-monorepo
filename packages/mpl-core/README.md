# @blastctrl/mpl-core

A [`@solana/kit`](https://github.com/anza-xyz/kit) client for the Metaplex
Core program, generated with [Codama](https://github.com/codama-idl/codama)
from the program's own IDL. Nothing in the tools app uses it yet.

- `idl/mpl_core.json`: the program's Shank IDL, with `idl/source.json`
  recording the commit it was fetched from. `pnpm idl:fetch [--ref <ref>]`
  refreshes both from the program repository.
- `codama.mjs`: the Codama tree edits and the JS renderer; `pnpm generate`
  rewrites `src/generated`, which is committed. The generated code imports
  only from `@solana/kit` and its subpaths (`kitImportStrategy: "rootOnly"`).
- `src/client.test.ts`: an offline smoke test (program address, the asset
  signer PDA, building `createV1`, an `AssetV1` round trip).
- `src/index.ts`: what the package exports.

After refetching the IDL, run `pnpm generate`, then `pnpm typecheck` and
`pnpm test`.

## Where `codama.mjs` comes from

It ports the program repository's own generator config
(`configs/kinobi.cjs` in metaplex-foundation/mpl-core, Apache-2.0), written
for Kinobi and its Umi renderer, to Codama 1.x:

- the program is renamed `mplCore`;
- an `assetSigner` PDA (seeds `"mpl-core-execute"` and the asset address),
  carried by an empty `assetSigner` account as upstream does, used as the
  default `assetSigner` account of `executeV1`;
- `AssetV1`, `CollectionV1` and `GroupV1` are identified by their `key`
  field (the `Key` enum);
- the argument defaults upstream sets (`none()` for optional arguments,
  empty plugin lists, `DataState.AccountState`) and the default fee
  recipients of `collect`;
- the type renames `authority` to `pluginAuthority` and `crate` to
  `relationshipEntry` (the IDL links `CreateGroupV1Args.relationships` to a
  type named `crate` that it defines as `RelationshipEntry`).

## Not ported yet: plugin parsing

Core accounts store their plugins after the base account data, behind a
plugin header and registry. Upstream's Umi client reads those with
hand-written code (`clients/js/src/plugins/*` and the
`hooked/*AccountData.ts` files, wired up through Kinobi's
`customAccountData` and `base*` type renames). This client does not port
that layer: `getAssetV1Decoder()` and `fetchAssetV1()` decode only the base
fields (`key`, `owner`, `updateAuthority`, `name`, `uri`, `seq`) and ignore
the plugin bytes that follow. Building instructions that take plugins
(`createV2`, `addPluginV1`, ...) works, since those use the generated plugin
types. Reading plugins off an account is the follow-up.
