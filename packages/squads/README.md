# @blastctrl/squads

A [`@solana/kit`](https://github.com/anza-xyz/kit) client for the Squads v4
multisig program (`SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`), generated
with [Codama](https://github.com/codama-idl/codama) from the program's
Anchor IDL, plus the hand-written helpers the SDK has and the IDL can't
express. The tools app uses it in place of `@sqds/multisig` (see "Squads
through the generated kit client" in `CONNECTOR_KIT_MIGRATION.md`), which
removed the app's last direct use of `@solana/web3.js`.

- `idl/squads_multisig_program.json`: the legacy-format Anchor IDL the SDK
  ships (`sdk/multisig/idl` in Squads-Protocol/v4), with `idl/source.json`
  recording the commit it was fetched from. `pnpm idl:fetch [--ref <ref>]`
  refreshes both.
- `codama.mjs`: the Codama tree edits and the JS renderer; `pnpm generate`
  rewrites `src/generated`, which is committed. The generated code imports
  only from `@solana/kit` and its subpaths (`kitImportStrategy: "rootOnly"`).
- `src/hooked`: hand-written helpers (below), on kit codecs only.
- `src/client.test.ts`, `src/hooked/*.test.ts`: offline tests. The PDAs,
  the compact message bytes and the `batchCreate` / `batchAddTransaction` /
  `proposalCreate` / `proposalActivate` / `proposalApprove` instructions are
  checked byte-for-byte against output of the SDK on web3.js 1
  (`src/fixtures/sdk-golden.json`).
- `src/index.ts`: what the package exports (generated and hooked).

After refetching the IDL, run `pnpm generate`, then `pnpm typecheck` and
`pnpm test`.

## What `codama.mjs` adds to the IDL

The IDL has no PDA seeds and no account defaults, so:

- the program is renamed `squadsMultisig`;
- the PDAs of the SDK's `src/pda.ts` (`findVaultPda`, `findTransactionPda`,
  `findProposalPda`, `findBatchTransactionPda`, `findEphemeralSignerPda`,
  `findSpendingLimitPda`, `findProgramConfigPda`), UTF-8 prefixes and
  little-endian numbers;
- `rentPayer` defaults to the creating signer (`creator`, or `member` for
  `batchAddTransaction`) in `batchCreate`, `proposalCreate`,
  `batchAddTransaction`, `vaultTransactionCreate` and
  `configTransactionCreate`, as the SDK's builders do.

Everything else is as the IDL says. Argument structs used by one
instruction are flattened into its input (`vaultIndex`, `memo`, ...); the
shared ones stay nested (`args: { memo }` for the proposal votes,
`args` for `vaultTransactionCreate`). The deprecated `multisigCreate` keeps
the single account the IDL gives it, named `null`.

## Hand-written helpers (`src/hooked`)

Ported from the SDK (`sdk/multisig/src/{types,utils}.ts` and
`utils/compiled-keys.ts`, MIT per its `package.json`).

- **The compact transaction message**
  (`getCompactTransactionMessageEncoder` / `Decoder` / `Codec`,
  `CompactTransactionMessage`): the `transactionMessage` bytes of
  `vaultTransactionCreate` and `batchAddTransaction`. Not the Borsh
  `VaultTransactionMessage` the accounts store (u32 vector lengths; the
  generated codec reads that): u8 vector lengths and u16 instruction data
  lengths.
- **`compileVaultTransactionMessage({ vault, instructions })`** and
  **`encodeVaultTransactionMessage(...)`**: compile kit instructions into
  that message with the vault as the payer. This follows the SDK's key
  order (each role group in first-appearance order), not kit's
  `compileTransactionMessage`, which sorts addresses within a group and so
  produces different (equally valid) bytes. No address lookup tables.
- **`vaultTransactionExecutionAccounts(rpc, { message, ephemeralSignerBumps,
vault, transaction })`**: the `anchorRemainingAccounts` of
  `vaultTransactionExecute` and `batchExecuteTransaction`, from the stored
  message: lookup tables, static accounts (signer unless the vault or an
  ephemeral signer PDA), then the accounts the tables load, read with one
  `getMultipleAccounts` (`jsonParsed`) call if the message uses any.
  `isStaticWritableIndex` and `isSignerIndex` are exported too.
- **Permissions**: `Permission` (`Initiate` 1, `Vote` 2, `Execute` 4),
  `hasPermission(permissions, permission)`, `permissionsFromList(list)`,
  `allPermissions()`, over the generated `Permissions { mask }`.
