# Testing the tools against a local surfnet

Status board for testing every tool in `apps/tools` on simulated chain state,
after the ConnectorKit + Kit migration (`CONNECTOR_KIT_MIGRATION.md`). One
entry per tool: tick the box when the tool has been through the process below,
keep the notes under it current (what was run, what passed, what is broken,
what could not be simulated). A ticked box means **tested**, not fixed; open
defects stay in the notes until a fix lands and the test is rerun.

Legend: `[x]` tested · `[ ]` not started or in progress (the notes say which).

## The process

### Chain: surfpool >= 1.6, forked from mainnet

[Surfpool](https://solana.com/docs/tools/surfpool) runs a local "surfnet" that
fetches mainnet accounts on demand, so vote accounts, mints, Metaplex and
Squads programs and lookup tables are all there, and nothing costs real SOL.

- **Version matters.** 1.0.0-rc1 (Agave 3.0.6) still runs the builtin stake
  program, and every stake instruction built by `@solana-program/stake` 0.11
  fails with "insufficient account keys": the client targets the BPF stake
  program mainnet runs now (owner `BPFLoaderUpgradeab1e…`), which reads
  sysvars by syscall. Surfpool 1.6.1 (Agave 4.2.1) runs the mainnet program
  bytes and matched mainnet in every cross-check, including the 1 SOL minimum
  delegation (SIMD-0490; `solana stake-minimum-delegation -u mainnet-beta`).
  Download from the solana-foundation/surfpool releases (`surfpool-darwin-arm64.tar.gz`).
- Start it headless, forked from the app's mainnet RPC (the one in
  `apps/tools/.env.local`), in a scratch directory since it writes `.surfpool/`:

  ```
  surfpool start --no-tui --no-studio --no-deploy -y --rpc-url <mainnet rpc>
  ```

  RPC on `http://127.0.0.1:8899`, websocket on `ws://127.0.0.1:8900`.
  `requestAirdrop` works for any address.
- Cheat codes (plain JSON-RPC): `surfnet_timeTravel` with one of
  `{absoluteEpoch | absoluteSlot | absoluteTimestamp}` (timestamp in ms; the
  clock only moves forward), `surfnet_setAccount [pubkey, {lamports, data,
  owner, executable, rentEpoch}]`, `surfnet_setTokenAccount`,
  `surfnet_resetAccount`, `surfnet_cloneProgramAccount`, `surfnet_pauseClock` /
  `surfnet_resumeClock`.
