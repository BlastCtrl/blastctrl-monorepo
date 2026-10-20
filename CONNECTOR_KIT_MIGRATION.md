# `apps/tools` on ConnectorKit + Solana Kit

How the tools app talks to Solana: `@solana/connector` (ConnectorKit) for the
wallet and cluster, `@solana/kit` and the `@solana-program/*` clients for
everything on chain. The app was migrated here from `@solana/wallet-adapter`
and `@solana/web3.js` in October 2026; this is what was learned on the way,
kept for whoever (human or agent) adds or changes a tool. Read it first.

Versions this was written against: `@solana/connector` 0.3.0,
`@solana/kit` 8.5.0 (with `@solana/fixed-points` 8.5.0),
`@solana/kit-plugin-rpc` / `kit-plugin-signer` 0.19.0,
`@solana-program/stake` 0.11.0, `@solana-program/system` 0.16.0,
`@solana-program/token` 0.18.0; Metaplex `umi` 1.6.0, `mpl-token-metadata`
3.4.0, `mpl-core` 1.10.0; `@sqds/multisig` 2.1.4.

## Where things live

Reference implementations, by area:

| Area                                                                                                                                                                                                                               | Files                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet UI (button, menu, connect dialog incl. WalletConnect)                                                                                                                                                                       | `apps/tools/src/connector/`                                                                                                                                                       |
| Kit client hook                                                                                                                                                                                                                    | `apps/tools/src/connector/use-kit-client.ts`                                                                                                                                      |
| Shared error helper                                                                                                                                                                                                                | `apps/tools/src/connector/transaction-error.ts`                                                                                                                                   |
| Stake tools (create UI + CSV, set-lockup, authorize, merge, split, MEV rewards)                                                                                                                                                    | `apps/tools/src/app/solana-stake-tools/**`                                                                                                                                        |
| SPL token tools: close-empty, revoke-delegations, recover-nested, token-hoover, distributor (Solace airdrops, incl. `packages/solace-sdk`), create-token                                                                           | `apps/tools/src/app/spl-token-tools/{close-empty,revoke-delegations,recover-nested,token-hoover,distributor,create-token}/**`                                                     |
| Permanent storage file upload (Turbo SDK via `@solana/connector/compat`)                                                                                                                                                           | `apps/tools/src/app/permanent-storage-tools/file-upload/**`, `lib/turbo.ts`                                                                                                       |
| DAS-extended RPC + token-account scans                                                                                                                                                                                             | `src/connector/app-rpc.ts`, `src/state/queries/{use-asset-data,use-owner-assets,use-delegated-assets,use-reclaimable-accounts,use-owner-nfts,use-jup-tokens}.ts`                  |
| Shared reads on Kit RPC                                                                                                                                                                                                            | `src/state/queries/use-stake-account.ts`, `use-user-stake-accounts.ts`, `use-epoch.ts`, `use-rent.ts`                                                                             |
| Metaplex via builder-only Umi (create-token is the reference)                                                                                                                                                                      | `src/lib/solana/metaplex-{umi,token-metadata}.ts`                                                                                                                                 |
| NFT tools: mint (Token Metadata `createV1` + `mintV1`), mint-core (Core `createV1`), update (`updateV1` after reading the metadata account); Arweave uploads of media and JSON                                                     | `src/app/solana-nft-tools/{mint,mint-core,update}/**`, `src/lib/solana/metaplex-{token-metadata,core,json-metadata}.ts`, `src/lib/hooks/use-arweave-uploader.tsx`                 |
| Reclaim-rent and reclaim-sol: token-account and mint scan on the kit RPC, close / withdraw-excess / fee instructions from the program clients, batches signed in one wallet prompt                                                 | `src/app/spl-token-tools/reclaim-rent/**`, `src/app/reclaim-sol/**`, `src/connector/send-batches.ts`, `src/state/queries/use-reclaimable-accounts.ts`                             |
| NFT collections: add (`updateV1` Set + `verifyCollectionV1`) and remove (`unverifyCollectionV1`) built in the browser, metadata read first so only what can work is sent, batches in one prompt                                    | `src/app/solana-nft-tools/collections/**`, `src/lib/solana/metaplex-token-metadata.ts` (`fetchTokenMetadatas`, the collection builders)                                           |
| Transfer-authority: metadata through the shared `useTokenMetadata` query, transfer and verify-creator through the Metaplex builders, batches packed by kit size, Squads proposals through the Squads module and the ordered sender | `src/app/solana-nft-tools/transfer-authority/**`, `src/lib/solana/squads-multisig.ts`, `src/connector/send-batches.ts` (`sendInOrder`), `src/state/queries/use-token-metadata.ts` |
| Octane backend (gasless swaps): `packages/octane-core` builds the fee-payer-signed swap on kit; the build route serves it base64-encoded                                                                                           | `packages/octane-core/src/**`, `apps/tools/src/app/api/octane/{build-jup-swap,price}/route.ts`                                                                                    |
| Gasless swap and gasless BONK swap: the backend's fee-payer-signed transaction decoded with kit, signed by the wallet through the kit signer, sent and confirmed with kit's factory                                                | `src/app/{gasless-swap,gasless-bonk-swap}/**`, `src/lib/octane.ts`, `src/lib/hooks/use-gasless-swap.ts`, `src/state/queries/use-token-balance.ts`                                 |
| Shared helpers: unsigned simulation, compute headroom, Token-2022 parsing, mint/SOL-balance/token-account queries                                                                                                                  | `src/connector/{simulate,resource-limits}.ts`, `src/lib/solana/token-2022.ts`, `src/state/queries/{use-mint,use-sol-balance,use-token-account-existence}.ts`                      |
| Explorer links by connector cluster                                                                                                                                                                                                | `src/state/use-query-context.ts`                                                                                                                                                  |

