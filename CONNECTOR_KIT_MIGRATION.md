# Migrating `apps/tools` to ConnectorKit + Solana Kit

Notes for whoever (human or agent) continues moving tools off
`@solana/wallet-adapter` + `@solana/web3.js` onto `@solana/connector`
(ConnectorKit) + `@solana/kit`. Everything here was learned while migrating
the stake tools; read it before touching the remaining tools.

Versions this was written against: `@solana/connector` 0.3.0,
`@solana/kit` 8.5.0, `@solana/kit-plugin-rpc` / `kit-plugin-signer` 0.19.0,
`@solana-program/stake` 0.11.0, `@solana-program/system` 0.16.0.

## Status

Done (use these as reference implementations):

| Area                                                                            | Files                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet UI (button, menu, connect dialog incl. WalletConnect)                    | `apps/tools/src/connector/`                                                                                                                                      |
| Kit client hook                                                                 | `apps/tools/src/connector/use-kit-client.ts`                                                                                                                     |
| Shared error helper                                                             | `apps/tools/src/connector/transaction-error.ts`                                                                                                                  |
| Stake tools (create UI + CSV, set-lockup, authorize, merge, split, MEV rewards) | `apps/tools/src/app/solana-stake-tools/**`                                                                                                                       |
| SPL token tools: close-empty, revoke-delegations, recover-nested, token-hoover  | `apps/tools/src/app/spl-token-tools/{close-empty,revoke-delegations,recover-nested,token-hoover}/**`                                                             |
| Permanent storage file upload (Turbo SDK via `@solana/connector/compat`)        | `apps/tools/src/app/permanent-storage-tools/file-upload/**`, `lib/turbo.ts`                                                                                      |
| DAS-extended RPC + token-account scans                                          | `src/connector/app-rpc.ts`, `src/state/queries/{use-asset-data,use-owner-assets,use-delegated-assets,use-reclaimable-accounts,use-owner-nfts,use-jup-tokens}.ts` |
| Shared reads on Kit RPC                                                         | `src/state/queries/use-stake-account.ts`, `use-user-stake-accounts.ts`, `use-epoch.ts`, `use-rent.ts`                                                            |
| Explorer links by connector cluster                                             | `src/state/use-query-context.ts`                                                                                                                                 |

Still on the adapter (as of 2026-10-20): NFT tools, the other SPL token tools
(create-token, distributor, reclaim-rent),
gasless swaps, reclaim-sol, `src/app/layout.tsx`
(still imports the adapter stylesheet), `src/state/context/SolanaProvider.tsx`,
`src/state/use-wallet-connection.ts`, the `use-*` queries that take a web3
`Connection`, `lib/solana/{send,send-batches,endpoints,collections}`,
`lib/hooks/use-umi.ts`, `lib/turbo.ts`, and the old
`components/layout/{desktop,mobile}-wallet.tsx` (unreferenced; delete when
nothing else needs them). `grep -rl "@solana/wallet-adapter" apps/tools/src`
is the live list.

Breaking other, not-yet-migrated tools while changing a shared query or
helper is accepted; they get fixed when their turn comes. Keep `tsc` clean
for the files you touch.

## The building blocks

### Hooks from `@solana/connector/react`

- `useConnector()` – wallet state. `account` is the connected `Address` or
  null; `connector` is the connected wallet's metadata (name, icon);
  `walletStatus` is the discriminated status; `connectWallet` /
  `disconnectWallet`.
- `useCluster()` – `type` (`mainnet | devnet | testnet | localnet | custom`),
  `cluster`, `clusters`, `setCluster(id)`. The cluster list is fixed at
  provider creation (`apps/tools/src/app/providers.tsx`); there is no runtime
  "add cluster", which is why custom RPC was dropped from the menu.
- `useSolanaClient()` – `{ client, ready }` where `client.rpc` /
  `client.rpcSubscriptions` are Kit RPC objects for the active cluster.
  **Works without a connected wallet.** Use it for reads.
- `useKitTransactionSigner()` – the connected wallet as a Kit
  `TransactionModifyingSigner`. You rarely need it directly; `useKitClient`
  wraps it.
- `useWalletConnectUri()` – React state only (`uri`, `clearUri`); it does not
  touch the transport.
- `useAppRpc()` (ours, `@/connector/app-rpc`) – the cluster's RPC with DAS
  methods; see below. Prefer it over `useSolanaClient` for new reads.