- Known limits: no DAS methods (`getAsset`, `searchAssets`), so tools that
  scan through DAS need the RPC path or seeded accounts;
  `getProgramAccounts` without a `memcmp` filter is forwarded to the remote
  and fails for big programs; the stake-history sysvar is empty, so stake
  activates "fully" after one epoch jump instead of warming up; no epoch
  rewards; a dropped request to the remote datasource stalls a transaction
  for 30 s (then "blockhash not found" or a JSON-RPC error kit can't parse).
  External services (Arweave/Turbo, Solace, Jupiter, the price route's
  upstreams) are not simulated; those paths are tested with fakes or by
  stopping at the signed transaction.

### App code, two layers

1. **Scripted, the primary layer.** A vitest file next to the tool imports the
   tool's own modules (instruction builders, mutations, batch senders, the
   shared queries) and runs them against the surfnet with a keypair wrapped
   as a wallet-style `TransactionModifyingSigner`, so the same signing paths
   run as with Phantom (one prompt per batch, keypair co-signers after the
   wallet). The kit client is assembled with the same plugins as
   `useKitClient`. Reads go through `getAppRpc(url)`, so the app's RPC
   transformers are exercised too. Skipped unless `SURFPOOL_URL` is set, so
   `pnpm exec vitest run` stays validator-free:

   ```
   cd apps/tools && SURFPOOL_URL=http://127.0.0.1:8899 pnpm exec vitest run surfpool
   ```

   Reference: `apps/tools/src/app/solana-stake-tools/stake-tools.surfpool.test.ts`
   (harness at the top: `walletLike`, `makeClient`, `raw` for cheat codes,
   `failureMessage`, which logs what the tool would toast next to the
   program's own error).
2. **Read-only UI pass.** `NEXT_PUBLIC_RPC_ENDPOINT=http://127.0.0.1:8899
   pnpm exec next dev -p 3100` makes the "Mainnet" cluster the surfnet. Load
   each page, feed it addresses seeded on the surfnet, check what it
   displays. Pages that list the connected wallet's accounts need a connected
   wallet; the real wallet in Chrome is never asked to sign during
   verification (port 3100 is also a new origin for it, so it won't
   auto-connect). The websocket URL is derived with
   `replace(/^https:\/\//, "wss://")`, which leaves an `http://` RPC as is, so
   transactions can't be confirmed from the UI against the surfnet anyway;
   reads work.

For each tool the notes should say: what was seeded, which code path ran
(module and function), what was asserted, the program error for every
refusal, what the UI showed, and what could not be simulated.

---

## Stake tools (`solana-stake-tools/`)

Test file: `stake-tools.surfpool.test.ts`, 25 tests, green on surfpool 1.6.1
on 2026-10-21. Findings cross-checked on mainnet where marked.

- [x] **Create stake account, single form** (`stake-create`, `stake-acc-form.tsx`)

  Tested through `buildStakeAccountInstructions` / `sendStakeRow` (the form's
  inline instruction list is the same sequence minus the custodian hand-off).
  Plain account: Initialized, owner as staker, withdrawer and custodian,
  lamports = amount + rent, lockup zero. Delegated: `delegation.stake` equals
  the entered amount exactly, rent funded on top, activation epoch = current.
  Delegation below 1 SOL refused by the program (stake error 12), which the
  form's 1 SOL validation already prevents. UI (read-only) not exercised.

- [x] **Create stake accounts from CSV** (`stake-create`, `stake-csv-form.tsx`, `stake-batch.ts`, `csv-rows.ts`)

  Full row (validator, both authorities, unlock date, custodian): authorities
  handed off, lockup timestamp set, custodian moved to the row's custodian;
  the withdrawer change under the fresh lockup works because the builder
  passes `lockupAuthority`. `sendStakeRowsInBatches` with a modifying signer:
  3 rows, one wallet prompt with 3 transactions, all confirmed.
  **Fixed 2026-10-21:** a row that fails simulation (bad validator address,
  "Incorrect program id") used to fail every row of its batch of 10 before
  the wallet prompt. Rows are now prepared one by one: the bad row is
  reported with its own error, the rest go to the wallet in one prompt (two
  transactions for a 3-row batch with one bad row, verified), and a batch
  with no compilable row prompts nothing. A wallet refusal still fails only
  the rows that were in the prompt. CSV parsing and validation are pure and
  not covered here.

- [x] **Authorize** (`stake-authorize`)

  Both authorities moved to another key in one transaction (the form's exact
  instruction list), verified on chain. Staker change under a lockup needs no
  custodian and works.
  **Fixed 2026-10-21:** the form now passes the wallet as `lockupAuthority`
  when it is the account's custodian, so the withdrawer of a locked-up
  account can be changed; without the custodian the program refuses with
  stake error 7 (CustodianMissing), which the toast now names. UI not
  exercised.

- [x] **Set lockup** (`set-lockup`)

  Withdrawer sets timestamp, epoch and custodian while no lockup is in force;
  once in force the withdrawer is refused ("missing required signature") and
  the custodian succeeds; `null` leaves a field untouched; the zero-address
  "Disable" custodian blocks further changes. UI: the page read a seeded
  locked-up surfnet account through the app's RPC and showed balance, voter,
  authorities, timestamp, "Enforced" badge and the current epoch correctly.

- [x] **Split, manual form** (`split-stake`, `split-manual-form.tsx`)

  **Was broken for delegated accounts, fixed 2026-10-21.** The form
  allocated the destination with 0 lamports and split the entered total
  into it. The BPF stake program refuses that for any active or activating
  source ("insufficient funds"): the destination must be pre-funded with its
  rent, split lamports map 1:1 to delegated stake, and both sides must keep
  >= 1 SOL (confirmed on mainnet by unsigned simulation on a real active
  GREED stake account; `process_split` in solana-program/stake). Both forms
  now go through `split-stake/split-plan.ts`: `splitInstructions` funds the
  destination's rent from the wallet and moves the entered amount,
  `splitAmountError` applies the program's rules before the wallet is asked
  (>= 1 SOL on each side for a delegated source, rent-exempt on both sides
  for an undelegated one), `parseSolInput` parses the decimal exactly. The
  entered amount is now the stake that moves, rent on top, like the create
  tool. Unit-tested in `split-plan.test.ts`; on the surfnet: 1.5 of 3 SOL,
  an undelegated 1 SOL, MEV excess staying behind, and each refused amount
  matching the program's refusal (stake error 12).

- [x] **Split, graphic form** (`split-stake`, `split-graphic-form.tsx`)

  **Math was off and nothing enforced the minimum, fixed 2026-10-21.** The
  slider worked on total lamports (stake + rent + any MEV excess) while the
  program splits delegated stake, so the default 50% on a 2 SOL account was
  refused with stake error 12. It now works on `splittableLamports`
  (delegated stake, or the balance above rent when undelegated), keeps the
  amount in lamports, shows `splitAmountError` under the slider and disables
  Submit on it, and remounts when another account is picked. Verified on
  the surfnet: half of a 2 SOL stake gives 1 SOL each. UI not exercised in
  the browser (needs a connected wallet).

- [x] **Merge** (`merge-stake`)

  Inactive + inactive (source closed, lamports summed), activating +
  activating same epoch same vote (stakes summed), inactive into activating
  in its activation epoch: all succeed. Different withdrawers: stake error 6
  (MergeMismatch). Deactivating into activating after an epoch jump: stake
  error 5 (MergeTransientStake). `getMergeableStakeAccounts` (UI filter)
  mirrors these rules but is not exported; not unit-tested. UI not
  exercised (needs a connected wallet).

- [x] **MEV rewards / withdraw excess** (`mev-rewards`)

  Excess simulated as a plain transfer into two delegated accounts;
  `lamports − stake − rentExemptReserve` matched; both withdrawals to a
  third wallet landed in one transaction via `parallelInstructionPlan`,
  recipient credited exactly, excess back to 0.
  **Fixed 2026-10-21:** the withdraw now passes the wallet as
  `lockupAuthority` when it is the custodian, so excess on a locked-up
  account is claimable; without it the program refuses with stake error 1
  (LockupInForce). Note for later: new accounts store the pseudo reserve 2,282,880 in `meta`
  regardless of the live rent, so if rent drops below that the tool
  under-reports by the difference (harmless dust today).

Cross-cutting, found here, affected every tool that uses
`client.sendTransaction`: `transactionErrorMessage` unwrapped one `cause`,
while a simulation failure is wrapped twice (failed-to-send → failed-to-
estimate → program error), so the toast showed kit's generic "failed when it
was simulated" text. **Fixed 2026-10-21:** it walks the chain to the
innermost `SolanaError` (`src/connector/transaction-error.test.ts`); the
surfnet tests assert the toast text is the program's error. Follow-up idea:
map custom stake codes to names with `getStakeErrorMessage`.

## SPL token tools (`spl-token-tools/`)

- [ ] **Create token** (`create-token`)

  Not started. Plan: seed nothing; run the mint + metadata builders
  (`src/lib/solana/metaplex-token-metadata.ts`) through `client.sendTransaction`
  for both token programs, assert mint decimals/authorities and the
  metadata PDA decode. Arweave JSON upload is not simulable; pass a fixed URI.

- [ ] **Close empty accounts** (`close-empty`)

  Not started. Plan: seed token accounts with `surfnet_setTokenAccount`
  (zero balance, one non-zero as a control), run the scan query and the
  close batch (`sendBatches`), assert rent returned and the control
  untouched. Check whether the scan uses DAS; if so, seed through the
  `getTokenAccountsByOwner` path instead.

- [ ] **Revoke delegations** (`revoke-delegations`)

  Not started. Plan: seeded token accounts with a delegate set, run the
  delegated-assets query and the revoke batch, assert `delegate` cleared.
  `use-delegated-assets.ts` reads asset data through DAS when
  `dasAvailable`; on the surfnet it must be run with DAS off (the
  `useAppRpc` flag is derived from the cluster type, so the scripted test
  calls the query function with a null DAS RPC, as `use-reclaimable-accounts.ts`
  already allows).

- [ ] **Recover nested accounts** (`recover-nested`)

  Not started. Plan: build an ATA owned by another ATA with
  `surfnet_setTokenAccount`, run the recover instruction, assert funds moved
  to the owner's ATA and the nested account closed.

- [ ] **Token hoover** (`token-hoover`)

  Not started. The tool takes a secondary wallet's private key and either
  transfers its tokens to the connected wallet or burns them. Plan: seed
  token accounts (Token and Token-2022) on a throwaway secondary keypair
  with `surfnet_setTokenAccount`, run both the transfer and the burn paths
  with the secondary key parsed through `parseSecretKey`, assert the
  connected wallet's ATAs and the burnt supply.

- [ ] **Reclaim rent** (`reclaim-rent`, `src/state/queries/use-reclaimable-accounts.ts`)

  Not started. Plan: seed Token and Token-2022 accounts (empty, with
  withheld fees, with excess lamports on a mint), run the scan, the plan,
  and the `sendBatches` flow with the fee instruction; assert fee recipient
  and wallet deltas. The scan keeps `jsonParsed`; surfnet serves it.

- [ ] **Distributor (Solace airdrops)** (`distributor`, `distributor/new`, `distributor/[airdropId]`)

  Not started. Plan: the on-chain part is sign-only (`distributor/transactions.ts`
  builds version-0 transactions the backend sends); assert the compiled
  transactions against the surfnet by simulating them unsigned; the Solace
  backend and sign-in challenge are faked.

## Reclaim SOL landing (`reclaim-sol/`)

- [ ] **Reclaim SOL** (no-options reclaim page)

  Not started. Same seed and assertions as reclaim-rent; verify it shares
  the scan and batch sender rather than duplicating them.

## NFT tools (`solana-nft-tools/`)

- [ ] **Mint (Token Metadata)** (`mint`)

  Not started. Plan: `createNftInstructions` (`createV1` + `mintV1`) with a
  fixed URI, assert metadata, master edition and token account; uploads not
  simulable.

- [ ] **Mint (Core)** (`mint-core`)

  Not started. Plan: generated `getCreateV1Instruction`, assert the asset
  account decodes (base fields only; plugin parsing is a known gap).

- [ ] **Update** (`update`)

  Not started. Plan: mint first, then `updateNftInstructions`; assert
  `isMutable`, creators' `verified` flags carried over, and the refusal when
  the wallet is not the update authority.

- [ ] **Collections, add and remove** (`collections`)

  Not started. Plan: seed a collection NFT and items with mixed authorities;
  assert `planAddToCollection` / `planRemoveFromCollection` skip reasons
  match what the program refuses, then the batches verify/unverify on chain.

- [ ] **Transfer authority** (`transfer-authority`, `src/lib/solana/squads-multisig.ts`)

  Not started. Plan: direct path (update authority transfer + creator
  verification) on seeded NFTs; Squads path against a real mainnet multisig
  fetched into the surfnet with the test key set as a member through
  `surfnet_setAccount`, run `batchProposalSteps` with `sendInOrder`, then
  `executeSteps`; assert the authority moved.

- [ ] **NFT faucet** (`nft-faucet`)

  Not started. Plan: mint each supported standard to the wallet; assert the
  assets exist.

## Permanent storage (`permanent-storage-tools/`)

- [ ] **File upload** (`file-upload`, `lib/turbo.ts`)

  Not started. Turbo uploads and the SOL top-up go to ArDrive, not
  simulable; test the compat-bridge signing with a fake Turbo client and
  the balance/price queries against recorded responses.

## Swaps

- [ ] **Gasless swap** (`gasless-swap`, `api/octane/build-jup-swap`, `packages/octane-core`)

  Not started. Plan: `packages/octane-core` tests already fake Jupiter and
  the RPC; add a surfnet case that takes a recorded Jupiter response, builds
  the fee-payer-signed transaction with a surfnet-funded fee payer, signs
  the user slot with the wallet-like signer and sends it. Lookup tables are
  fetched from mainnet by the surfnet.

- [ ] **Gasless BONK swap** (`gasless-bonk-swap`)

  Not started. Same as gasless swap with the BONK burn fee; assert the burn.

## Out of scope

- `gmeet-cc-capture`: a Google Meet captions bookmarklet, no chain state.
- `api/octane/price`: upstream price feed, covered by the octane-core fakes.