## What is left of web3.js

`lib/solana/squads-multisig.ts` imports it on purpose, because the Squads
SDK is built on it (see its section); nothing else does, and `grep -rl
"@solana/web3.js" apps/tools/src` is the live list. The
`@solana/wallet-adapter-*` packages, `@solana/spl-token`, `bs58`, `bn.js`
and `bignumber.js` are gone from `apps/tools/package.json`; the adapter
provider, its network store, the old wallet menus and the web3 batch sender
are deleted. `@solana-program/token-2022` is deliberately not installed (it
peers on `@solana/zk-sdk`); `lib/solana/token-2022.ts` holds what the app
needs from that program.

Peer declarations the workspace knowingly overrides are listed with their
source in `pnpm-workspace.yaml` (`peerDependencyRules.allowedVersions`): all
come from the x402 tree under `@ardrive/turbo-sdk` or the connector's mobile
wallet adapter, and `pnpm peers check` should stay clean. The workspace's
`minimumReleaseAge` holds back releases younger than two days, so a range
may resolve to one version behind the latest.

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
`solana:signAllTransactions` feature that standard wallets don't expose. The
one exception is raw message signing: `useTransactionSigner().signer.signMessage`
is the wallet's `solana:signMessage`, which the distributor's sign-in challenge
is verified with. `useSignOffchainMessage()` is a different thing (the v1
off-chain message envelope, few wallets support it) and would not verify.

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
follow the Metaplex reference implementation (what Triton runs), not Helius,
with one exception: `searchAssets` `tokenType` is spelled the way the RPC in
use wants it, camelCase (`"fungible"`, `"nonFungible"`); the PascalCase of the
reference enum is rejected with "unknown variant". `content`, `royalty`,
`creators`, `authorities` and `token_info` are optional, and
`token_info.symbol` / `price_info` are provider extensions.

The kit client below is built on the same RPC, so `client.rpc` has the DAS
methods too.

### Signing without sending