Avoid `useTransactionSigner()` / `useWallet()` from the connector for new
code: they return the connector's own byte-oriented signer, not a Kit signer,
and `capabilities.supportsBatchSigning` checks for a non-standard
`solana:signAllTransactions` feature that standard wallets don't expose.

### Opening the connect dialog

```ts
const { setOpen } = useConnectorDialog(); // from "@/connector/connector-dialog"
setOpen(true);
```

This replaces `useWalletModal().setVisible(true)` everywhere.

### `useAppRpc()` – reads, including DAS

`apps/tools/src/connector/app-rpc.ts` builds the app's RPC: Kit's Solana API
plus the Digital Asset Standard methods the app uses (`getAsset`, `getAssets`,
`searchAssets`), over the active cluster's endpoint (Triton serves DAS on the
same URL; there is no separate DAS env var any more). It follows Kit's
`examples/rpc-custom-api`: a `Proxy` over `createSolanaRpcApi` routes the DAS
method names to a plain `createJsonRpcApi` with its own transformers (named
params object in, `result` out, numbers left as numbers), everything else keeps
Kit's transformers.

```ts
const { rpc, dasAvailable, network } = useAppRpc();
const asset = await rpc
  .getAsset({ id, options: { showFungible: true } })
  .send();
```

`dasAvailable` is false on testnet and on devnet without a dedicated endpoint;
gate DAS queries on it. `network` namespaces cached asset data. To add a DAS
method, extend `DasApi` in `app-rpc.ts` and the param/result types in
`src/state/queries/types.ts`; don't declare methods nothing calls. Those types
follow the Metaplex reference implementation (what Triton runs), not Helius:
`searchAssets` `tokenType` values are PascalCase (`"Fungible"`, `"All"`),
`content`, `royalty`, `creators`, `authorities` and `token_info` are optional,
and `token_info.symbol` / `price_info` are provider extensions.

The kit client below is built on the same RPC, so `client.rpc` has the DAS
methods too.

### `useKitClient()` – the way to send transactions

`apps/tools/src/connector/use-kit-client.ts` builds a Kit plugin client with
the same plugins `solanaRpc()` bundles, but over the shared `getAppRpc(url)`:

```ts
pipe(
  createClient(),
  signer(walletSigner),                          // client.payer / client.identity
  (client) => extendClient(client, {             // Solana + DAS methods
    rpc: getAppRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
  }),
  rpcGetMinimumBalance(),
  rpcTransactionPlanner(transactionConfig),
  rpcTransactionPlanSigningExecutor(...),
  rpcTransactionPlanSendingExecutor(...),
);
```

`AppClient` is exported as an alias of the resulting type.

`client` is null until a wallet is connected and a cluster is known. It gives
you:

| Member                                  | What it does                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.payer`                          | The wallet signer. Pass it wherever an instruction wants a signer (`authority`, `payer`, `stakeAuthority`, …).                                                                                                                                |
| `client.rpc`, `client.rpcSubscriptions` | Kit RPC for reads inside the tool.                                                                                                                                                                                                            |
| `client.getMinimumBalance(spaceBytes)`  | Rent-exempt minimum as `Lamports` (bigint). Takes a `number`.                                                                                                                                                                                 |
| `client.sendTransaction(instructions)`  | Plan → blockhash → simulate for compute units → sign (wallet + any keypair signers in the instructions) → send → confirm. **Always exactly one transaction**; throws if the instructions don't fit. Resolves with `result.context.signature`. |
| `client.sendTransactions(plan)`         | Same, for an instruction plan that may span several transactions. Result is a tree; `flattenTransactionPlanResult(result)` gives the single results.                                                                                          |
| `client.planTransaction(instructions)`  | The planned message without signing/sending. Only needed for custom pipelines (see batch signing).                                                                                                                                            |

`transactionConfig` is the only option; it is the planner config (transaction
version, `estimateResourceLimits`, priority fee). **Do not set priority fees
per tool**; the decision so far is to let the client use its defaults.

### The standard tool shape

```tsx
const { client } = useKitClient();
const { setOpen } = useConnectorDialog();

if (!client) return <Button onClick={() => setOpen(true)}>Connect your wallet</Button>;