When a backend submits the transactions (the distributor), or several must be
signed in one wallet prompt (CSV stake creation), the client's executor is
bypassed: `client.planTransaction(instructions)`, then
`setTransactionMessageLifetimeUsingBlockhash`, then
`estimateAndSetResourceLimitsWithBuffer(client.rpc)` from
`src/connector/resource-limits.ts`, then `compileTransaction`, then
`client.payer.modifyAndSignTransactions([...])` (fall back to one call per
transaction on `SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED`), then
`getBase64EncodedWireTransaction`. `distributor/transactions.ts` is the compact
reference, `stake-create/stake-batch.ts` the one with keypair co-signers.

If the receiving side requires a transaction version, pin it instead of relying
on the planner's default: `useKitClient({ transactionConfig: { version: 0 } })`
with the config as a module constant (the hook memoizes on it), and check
`message.version` before compiling. The Solace backend requires version 0.

### Several independent transactions: `sendBatches`

`src/connector/send-batches.ts` sends one transaction per batch with a single
wallet prompt and reports each batch on its own (`onStage`, `onBatchResult`);
the reclaim tools and their test-accounts panel use it. `kitBatchSender(client)`
is the chain side: `planTransaction`, one shared blockhash,
`estimateAndSetResourceLimitsWithBuffer`, `compileTransaction`,
`client.payer.modifyAndSignTransactions([...])` for the prompt, then
`sendAndConfirmTransactionFactory` per batch. The connector's kit signer
(`@solana/wallet-account-signer`) hands the whole array to the wallet's
`solana:signTransaction` feature in one call; a signer that throws
`SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED` instead (as
`@solana/react`'s does) is asked per batch, with a fresh blockhash each time.
A batch whose simulation fails is reported failed before the prompt and the
rest still go out. A wallet that hands back fewer signed transactions than it
was given (some stop at the first) gets the rest one at a time, counted on
from what went out. A refusal throws `WalletRefusedError(sent, of)`;
`isWalletRefusal` recognises code 4001, the connector's `USER_REJECTED` and
the usual messages, through the cause chain. Anything else thrown means
nothing was sent. The sender is an interface, so `send-batches.test.ts`
drives the whole flow with a fake one.

`sendInOrder(steps, sender, onProgress)` in the same file is for transactions
that depend on each other, like the steps of a Squads proposal: one wallet
prompt for all of them, then each is sent and confirmed before the next, and
the first failure stops the rest. Such steps can't be simulated for a compute
budget, since a step's accounts don't exist until the one before it lands, so
the sender is made with `kitBatchSender(client, { computeUnitLimit })`, which
sets the given limit instead of simulating; `runtimeDefaultComputeUnits` is
what the runtime would give a transaction with no limit of its own, and the
transfer-authority tool asks for 400,000 when it executes a Squads batch.

### Metaplex programs through Umi

`src/lib/solana/metaplex-umi.ts` is the only module that imports Umi. It holds
a builder-only Umi singleton (placeholder RPC URL, no identity, Token Metadata
and Core plugins) and maps what Umi builds to kit: `toKitInstructions(builder)`
turns `{ programId, keys, data }` into `{ programAddress, accounts, data }`,
and `toUmiSigner(address)` is a no-op Umi signer that only marks the account
as a signer. The wallet needs nothing more, since the fee payer signs for its
own address; an account that must be signed by a keypair gets its kit signer
through the optional second argument, so `client.sendTransaction` signs with
it. Program-specific builders live next to it: `metaplex-token-metadata.ts` (fungible
metadata create/update; `createNftInstructions` = `createV1` + `mintV1` with
the mint keypair attached; `updateNftInstructions`; and
`fetchTokenMetadata(rpc, mint)`, which reads the metadata PDA with kit's
`fetchEncodedAccount` and decodes it with the program's serializer, with
`fetchTokenMetadatas(rpc, mints)` doing a hundred per request; and the
collection pair `addToCollectionInstructions` / `removeFromCollectionInstructions`)
and `metaplex-core.ts` (`createCoreAssetInstructions`). The create-token and
NFT mint tools are the references. Unsigned simulation of such instructions is
`simulateUnsigned(client, instructions)` from `src/connector/simulate.ts`.
`TokenMetadata` also carries `isMutable` and `tokenStandard`, which the
transfer-authority tool checks before touching an NFT, and
`verifyCreatorInstructions` is that tool's second step. Nothing builds a Umi
with a wallet identity anymore.

Things to know about the builder-only Umi:

- Its identity and payer are Umi's null signer, whose public key is all
  zeroes, and the generated builders fall back to them silently (`authority`,
  `payer`, `updateAuthority`, `tokenOwner`, …). Pass every such account
  explicitly; the unit tests pin the account lists.
- The program null-pads metadata strings on chain, but Umi's utf8 decoder
  strips the nulls, so decoded names and URIs need no trimming.
- Token Metadata accepts `verified: true` only on a creator that signs (the
  wallet's own entry) and refuses to unverify another creator's existing
  verified entry, so the update tool carries existing `verified` flags over.
- `toUmiBasisPoints` / `fromUmiOption` in `metaplex-umi.ts` convert royalties
  and `Option`s at the boundary, so callers never import Umi.

Arweave uploads (media files first, then the Metaplex JSON) go through
`useArweaveUploader()` (`lib/hooks/use-arweave-uploader.tsx`: Turbo over the
connector compat bridge, one client per wallet created on first upload, one
toast per file, null until a wallet is connected) and
`uploadNftMetadata(input, upload)` (`lib/solana/metaplex-json-metadata.ts`,
pure and unit-tested). create-token uses the same uploader with its own JSON;
only file-upload still holds a `TurboStorage` directly, for its balance and
price queries. The SDK is bundled only into the routes that import these.

### Squads through its web3 SDK

`src/lib/solana/squads-multisig.ts` is the only module that imports
`@sqds/multisig`, which is built on web3.js, and the same pattern as the Umi
module: the SDK is used for what it knows (PDAs, account decoders, instruction
builders, the Squads message format), and everything crosses the boundary as
kit types. Reads go through the kit RPC (`fetchEncodedAccount(s)`) and the
SDK's `Account.deserialize(Buffer.from(data))`; web3 instructions are mapped to
kit's `{ programAddress, accounts, data }`, and the instructions a vault will
run are mapped the other way into the web3 `TransactionMessage` that
`batchAddTransaction` wants. `batchProposalSteps` gives the steps of one batch
proposal (create draft, add each transaction, activate, approve) as kit
instruction lists; the member is a plain signer account, which the kit client
signs as fee payer. Executing is the one call that still needs a web3
`Connection`, since the SDK reads the stored transaction through it to list the
accounts execution touches: `executeSteps(rpcUrl, …)` makes one from the
connector's RPC URL for that call only.

### Server side: the Octane backend

`packages/octane-core` (the gasless-swap builder) is on kit too, and is the
reference for kit on the server. `createSolanaRpc(url)` is the RPC; the fee
payer is `createKeyPairSignerFromBytes(getBase58Encoder().encode(secret))`,
made once at module load (a top-level `await`, which Next's node runtime
allows); the user is `createNoopSigner(address)`, since the program clients
want a signer object for any account that signs and the user signs later in
their wallet. The message is version 0, compressed with
`compressTransactionMessageUsingAddressLookupTables` after the tables are
read with `fetchJsonParsedAccounts` (the node decodes them; `data.addresses`
is the list), the fee comes from `rpc.getFeeForMessage` on the compiled
message bytes, and `partiallySignTransactionMessageWithSigners` signs with
the keypair and leaves the user's slot empty. The route hands the result out
as `getBase64EncodedWireTransaction(transaction)`; the wire format is what
web3's `VersionedTransaction.deserialize` reads, so the legacy frontend only
switched from base58 to base64. Jupiter's instructions arrive as JSON and map
to kit's `{ programAddress, accounts, data }` the same way Umi's and web3's do.
The package's tests fake `fetch` and the RPC, so they need no validator.

### A transaction built elsewhere

The gasless swap gets a transaction the backend built and partially signed.
`src/lib/octane.ts` decodes it with `getTransactionDecoder` from the base64
wire string and puts the lifetime the route sends alongside back on it; the
wallet signs it through `client.payer.modifyAndSignTransactions([tx])`, which
keeps the fee payer's signature and the lifetime when the wallet leaves the
message alone; `assertIsSendableTransaction` and
`assertIsTransactionWithBlockhashLifetime` then let
`sendAndConfirmTransactionFactory` take it. `use-gasless-swap.ts` is the
reference. Sign only, never sign-and-send: Phantom blocks sign-and-send for a
transaction that already carries another signature.

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
`system`, `token` are installed; add `memo`, `compute-budget` etc. as needed,
pinning versions that peer with Kit 8.5). `@solana-program/token-2022` is
deliberately not installed (it peers on `@solana/zk-sdk`): the `token` client's
builders take the Token-2022 program address via `programAddress`, and
`lib/solana/token-2022.ts` holds that address plus the mint-extension parser.
Metaplex programs go through Umi as described above.
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
- `useMintAccount(mint)` (`src/state/queries/use-mint.ts`) gives a mint's
  decimals, owning program and Token-2022 extension ids
  (`lib/solana/token-2022.ts` parses the TLV list without
  `@solana-program/token-2022`). Use the program for ATA derivation and
  transfers so Token-2022 mints work; `useTokenAccountExistence` takes it too.
  The distributor sends it to the backend as `tokenProgram` at creation and
  reads it back from the airdrop for start and retry, and refuses mints with
  the transfer-fee or transfer-hook extension before anything is signed.
- `@solana-program/token` 0.18 has `getWithdrawExcessLamportsInstruction`
  (Token-2022 and p-token both use index 38), so the hand-built instruction
  is gone. `decodeMint` reads 82 bytes from anything, so tell mints from
  token accounts first with `isMintAccountData` in `lib/solana/token-2022.ts`
  (82 bytes, or the mint account type after the token-account padding).
- `getTokenAccountsByOwner` with `encoding: "jsonParsed"` is typed
  (`TokenAccountInfoWithJsonData`); `lamports` and `space` arrive as
  `bigint`, and `extensions` as `unknown[]`. The reclaim scan keeps
  `jsonParsed` because the Token-2022 extension state it needs (withheld
  fees, confidential transfers) is painful to parse by hand.
- Narrow cluster types with `getClusterType(cluster)` from
  `@solana/connector/headless`. `chainIdToClusterType` expects genesis-hash
  chain ids (`solana:5eykt4…`), not cluster ids, and returns null for the
  configured clusters.

### Numbers and strings

- Lamports are `bigint` (`Lamports` brand; `lamports(n)` brands and checks
  the range, so take the absolute value of a signed amount first).
- Lamports to SOL: kit's `lamportsToSol(lamports)` returns a `Sol`, a
  fixed-point object from `@solana/fixed-points`, not a number. Convert
  with `decimalFixedPointToNumber` where arithmetic follows and
  `decimalFixedPointToString` (trailing zeros dropped) for display, or
  format with `lamportsToSolString(value, maxFractionDigits)` from
  `lib/solana/common.ts`, the one app helper left, which takes a `number`
  or `bigint` and keeps a sign. Other fixed-point amounts work the same
  way: Turbo credits are `rawDecimalFixedPoint("unsigned", 64, 12)`.
- Decimal SOL input: `solToLamports(sol("1.5"))` – exact, no float; `sol`
  throws on more than nine decimals unless given a rounding mode.
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
   `src/connector/send-batches.ts` (`sendBatches` for independent
   transactions, `sendInOrder` for dependent ones), with the fallbacks for a
   wallet that can't sign a batch or signs fewer than asked.
   `solana-stake-tools/stake-create/stake-batch.ts` is the variant with
   keypair co-signers. Reuse those rather than re-deriving them.

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

9. **Explorer links:** `useQueryContext().fmtUrlWithCluster` reads
   `useCluster().type`.

10. **The connector's `getConnector(id)` returns the raw Wallet Standard
    wallet** at runtime despite the `WalletConnector` typing; access
    `features["standard:disconnect"]` etc. through a structural cast.

11. **`parseBase64RpcAccount` / `decode…` throw on garbage;** wrap per-account
    in a scan and skip, instead of failing the whole list.

12. **`useTransactionSigner().capabilities.supportsBatchSigning` is always
    false.** The connector sets it from `features["solana:signAllTransactions"]`,
    a feature name that is not in the Wallet Standard (`solana:signTransaction`
    takes any number of inputs instead), and its own `signAllTransactions`
    then prompts once per transaction. It says nothing about the kit signer,
    which is the one-prompt path, so don't gate batch signing on it:
    `sendBatches` asks for the batch and falls back on what comes back.

13. **Read before you prompt.** The collection tool fetches every NFT's
    metadata first (`fetchTokenMetadatas`) and sorts them into what can go
    (`planAddToCollection` / `planRemoveFromCollection`) and what is skipped
    with a reason, so a wrong authority or a verified link elsewhere never
    costs a wallet prompt or fails a whole batch. The old API route let the
    program reject the batch instead.

14. **Dependent transactions get an explicit compute budget.** The kit
    client's planner leaves a provisory compute-limit instruction in every
    message for the simulation to overwrite. A message that can't be
    simulated (its predecessor hasn't landed) must not go out with that
    placeholder, which is the 1.4M maximum: a wallet that adds a priority
    fee would charge for all of it. `setTransactionMessageComputeUnitLimit`
    replaces it in place; see `sendInOrder`.

## Checklist for a new tool

1. Wallet and cluster come from `useKitClient`, `useConnector` (for
   `account`), `useAppRpc` or `useSolanaClient` (reads) and
   `useConnectorDialog`; never from the connector's byte-oriented signer.
2. Addresses are `Address` (`isAddress` / `address`), keypairs come from
   `generateKeyPairSigner`, lamports are `bigint`.
3. Instructions come from `@solana-program/*`, Metaplex ones from the Umi
   builders, Squads ones from the Squads module. No hand-built compute budget,
   blockhash fetching, raw sends or confirmation loops.
4. Send with `client.sendTransaction` (or `sendTransactions` + a plan) for
   one transaction, `sendBatches` / `sendInOrder` for several; read
   `result.context.signature`, report errors via `transactionErrorMessage`.
5. Reads live in a shared `src/state/queries/use-*.ts`, keyed by `network`,
   decoded with the program client. Read before you prompt: plan on the
   accounts first so a doomed transaction never reaches the wallet.
6. Pin what matters in a unit test: account lists and roles, instruction
   data, packet size with a wallet-added priority fee, the plan's skips.
7. `pnpm exec tsc --noEmit -p apps/tools/tsconfig.json`, `pnpm exec eslint
<files>`, `pnpm exec vitest run` (no validator needed),
   `pnpm -F @blastctrl/octane-core test` when the backend changed, and
   `pnpm exec next build` before calling a page done: prerendering has rules
   `next dev` doesn't enforce, like `useSearchParams` under a Suspense
   boundary.

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
- `apps/tools/node_modules/@solana/fixed-points/dist/types/` (the `Sol`
  shape and its conversions) and `@solana/rpc-types/dist/types/sol.d.ts`.
- `apps/tools/node_modules/@solana/connector/dist/chunk-*.mjs` when a
  capability flag looks wrong; that is where `supportsBatchSigning` was
  traced to a non-standard feature name.
- Kit docs: https://www.solanakit.com/docs/guides/sending-transactions,
  `/docs/advanced-guides/transactions`, `/docs/advanced-guides/instruction-plans`.
- ConnectorKit repo: https://github.com/solana-foundation/connectorkit
  (`packages/connector/README.md`, `examples/next-js/components/connector/`).