const submit = async () => {
  try {
    const result = await client.sendTransaction([
      getSomeInstruction({ authority: client.payer, ... }),
    ]);
    notify({ type: "success", title: "Transaction confirmed", txid: result.context.signature });
  } catch (error) {
    notify({ type: "error", title: "Transaction error", description: transactionErrorMessage(error) });
  }
};
```

`transactionErrorMessage` (`@/connector/transaction-error`) unwraps
`SolanaError.cause` so a program error reads as the program's message rather
than the generic "failed to send".

Instruction builders come from the `@solana-program/*` packages (`stake`,
`system` are installed; add `token`, `token-2022`, `associated-token`,
`memo`, `compute-budget` as needed, pinning versions that peer with Kit 8.5).
Account inputs accept an `Address` **or** a signer object; pass the signer
when the account must sign.

### New accounts

```ts
const stake = await generateKeyPairSigner();
getCreateAccountInstruction({ payer: client.payer, newAccount: stake, lamports, space, programAddress });
getInitializeInstruction({ stake: stake.address, ... });
```

Because the keypair signer is attached to the instruction, `sendTransaction`
signs with it automatically (wallet first, keypair second). No
`signWithWalletFirst` dance.

Keypair input: `parseJsonKeypair(file)` and `parseSecretKey(string)` in
`lib/solana/parse-keypair.ts` turn a CLI JSON array or a base58 secret key into
a `KeyPairSigner` (via `createKeyPairSignerFromBytes`). A `KeyPairSigner` also exposes `.keyPair`
(`CryptoKeyPair`) for `partiallySignTransaction`.

### Reads

- Prefer the program client's decoders over `jsonParsed`:
  `fetchStakeStateAccount(rpc, address)` (throws if missing / undecodable),
  `fetchMaybe…` (returns `{ exists: false }`), `decode…Account` for data you
  fetched yourself. The decoded shapes use `bigint` and `Address`; no zod
  needed.
- `getProgramAccounts` + `parseBase64RpcAccount(pubkey, account)` +
  `decodeXAccount(...)` is the pattern for scans
  (`use-user-stake-accounts.ts`). memcmp filters take `offset` as bigint and
  `encoding: "base58"`.
- Kit's RPC transport upcasts large integers to `bigint`. If you must keep a
  `jsonParsed` zod schema, coerce numeric fields.
- Shared queries take `useSolanaClient().client.rpc` internally and are
  `enabled` only when it exists, so pages render before the wallet connects.
- Narrow cluster types with `getClusterType(cluster)` from
  `@solana/connector/headless`. `chainIdToClusterType` expects genesis-hash
  chain ids (`solana:5eykt4…`), not cluster ids, and returns null for the
  configured clusters.

### Numbers and strings

- Lamports are `bigint` (`Lamports` brand). `lamportsToSol` /
  `lamportsToSolString` in `lib/solana/common.ts` accept bigint.
- Decimal SOL input: `solToLamports(sol("1.5"))` – exact, no float.
- `isAddress(str)` validates, `address(str)` brands. `Address` is a string, so
  `compress(address, 4)` and string compares against `useConnector().account`
  just work.
- There is no `microLamports()` helper in Kit 8.5; brand with
  `1n as MicroLamports` if you ever need one.

## Findings worth knowing

1. **One `sendTransaction` call is one transaction.** For independent
   instructions that may overflow (e.g. many withdrawals), use
   `client.sendTransactions(parallelInstructionPlan(instructions))`; the
   planner packs what fits and sends the rest as further transactions. For
   instructions that must land together, `nonDivisibleSequentialInstructionPlan`.
   Each extra transaction is an extra wallet prompt.

2. **Batch signing is not in the client.** Both `sendTransactions` and
   `signTransactions` sign one message per call, so a wallet gets N prompts.
   The wallet signer from `useKitTransactionSigner` (= `client.payer`) is a
   `TransactionModifyingSigner` whose `modifyAndSignTransactions([...])`
   forwards the whole array to the wallet's Wallet Standard `signTransaction`
   feature in one call – one prompt in Phantom/Solflare/Backpack. The recipe
   (plan each message with `client.planTransaction`, add a blockhash, estimate
   compute units with Kit's factories, `compileTransaction`, wallet signs the
   batch, keypairs sign after, `sendAndConfirmTransactionFactory`) lives in
   `solana-stake-tools/stake-create/stake-batch.ts`. Fall back to per-row
   `sendTransaction` on `SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED`.
   Reuse that file rather than re-deriving it.

3. **`disconnectWallet()` does not cancel a pending WalletConnect pairing.**
   While connecting there is no connected wallet, so the kit wallet plugin only
   flips its status. The dialog calls the wallet's `standard:disconnect`
   feature directly (`cancelWalletConnectPairing` in `connector-dialog.tsx`).
   WalletConnect registers as a Wallet Standard wallet named "WalletConnect";
   match on the name, not on an id.

4. **Legacy `StakeProgram.x()` helpers were multi-instruction.** `split` =
   `createAccount` (funded with rent or 0) + `split`; `createAccount` =
   `createAccount` + `initialize`; `authorize` with lockup = pass
   `lockupAuthority`. Check the web3.js source for the exact instruction
   sequence before porting a helper and keep the same order.

5. **Rent semantics decision:** for stake creation the user-entered amount is
   the _delegated_ amount and rent is funded on top
   (`client.getMinimumBalance(200)`). Keep that convention.

6. **Confirm dialogs:** the legacy code called `window.confirm` and ignored
   the answer. New code honours Cancel.

7. **react-hook-form + zod 4:** with a `resolver`, inline `register(...,
{ required })` rules are ignored. Toggles outside the form go in via
   `useForm({ context })` and a resolver that rebuilds the schema
   (`stake-acc-form.tsx`). In zod 4 a `.transform()` on `z.unknown()` still
   rejects a _missing_ key; add `.optional()` first. Use `error:` not
   `message:`.

8. **SOL balance:** `useSolBalance()` reads the connected wallet's balance
   through the app RPC and consumes TanStack's abort signal. After a
   transaction that moves SOL, invalidate with
   `queryClient.invalidateQueries({ queryKey: solBalanceKey(owner) })`; the
   two-argument form is the exact key for one cluster.

9. **Explorer links:** `useQueryContext().fmtUrlWithCluster` now reads
   `useCluster().type`; the old network store is dead.

10. **The connector's `getConnector(id)` returns the raw Wallet Standard
    wallet** at runtime despite the `WalletConnector` typing; access
    `features["standard:disconnect"]` etc. through a structural cast.

11. **`parseBase64RpcAccount` / `decode…` throw on garbage;** wrap per-account
    in a scan and skip, instead of failing the whole list.

## Checklist for migrating a tool

1. Replace `useWallet` / `useConnection` / `useWalletModal` with
   `useKitClient`, `useConnector` (for `account`), `useSolanaClient` (reads),
   `useConnectorDialog`.
2. Replace `PublicKey` with `Address` (`isAddress` / `address`), `Keypair`
   with `generateKeyPairSigner`, lamport `number`s with `bigint`.
3. Build instructions with `@solana-program/*`; drop `ComputeBudgetProgram`,
   blockhash fetching, `sendRawTransaction`, `confirmTransaction`,
   `retryWithBackoff`, `signWithWalletFirst`.
4. Send with `client.sendTransaction` (or `sendTransactions` + a plan), read
   `result.context.signature`, report errors via `transactionErrorMessage`.
5. Move reads to a shared `src/state/queries/use-*.ts` on `useSolanaClient`,
   decoded with the program client.
6. Delete the legacy helper once its last importer is gone (`lib/solana/stake.ts`
   went this way).
7. `pnpm exec tsc --noEmit -p apps/tools/tsconfig.json`, `pnpm exec eslint
<files>`, `pnpm exec vitest run` (one legacy test needs a local validator).

## Where the truth lives

Type declarations for the installed packages, which were more reliable than
docs for this work:

- `apps/tools/node_modules/@solana/connector/dist/react.d.ts` (hooks),
  `standard-shim-*.d.ts` (client, cluster, wallet types),
  `headless.d.ts` (cluster helpers, WalletConnect transport).
- `node_modules/.pnpm/node_modules/@solana/kit-plugin-rpc/dist/types/*.d.ts`
  (`solanaRpc`, planner config, executor config).
- `node_modules/.pnpm/node_modules/@solana/plugin-interfaces/dist/types/instruction-plans.d.ts`
  (`planTransaction` / `sendTransaction` signatures).
- `apps/tools/node_modules/@solana-program/<program>/dist/types/generated/`
  (instruction inputs, account decoders, program plugin).
- Kit docs: https://www.solanakit.com/docs/guides/sending-transactions,
  `/docs/advanced-guides/transactions`, `/docs/advanced-guides/instruction-plans`.
- ConnectorKit repo: https://github.com/solana-foundation/connectorkit
  (`packages/connector/README.md`, `examples/next-js/components/connector/`).
