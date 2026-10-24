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
  `surfnet_resumeClock`. `surfnet_setTokenAccount [owner, mint, {amount,
  state?: "frozen", delegate?, delegatedAmount?}, programId?]` creates or
  overwrites the ATA of (owner, mint) with 165-byte rent whatever its size
  (unknown fields are silently ignored); `surfnet_setAccount [pubkey,
  {lamports, data, owner, executable, rentEpoch}]` with the token codecs
  writes any account shape. A stalled cheat code answers a bare "Internal
  error" after 30 s; `withStallRetry` covers it.
- Known limits: no DAS methods (`getAsset`, `searchAssets`), so tools that
  scan through DAS need the RPC path or seeded accounts;
  `getProgramAccounts` without a `memcmp` filter is forwarded to the remote
  and fails for big programs; the stake-history sysvar is empty, so stake
  activates "fully" after one epoch jump instead of warming up; no epoch
  rewards; now and then a remote fetch hangs for 30 s and fails ("error
  sending request"; about one or two per 30 transactions on the app's
  Triton endpoint, more on the public RPC), which costs the transaction in
  flight its blockhash or returns a JSON-RPC error kit can't parse. The
  surfnet test files use `SURFNET_TEST_CONFIG` (long timeouts and
  `retry: 2`, safe because each test builds fresh state), `fundedWallet`
  warms the datasource first, and `withStallRetry` wraps fixtures.
  External services (Arweave/Turbo, Solace, Jupiter, the price route's
  upstreams) are not simulated; those paths are tested with fakes or by
  stopping at the signed transaction.

### App code, two layers

1. **Scripted, the primary layer.** A throwaway vitest file next to the tool
   imports the tool's own modules (instruction builders, mutations, batch
   senders, the shared queries) and runs them against the surfnet with a
   keypair wrapped as a wallet-style `TransactionModifyingSigner`, so the
   same signing paths run as with Phantom (one prompt per batch, keypair
   co-signers after the wallet). The kit client is assembled with the same
   plugins as `useKitClient` (`createClient` → `signer(wallet)` →
   `extendClient` with `getAppRpc(url)` and subscriptions on port 8900 →
   `rpcGetMinimumBalance`, `rpcTransactionPlanner`, the signing and sending
   executors), so the app's RPC transformers are exercised too. Logic that
   lives inside a component's handler is pulled into a plain function in the
   same file so the test can call it; the function stays, un-exported, when
   the test goes.

   **These files are not kept in the repository.** They were written, run
   and deleted once the findings were recorded here (2026-10-21); the notes
   under each tool are the record. Writing the next one: skip the suite
   unless `SURFPOOL_URL` is set, so `pnpm exec vitest run` stays
   validator-free; give every test a 90 s timeout and a retry of 2; run one
   file at a time (`--no-file-parallelism`), because vitest's default file
   parallelism, or several agents sharing one surfnet, saturates the
   datasource, after which every remote fetch waits 30 s and single RPC
   calls take up to a minute. Before the first transaction, ask the surfnet
   for an unknown account and retry it: the first remote fetch after a
   minute of idleness hangs 30 s and fails, and otherwise lands on whatever
   is under test. A stalled surfnet surfaces as "Blockhash not found", kit's
   "Cannot destructure property 'err'" or a bare "Internal error"; fixtures
   retry on those. For refusals, log what the tool would toast
   (`transactionErrorMessage`) next to the innermost cause's message, so
   the notes can quote both.
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

Scripted run: 27 tests, green on surfpool 1.6.1 on 2026-10-21 (file since
removed, see the process). Findings cross-checked on mainnet where marked.

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

- [x] **Create token** (`create-token`)

  Scripted run: 8 tests, green on surfpool 1.6.1 on 2026-10-21 (file since
  removed). Despite the name, the tool adds or rewrites Token Metadata on an
  existing mint. Seeded with real instructions (System `createAccount` +
  `initializeMint2`, Token `setAuthority`), two airdropped wallets W and S:
  fresh Token mints (decimals 6) with W as mint authority; a Token-2022 mint
  (82 bytes, no extensions) with W as mint authority; a Token mint with S as
  mint authority; a mint whose mint authority was set to None; Token mints
  of W's and of S's given metadata by the tool's own
  `createMetadataInstructions`; USDC (mainnet; its update authority is not
  W); as side fixtures, `createV1` Fungible metadata on the Token-2022 mint
  (default creators) and on a Token mint with 250 bps, one unverified
  creator and an unverified collection key. The Arweave upload is replaced
  by a fixed URI string. Code path: the page's submit handler, i.e. the
  pre-flight `simulateUnsigned(client, await build(owner, mint, {}))`
  (`connector/simulate.ts`), then `createMetadataInstructions` /
  `updateMetadataInstructions` (`lib/solana/metaplex-token-metadata.ts`:
  `createMetadataAccountV3` with isMutable true, `updateMetadataAccountV2`
  with isMutable true and primarySaleHappened true) through
  `client.sendTransaction`. The page's toast logic is mirrored in the test.
  - **Pre-flight:** passes (err null) for Add on a Token mint (33,827–48,827
    CU) and for Update on W's metadata (24,253 CU), and writes nothing; the
    2026-10-21 compute-limit fix holds. `dataV2({})` sends empty name,
    symbol and URI, 0 bps and no creators, collection or uses; the program
    accepts empty strings, so only the form's `required` blocks them. It
    fails (err values with the bigints converted; the page never shows
    them, see Open) for: Add on another wallet's mint or a mint with no mint
    authority, `{"InstructionError":[1,{"Custom":10}]}`; Add on a mint that
    already has metadata, own or USDC, `[1,{"Custom":199}]`; Add on a
    Token-2022 mint, `[1,{"Custom":153}]`; Update by a non-authority, own or
    USDC, `[1,{"Custom":7}]`; Update on a mint without metadata,
    `[1,{"Custom":63}]` "Data type mismatch"; Update on immutable metadata,
    `[1,{"Custom":59}]`; Update on metadata with a verified creator,
    `[1,{"Custom":94}]`.
  - **Add on a Token mint**, one prompt: the metadata decodes with the given
    name, symbol and URI; 0 bps; creators None; isMutable true;
    primarySaleHappened false; update authority W; tokenStandard Fungible
    (decimals 6); no collection or collectionDetails. 607 bytes holding
    15,115,600 lamports: rent-exempt minimum 5,115,600 plus Metaplex's 0.01
    SOL create fee kept on the account. Wallet change exactly that plus the
    5,000-lamport fee. Boundary accepted: 32-byte name, 10-byte symbol.
  - **Update on the tool's own metadata**, one prompt, 5,000-lamport fee:
    name, symbol and URI changed; update authority, 0 bps and tokenStandard
    kept; primarySaleHappened went from false to true; isMutable stays true.
  - **Refusals on the send path**, all at the estimator's simulation, no
    prompt, nothing written; toast is kit's bare custom error with
    "(instruction #2)" (compute budget is #1): Add on another wallet's mint
    or a revoked mint authority, #10 "Mint authority provided does not match
    the authority on the mint" (no metadata can be added once the mint
    authority is gone); Add on a mint with metadata, #199 "Expected account
    to be uninitialized"; Add on a Token-2022 mint, #153 InstructionNotSupported
    ("Instruction not supported for ProgrammableNonFungible assets" in the
    log); Update by W of S's metadata or USDC, #7 "Update Authority given
    does not match"; Update on a mint without metadata, #63 "Data type
    mismatch"; name of 33 bytes or 32 "é" (64 bytes), #11; symbol of 10
    "é" (20 bytes), #12; Update after `isMutable: false`, #59 "Data is
    immutable"; Update of metadata with a verified creator, #94 "Verified
    creators cannot be removed."

  **Fixed 2026-10-22, pre-flight toast:** kit's simulation result carries
  the instruction index and custom code as bigints, so the page's
  `JSON.stringify(simulation.err)` threw "Do not know how to serialize a
  BigInt" and every pre-flight refusal toasted that. The page now shows
  `simulationFailureMessage` (`connector/simulate.ts`): the program's last
  log line ("Mint authority provided does not match the authority on the
  mint", verified on the surfnet), or the error with its bigints as numbers
  when nothing was logged. **Fixed 2026-10-22, Token-2022:** Add was
  refused for every Token-2022 mint (#153, `createMetadataAccountV3`).
  `createMetadataInstructions` now builds `createV1` with the Fungible
  standard, no creators (the generated default would have been the
  authority, verified) and the mint's own token program, which the page
  reads from the mint account first (and refuses a non-mint address);
  verified on the surfnet for a Token and a Token-2022 mint, tokenStandard
  Fungible, creators None. **Mitigated 2026-10-22, Update overwrites data:**
  `updateMetadataInstructions` writes the whole Data struct from `dataV2`:
  creators None, 0 bps, collection None, uses None. Metadata with a
  verified creator (which `createV1` and Metaplex's fungible helpers set by
  default) can't be updated (#94); on metadata with royalties or unverified
  creators the update wiped them silently (measured: 250 bps, one
  unverified creator and an unverified collection key became 0 / None /
  None). The page now reads the current metadata after the pre-flight and,
  when it has creators, royalties or a collection, opens a dialog naming
  them ("This update resets other fields … Cancel / Update anyway") before
  uploading anything. Merging the fields instead is the eventual fix; the
  user judged the wiped fields rare on fungible tokens. **Fixed 2026-10-22:** the
  update hard-coded isMutable true and primarySaleHappened true, so
  primarySaleHappened flipped false → true after one update; both are now
  passed as None and left as they are (unit-tested on the instruction data). **Fixed 2026-10-22, validation:** name and
  symbol used `maxLength` 32/10 (UTF-16 units); they now validate by byte
  through the shared `maxBytes` rule (`lib/solana/metaplex-form-rules.ts`,
  also used by the mint and update pages). **Fixed 2026-10-22, copy:** the
  authority line now depends on the action (mint authority for Add, update
  authority for Update). **Open, errors:** send-path refusals toast as
  "Custom program error: #NN (instruction #2)"; update failures are titled
  "Error Creating Metadata". UI not exercised.

- [x] **Close empty accounts** (`close-empty`)

  Scripted run, 5 tests, 2026-10-21 (file since removed).
  Seeded: four Token ATAs and one Token-2022 ATA made with the page's own
  dev-button instruction, plus three through `surfnet_setTokenAccount` (one
  empty, one frozen, one with a balance). The scan
  (`fetchOwnerTokenAccounts`, extracted from `useOwnerAssets` so it can run
  outside React; DAS prefetch stays in the hook and is off on the surfnet)
  returned all eight with program, balance and frozen flag. The simulate
  step's per-account `simulateUnsigned` kept the seven empty ones and
  dropped the funded one (token error 11); the sign step closed them in two
  transactions of four and three, rent back to the owner minus fees;
  refusals the toast shows: 11 (NonNativeHasBalance), 4 (OwnerMismatch).
  **Fixed 2026-10-21:** `simulateUnsigned` compiled the planner's message
  with its provisory compute limit of 0, so every unsigned simulation
  failed with `ComputationalBudgetExceeded` and the wizard reported
  "Simulation failed for all accounts" (create-token's simulation had the
  same bug). It now sets the 1.4M maximum first.
  **Open, copy only:** the page says frozen accounts can't be closed and
  won't be displayed; the token program closes an empty frozen account
  without complaint, and the list filters on balance alone, so they are
  shown and closed. The page and sign step quote 0.0020342 SOL per account;
  a token account's rent is 0.00203928 SOL. UI not exercised.

- [x] **Revoke delegations** (`revoke-delegations`)

  Scripted run (2026-10-21, 6 tests; file since removed). Seeded per test with real instructions: Token
  accounts of a new mint (balance, 400k delegated), JUP (0 held, 25
  delegated, approve above balance), a frozen delegated account of a new
  mint, WEN undelegated as control; Token-2022 accounts of a new mint
  without extensions (delegated) and PYUSD (extensions, > 165 bytes,
  delegated), a second new mint undelegated as control; JTO through
  `surfnet_setTokenAccount` (it takes `delegate` and `delegatedAmount`;
  `delegated_amount` is silently ignored). The scan
  (`fetchDelegatedTokenAccounts`, extracted from `useDelegatedAssets`; DAS
  prefetch stays in the hook and is off on the surfnet) returned exactly
  the six delegated accounts with mint, balance, frozen flag, program,
  delegate and delegated amount. The revoke (`revokeInstructions` +
  `sendRevokeInstructions`, extracted from the list's button handler: one
  `Revoke` per account on its own program, `parallelInstructionPlan`)
  cleared `delegate` and `delegatedAmount` on all five non-frozen accounts
  in one transaction and one prompt, balances and controls untouched;
  revoking an account with no delegate succeeds (no-op, a fee). 40
  accounts: 3 transactions, 3 wallet prompts (the executor signs each
  transaction on its own). Refusals the toast shows: 17 (AccountFrozen),
  4 (OwnerMismatch, someone else's account), "Invalid account data" (an
  account closed since the scan).
  **Open:** the list neither shows nor disables frozen accounts, so
  "select all" with one among them fails the whole transaction at
  simulation (#17, nothing revoked, no prompt), and the toast doesn't say
  which row. With more accounts than fit in one transaction, the other
  transactions land (40 with one frozen: 30 revoked) but the tool shows
  only the error: no success toast, no refetch, selection kept. The
  "(instruction #n)" in the toast counts within the failing transaction,
  not the row. Without DAS (testnet, devnet without its endpoint) amounts
  are formatted with 9 decimals and names/images are blank
  (`TokenAmountCell` falls back to 9; `useMintAccount` could supply
  decimals). UI not exercised.

- [x] **Recover nested accounts** (`recover-nested`)

  Scripted run: 9 tests, green on surfpool 1.6.1 on 2026-10-21, rerun green
  after the scan fix (file since removed). Seeded with instructions on fresh mints
  (three Token, one Token-2022 without extensions, wallet as authority): the
  wallet's ATAs A (250k), B (500k, control) and C (Token-2022); nested
  ATA(A, mintA) with 1M (same-mint, the classic case), an empty ATA(A, mintE)
  with no wallet ATA for mintE, a plain keypair token account owned by A, a
  Token-2022 ATA(C, mintC) with 700k and a Token-2022 ATA(A, mintC) with
  400k; through `surfnet_setTokenAccount` a PYUSD ATA nested under C and a
  frozen JTO ATA nested under A. The automatic scan
  (`fetchTokenAccountsByOwner` → `filterAssociatedTokenAccounts` →
  `findNestedAta`) asks both token programs and lists the three nested
  ATAs under a parent of their own program as recoverable, the keypair
  account and the Token-2022 ATA under a Token parent as unrecoverable. The list's recover
  (`recoverNestedInstructions` via `client.sendTransaction`) moves the
  tokens into the wallet's ATA (the parent itself for same-mint nesting),
  closes the nested account, sends its rent to the wallet (delta exact to
  the fee), creates a missing destination ATA from that rent, leaves the
  control untouched, one prompt each; a Token-2022 nested ATA recovers the
  same way. Manual tab: the form's checks and preview, extracted as
  `loadRecoverPreview` / `previewSolChange` in `manual-input.tsx`, refuse a
  non-token account, missing accounts, a non-ATA parent, a nested account
  of another parent and a non-associated nested account with their own
  messages; the previewed SOL change is exact for Token. Program refusals,
  all at simulation (no prompt): another wallet's pair and a Token-2022
  account nested in a Token ATA, InvalidSeeds ("Provided seeds do not
  result in a valid address"); a frozen nested account, token error 17
  (AccountFrozen).
  **Fixed 2026-10-21:** the automatic scan queried the Token program only,
  so Token-2022 nested accounts were never found; `fetchTokenAccountsByOwner`
  now asks both programs, and `findNestedAta` flags a cross-program nesting
  as unrecoverable (the instruction derives both ATAs with one program, so
  it fails with InvalidSeeds). **Open, estimate:** the
  manual preview quotes 165-byte rent for a destination ATA it must create;
  a Token-2022 ATA costs more (PYUSD: 2,192,400 vs 2,039,280 quoted).
  **Open, UX:** the manual pre-flight doesn't check that the parent belongs
  to the connected wallet, and accepts a Token-2022 account nested in a
  Token ATA (which the program can't recover) and a frozen nested account;
  each reaches the wallet step and fails with the program's raw error. UI
  not exercised.

- [x] **Token hoover** (`token-hoover`)

  Scripted run (2026-10-21, 13 tests, green on a serial run, rerun green
  after the transfer fix; file since removed). Seeded:
  a throwaway secondary wallet, never funded, its secret key read by
  `parseSecretKey` from base58 or a JSON array; balances of two mints the
  test creates (Token and Token-2022, by `mintTo`) plus JUP, PYUSD, an empty
  WEN and a frozen JTO account through `surfnet_setTokenAccount`; a PYUSD
  ATA made by the ATA program (with its account extensions) with the amount
  patched by `surfnet_setAccount`. Code paths: `fetchOwnerTokenAccounts` (the
  page lists `balance > 0`, so empty accounts are not shown or closed;
  frozen ones are), `tokenInstructions` and `sendTokenActions` (extracted
  from `token-list.tsx`'s submit handler) through `client.sendTransactions`.
  Transfer: receiver's ATAs created idempotently, amounts moved exactly,
  sources closed, receiver's SOL change = closed rent − new ATA rent − fee,
  the secondary wallet needs no SOL; one prompt per transaction, wallet as
  fee payer and the secondary key as second signer. Burn: supply down by the
  balance, accounts closed, rent to the wallet, no ATA created; mixed
  burn + transfer in one selection works. Refusals the toast shows:
  17 (AccountFrozen) for transfer or burn of a frozen account, which also
  fails every token packed into the same transaction, before the prompt;
  11 (NonNativeHasBalance) when the secondary key is the connected wallet
  (transfer to itself, then close); kit's "Multiple distinct signers" for
  burn in that case.
  **Fixed 2026-10-21 (was confirmed on the surfnet with a PYUSD ATA built
  by the ATA program):** transfer used the plain `Transfer`, so Token-2022
  accounts with TransferFeeAmount / TransferHookAccount (real PYUSD ATAs)
  were refused with MintRequiredForTransfer; cheat-code PYUSD (no account
  extensions) transferred, which hid it. `tokenInstructions` now builds a
  `TransferChecked` with the mint and its decimals, read from the mint
  accounts in one `getMultipleAccounts` before planning; the realistic
  PYUSD account transfers whole (PYUSD's fee is zero, its hook unset). A
  mint with an active transfer hook (`getTransferHookProgram` in
  `lib/solana/token-2022.ts`) is refused before the wallet is asked with a
  message naming the hook program and suggesting burn: the hook's extra
  accounts are not resolved. No hooked mint was on hand to exercise that
  path. **Open, UX:** frozen accounts are selectable and sink
  their transaction; an overflow costs a prompt per transaction, and a
  failure in one shows only the error toast without refreshing the list
  while the others may have landed. **Open, display:** without DAS
  (devnet without its endpoint, testnet, surfnet UI pass) amounts are
  formatted with 9 decimals and names/images are blank; on mainnet each row
  fires its own `getAsset` (the prefetch only covers empty mints). UI not
  exercised.

- [x] **Reclaim rent** (`reclaim-rent`, `src/state/queries/use-reclaimable-accounts.ts`)

  Scripted run: 11 tests, 2026-10-21 (file since removed).
  Seeded: per token program (no extensions) a mint and an overfunded ATA
  with tokens made with the programs' own instructions; the rest written
  with `surfnet_setAccount` and the token codecs (a stalled cheat code
  answers "Internal error", retried locally): per program an overfunded
  mint the wallet controls, an overfunded ATA with tokens (Token-2022 at
  170 bytes, ImmutableOwner), an empty account, a control with tokens at
  exactly rent, an empty overfunded one, a frozen empty overfunded one and
  one whose close authority is someone else; plus wrapped SOL, an empty ATA
  of a stranger's mint and a mint without authority. Code paths: the scan
  (`fetchReclaimableAccounts`, extracted from the hook's queryFn; DAS off,
  names fall back to the shortened mint), `lookupMint`, the page's
  selection and totals (`tickedAfterScan`, `reclaimTotals`, extracted from
  `reclaim-rent.tsx`), the dialog's `toBatches` (exported), and the send
  (`sendReclaimBatches`, extracted from `useReclaimExcess`:
  `buildReclaimInstructions` + `sendBatches` + `kitBatchSender`). Asserted:
  13 accounts in batches of 10 and 3, close for the empty ones and
  withdraw-excess for the rest, one wallet prompt for both transactions,
  excess withdrawn exactly from token accounts and mints of both programs,
  closed accounts' rent and excess back, control and wrapped SOL untouched,
  wallet net = displayed net = callback tally (5000 per transaction). Fee
  on (env stubbed, modules reloaded): one transfer per batch to the
  recipient, a share of the excess only, recipient paid exactly. A batch
  whose account changed after the scan fails before the prompt (token error
  11) and the other still goes out; a wallet refusal sends nothing
  (`WalletRefusedError` 0 of 2). Refusals (forged rows, the scan never
  offers them): someone else's token account or mint, 4 (OwnerMismatch).
  **Open, behaviour:** empty frozen accounts are kept open ("Frozen, so it
  stays open") and only give up their excess, though both token programs
  close them (simulated, no error), so their rent deposit is left behind.
  **Open, cosmetic:** the results block takes the fee on the whole
  selection, the batches round down each, so it shows up to a lamport per
  extra batch more fee than is charged (739,444 vs 739,443 at 3.33%).
  **Deploy note:** a fee recipient that doesn't exist yet makes every batch
  whose fee is below the rent-exempt minimum fail ("insufficient funds for
  rent"); the recipient must be funded. Not simulable: withheld transfer
  fees and confidential-transfer extensions, DAS names, excess from the
  rent reduction (surfnet rent is still 6960 lamports/byte). UI not exercised.

- [ ] **Distributor (Solace airdrops)** (`distributor`, `distributor/new`, `distributor/[airdropId]`)

  By hand on mainnet against the deployed Solace backend (2026-10-23, the
  user), in progress. **Found and fixed:** "Start Airdrop" on a SOL airdrop
  failed before the wallet prompt with "Unexpected transaction plan.
  Expected single plan, got sequential plan." A SOL batch is 20 transfers
  (`BATCH_SIZE`), and kit's planner caps a transaction at 16 instructions
  by default (headroom for inner instructions under the format's limit of
  64), so it split the batch in two and `planTransaction` refused the
  result; size was fine (20 transfers measure about 1,190 bytes).
  `signBatches` now plans each batch with `maxInstructionsPerTransaction`
  set to the batch's instruction count plus the compute-budget ones. Token
  batches (4 recipients) and the other `planTransaction` callers were under
  the cap. **Found and fixed:** the backend then rejected the start with
  `FST_AIRDROP_START_VALIDATION_ERROR`, "instructions length not equal to
  expected (actual length: 21, expected: 22)": it expects a compute unit
  price instruction too, which the pre-migration page sent (10,000
  micro-lamports) and the planner config had dropped. `TRANSACTION_CONFIG`
  now sets `microLamportsPerComputeUnit` to 10,000, and a planned SOL batch
  checks out as 22 instructions, version 0, opening with the compute limit
  and then the price (the old page sent price first; the backend's check
  is on the count).

## Reclaim SOL landing (`reclaim-sol/`)

- [x] **Reclaim SOL** (no-options reclaim page)

  Covered by the reclaim-rent run (2026-10-22, by reading the code): the
  page is another interface over the same modules, with no chain logic of
  its own. `one-click-reclaim.tsx` scans with `useReclaimableAccounts`
  (the same `fetchReclaimableAccounts`), keeps every unblocked account that
  returns lamports with close-empty on (`reclaimLamports(a, true) > 0`,
  the same rule as reclaim-rent's default selection minus the switch),
  chunks by the same `ACCOUNTS_PER_TRANSACTION`, and sends through
  `useReclaimExcess` with the same `SERVICE_FEE`, `FEE_PER_TRANSACTION`
  and fee/rent helpers from `reclaim-rent/_components`. What reclaim-rent's
  findings say applies here unchanged: frozen empty accounts are kept
  open, the displayed fee can be a lamport per extra batch high, and the
  fee recipient must be funded. Its own concerns are animation and copy
  (see the memory notes on the landing page), not transactions. UI not
  exercised against the surfnet.

## NFT tools (`solana-nft-tools/`)

- [x] **Mint (Token Metadata)** (`mint`)

  Scripted run: 17 tests, green on surfpool 1.6.1 on 2026-10-21 (file since
  removed). Seeded nothing beyond airdropped wallets: each test mints with
  the tool's own instructions, and a fixed URI string stands in for the
  Arweave upload, which is not simulated. Code path: the page's submit
  handler after the upload, i.e. `createNftInstructions`
  (`lib/solana/metaplex-token-metadata.ts`: createV1 + mintV1, NonFungible)
  through `client.sendTransaction`, with a fresh mint keypair and creators
  built as the page builds them (verified only for the wallet's own entry).
  - **Plain NFT** (default creators, 500 bps, isMutable, maxSupply 0), one
    prompt: metadata decodes with the name, symbol, URI and fee; the wallet
    is update authority and sole creator, verified, share 100;
    primarySaleHappened false, tokenStandard NonFungible, no collection or
    collectionDetails. Master edition has supply 0 and maxSupply 0 (25 when
    asked). Mint has supply 1 and 0 decimals; mint and freeze authority are
    the master edition PDA; the wallet's ATA holds 1. Wallet SOL change is
    exactly rent + fee: 19,656,560 lamports (metadata 15,115,600 = 607-byte
    rent 5,115,600 plus Metaplex's 0.01 SOL create fee kept on the account;
    edition 1,030,080; mint 1,461,600; ATA 2,039,280; fee 10,000 for two
    signatures, no priority fee). 137,377 CU.
  - **Creators and flags:** wallet 60 / two others 20/20: wallet verified,
    the others unverified; a list without the wallet is all unverified.
    isCollection: collectionDetails is set as **V2 with 8 zero bytes of
    padding** (the kit client's `resolveCollectionDetails`), not V1
    `{size: 0}`. isMutable false is stored. Boundary values accepted:
    32-byte name, 10-byte symbol, 200-byte URI, 10000 bps.
  - **Refusals**, all at simulation with no prompt and no metadata left
    behind; the toast is kit's bare custom error with "(instruction #2)",
    because the planner's compute-budget instruction is #1: shares 50+40,
    "Share total must equal 100 for creator array" (#45; the page pre-checks
    the total); empty creator list, "Creators must be at least one if set"
    (#37); duplicate creator address, "No duplicate creator addresses"
    (#60); name of 33 bytes, or 32 "é" (64 bytes), "Name too long" (#11);
    symbol of 11 bytes, "Symbol too long" (#12); URI of 201 bytes, "URI too
    long" (#13); 10001 bps, "Basis points cannot be more than 10000" (#41);
    same mint keypair twice, "Expected account to be uninitialized" (#199),
    first NFT untouched; wallet with 0.005 SOL, System program 0x1
    "Transfer: insufficient lamports 4990000, need 15115600", shown as
    `Custom program error: #1 (instruction #2)`.

  **Open, errors:** every Token Metadata refusal toasts as "Custom program
  error: #NN (instruction #2)" with no name. The kit client's
  `getMplTokenMetadataErrorMessage` returns "Error message not available in
  production bundles." under NODE_ENV production, so it can't fill that gap
  as generated. Too little SOL reads as "#1", which looks like Token
  Metadata's InstructionPackError. **Fixed 2026-10-21, validation:** the form's
  maxLength 32/10/200 counted UTF-16 code units while the program counts
  bytes (a 32-character "é" name passed and failed with #11); the three
  fields now validate by byte length. Duplicate creator addresses (#60) are
  refused by the creator field. An emptied creator list is left out instead
  of sent as `[]` (#37). **Fixed 2026-10-21, collection flags:** "Is a
  collection NFT" without "Is a sized collection" minted a plain NFT (the
  page passed `isCollection && collectionIsSized`), and with both on the
  stored collectionDetails was V2 (zero padding), not a sized V1. The
  "sized" switch and URL parameter are gone; one switch sets
  `isCollection`, its text says the program keeps no member count, and the
  hub's "Create a collection" link passes only `isCollection`. **Open,
  cost:** the page shows no cost; a mint costs about 0.0197 SOL, 0.01 of
  which is Metaplex's create fee. UI not exercised.

- [x] **Mint (Core)** (`mint-core`)

  Scripted run: 9 tests, green on surfpool 1.6.1 on 2026-10-21 (file since
  removed). Seeded: fresh airdropped wallets only; the Arweave upload is
  replaced by a fixed URI string. Code path: the page's submit handler after
  the upload, `getCreateV1Instruction({ asset, payer: client.payer, name,
  uri })` from `@blastctrl/mpl-core` through `client.sendTransaction`, then
  decoded with `fetchAssetV1`. The transaction is a CU-limit instruction
  plus Core Create, no priority fee; fee 10,000 lamports (wallet + asset
  signatures), one prompt. The asset decodes as key AssetV1, owner =
  wallet, updateAuthority `Address(wallet)` (the program's default), the
  given name and uri, seq None. 147 bytes for a 15-char name and 57-char
  URI; rent-exempt minimum 1,914,000; the account holds 3,414,000 because
  Core's 1,500,000-lamport create fee stays on the asset on top of its
  rent; the wallet's SOL change is exactly that plus the fee. Core has no
  length limits: a 200-char name with a 500-char URI is accepted (775
  bytes, 6,284,880 rent + 1,500,000). An empty name, an empty URI and both
  empty are all accepted (132 / 84 / 75 bytes). Base fields still decode
  with trailing plugin data ignored, on a local asset created with an
  Attributes plugin (190 bytes vs 147) and on a mainnet asset with plugins
  fetched through the surfnet ("ANT MINER #167", 447 bytes, updateAuthority
  Collection); plugins are not parsed. Refusals, all at simulation with no
  prompt: same asset keypair twice, the system program's "already in use"
  (custom 0), toast "Custom program error: #0 (instruction #2)"; wallet
  with 0.001 SOL, "Transfer: insufficient lamports 990000, need 3337440"
  (custom 1), toast "Custom program error: #1 (instruction #2)"; asset not
  signing (account role patched; the types don't allow it), "Missing
  required signature for instruction (instruction #2)"; `dataState:
  LedgerState`, Core 23 NotAvailable "Minting compressed is currently not
  available", toast "Custom program error: #23 (instruction #2)".

  **Open, cost display:** the page shows no cost. A mint costs rent plus
  Core's 0.0015 SOL create fee, about 0.0034 SOL for a typical asset, plus
  the network fee. **Fixed 2026-10-21, form:** Token Metadata's length
  limits (name 32, URI 200), which Core doesn't have, are gone, and so is
  the symbol field (Core assets have none; it only went into the uploaded
  JSON, and was ignored in "Already have a JSON file" mode). **Open,
  validation:** in "Already have a JSON file" mode the URI is not required
  and not checked as a URL, so an empty URI mints an asset with no metadata
  (the program accepts it). **Open, errors:** the toast shows bare numbers. Core
  errors are not decoded by name (`getMplCoreErrorMessage` is the same
  production stub), system-program failures inside Core's CPI ("already in
  use", "insufficient lamports") show only as #0 / #1, and "(instruction
  #2)" counts the compute-budget instruction. UI not exercised.

- [x] **Update** (`update`)

  Scripted run: 14 tests, green on surfpool 1.6.1 on 2026-10-21 (file since
  removed). Seeded with the lib's own `createNftInstructions` (createV1 +
  mintV1), no cheat codes, two funded wallets W (the user) and S: W's NFTs
  A (default creators, W verified), B (W 60 verified / S 20 / X 20), C
  (`isMutable: false`), D, E, fresh per test; S's J; a plain SPL mint with
  no metadata; a 6-decimal mint with `createMetadataInstructions`
  (createMetadataAccountV3, token standard Fungible). Code path: the submit
  handler (`page.tsx`) reproduced line for line in the test for a given set
  of react-hook-form dirty fields (pre-check on `fetchTokenMetadata`,
  creators keeping stored `verified` and granting it to the wallet,
  `isDataDirty`), then `updateNftInstructions` (`updateV1`,
  `lib/solana/metaplex-token-metadata.ts`) through `client.sendTransaction`.
  - **Data update on A** (name of 32 bytes, symbol, URI, 750 bps, stored
    creators carried over): every field stored, creators unchanged with W
    verified, isMutable and primarySaleHappened untouched, one prompt. Cost
    is the 5,000-lamport fee only: `updateV1` charges no Metaplex fee and
    does not resize (metadata stays 607 bytes / 15,115,600 lamports with
    1, 3 or 4 creators).
  - **Creators on B, as the handler builds them:** new shares 34/33/33,
    W stays verified, S and X unverified; S dropped and a new Y added, Y
    unverified; a fourth creator fits, fee only. S sent as verified:
    refused, 54 (CannotVerifyAnotherCreator). Shares totalling 90: 45 (the
    page pre-checks this). A list without W is **accepted**: W, the
    signer, removes its own verified entry and the NFT is left with no
    verified creator.
  - **Partial updates with `data` omitted:** `isMutable: false` on D is
    stored, then a name change is refused with 59 (DataIsImmutable);
    `primarySaleHappened: true` on E is stored, setting it back to false is
    refused with 42; `newUpdateAuthority: S` on D moves the authority (W
    stays the verified creator), W's next submit stops at the page's
    "Invalid update authority" toast with no prompt, forced it is 158
    (InvalidAuthorityType), and S can then update.
  - **Immutable C:** data update 59; without data, `isMutable: false`
    again (no-op, fee), `primarySaleHappened: true` and
    `newUpdateAuthority` are all accepted; `isMutable: true` is 73.
  - **Pre-checks:** S's J by W, "Invalid update authority"; a mint without
    metadata, "No metadata found"; no transaction either way. Forced: J
    gives 158 for a data and for a flag-only update, the bare mint 57
    (IncorrectOwner).
  - **Fungible metadata:** `updateV1` renames it and sets
    primarySaleHappened, accepted.
  - Toasts are kit's bare "Custom program error: #NN (instruction #2)"
    (compute budget is #1); every refusal fails at simulation, no prompt.

  **Fixed 2026-10-22, form state:** "Load current values" made every
  non-default field dirty (`setValue` plus per-index `update()` on the
  creators array made react-hook-form 7.89 recompute dirtiness against the
  defaults), so after loading the handler always sent `data`, and on
  immutable metadata every submit failed with 59, even a pure authority
  transfer. Loading now `reset`s the form to the NFT's values (they become
  the defaults, so only later edits are dirty) and `replace`s the creator
  rows, so rows from an earlier NFT no longer linger. The handler builds its
  instruction through `planUpdate` (`update/update-plan.ts`, unit-tested):
  a field is sent only when touched and different from the chain, an
  emptied text field means "leave as is", `data` goes as a whole only when
  one of its fields changes, an emptied creator list is written as no
  creators, and nothing at all to send is an info toast. `updateRefusal`
  stops a data write on immutable metadata, re-enabling mutability and
  turning "primary sale happened" off before the wallet is asked, with a
  sentence instead of #59 / #73 / #42. **Fixed 2026-10-22, validation:**
  name, symbol and URI validate by byte (`maxBytes`), duplicate creator
  addresses are refused, the royalty error says 0 to 10000, and the
  creators text says that removing every row clears the list and that only
  the wallet's own entry stays verified. **Left as is (user's call):**
  `setFormValues` runs only from the switch's `onChange`, so picking an NFT
  with the switch already on loads nothing until it is turned off and on.
  **Open, errors:** every refusal the program still sees toasts as a bare
  number. UI not exercised; the NFT
  selector needs DAS.

- [x] **Collections, add and remove** (`collections`)

  Scripted run: 5 tests, green on surfpool 1.6.1 on 2026-10-21 (file since
  removed). Seeded with the tool's own `createNftInstructions` (createV1 +
  mintV1, two NFTs per transaction), no cheat codes, two funded wallets W
  (the user) and S (a stranger): W's collection NFTs COL1 and COL2
  (`isCollection: true`) and S's COLS; W's plain NFTs I1..I8 plus N0, which
  never gets a collection; I9 verified into COL1 and I10 into COL2 through
  `addToCollectionInstructions`; S's J1 (plain) and J2 (verified into
  COLS); a plain SPL mint with no metadata, and a random address. Code
  paths: `fetchTokenMetadatas`, `planAddToCollection` /
  `planRemoveFromCollection` / `collectionsOf` as the handlers call them,
  and the `send` body of `useCollectionBatches` (pulled into
  `sendCollectionBatches` in the same file, which runs `sendBatches` with
  `kitBatchSender` over the app's client).
  - **Add plan:** keeps I1..I8 and COL1 itself; skips I9 "already in the
    collection", I10 "in another collection, …; remove it from there
    first", J1 "its update authority is …", the plain mint and the missing
    address as "no metadata account"; throws "The collection's update
    authority is …, not the connected wallet" for COLS and "The collection
    mint has no metadata account" for a mint without metadata. Skipped
    items forced past the plan, each refused at simulation before any
    prompt: I9, Token Metadata 74 CollectionCannotBeVerifiedInThisInstruction
    from `updateV1`, stays verified in COL1; I10, also 74, `update` can't
    replace a verified collection, stays in COL2 (the plan's "remove it
    from there first" is right); J1, 158 InvalidAuthorityType.
  - **Batch add of I1..I8:** one prompt asking for 2 transactions
    (`prompts` = `[2]`), batches of 6 and 2, stages waiting → signing →
    confirming → confirmed, both with a signature; each NFT reads
    `collection = {COL1, verified: true}`; SOL change exactly the fees,
    10,000 lamports.
  - **Remove plan** over I1..I9, N0, J1, J2: keeps I1..I9; skips N0 and J1
    "not in a verified collection", J2 "the collection's update authority
    is …" (forcing J2: error 7, "Update Authority given does not match").
    Batch remove of 9 items at 12 per transaction: one prompt `[1]`,
    confirmed; each NFT then reads `{key: COL1, verified: false}`, so
    `unverifyCollectionV1` keeps the key as the page text says; SOL change
    the 5,000-lamport fee.
  - **Failure inside a run:** re-add I1..I8 with J1 forced in at position
    7 (batches [I1..I6] and [J1, I7, I8]): the second batch fails in
    `prepare` (its simulation) before the prompt with `Custom program
    error: #158 (instruction #2)`; the first still goes out in one prompt
    and confirms; `confirmedItems` = 6, so the toast reads "Some
    transactions failed / 6 of 9 NFTs were added"; I7 and I8 stay
    unverified because their whole transaction was dropped.
  - Toasts and the batch list show kit's bare message for every Token
    Metadata refusal, `Custom program error: #NN (instruction #K)`, K
    counting from 1 with the compute-unit-limit instruction first.

  **Fixed 2026-10-21, plan:** `planAddToCollection` didn't skip the
  collection NFT itself, and the program accepts it (COL1 became a verified
  member of itself); it now skips it with "it is the collection itself"
  (unit-tested). **Fixed 2026-10-21, doc:** `createV1` with `isCollection:
  true` creates `CollectionDetails::V2`, which has no size; COL1, COL2 and
  COLS stayed V2 through 8 adds and 9 removes, so no member count is kept;
  `createNftInstructions`' `isCollection` doc now says so. **Open, toast:**
  the toast and the batch row show "Custom program error: #74 / #158 / #7
  (instruction #K)" with no name and no NFT; `getMplTokenMetadataErrorMessage`
  would give the names but is a production stub. **Open, partial failure:**
  one refused NFT fails the good NFTs packed into its transaction; the row
  says only "Transaction 2 · 3 NFTs" plus the bare error, so the user can't
  tell which mint was refused. Only reachable when an item's state changes
  between plan and send. UI not exercised.

- [x] **Transfer authority** (`transfer-authority`, `src/lib/solana/squads-multisig.ts`)

  Scripted run, direct path: 5 tests, green on surfpool 1.6.1 on 2026-10-22
  (file since removed). Squads path not exercised (feasible: the generated
  client has `multisigCreateV2`, so a fresh single-member multisig could be
  made on the surfnet; the real-multisig flow with other members approving
  is not simulable). Seeded with the lib's `createNftInstructions` (createV1
  + mintV1, one NFT per transaction), no cheat codes, four funded wallets:
  W (the current authority), N (the new authority), C (the new creator) and
  S (another creator), plus X, an unsigned address. NFTs fresh per test:
  W's plain NFTs (W verified, 100) and B (W 60 verified / S 20 / X 20); D
  (W 50 verified / S 50, then S verified itself with
  `verifyCreatorInstructions`); E (`isMutable: false`) and F, handed to N
  with `updateNftInstructions`; a 6-decimal mint with
  `createMetadataInstructions` (Fungible), and a bare mint; S's J. Code
  path: `fetchTokenMetadatas`, then `planTransfer` / `planVerify`
  (`_components/plan.ts`), then `transferBatches` / `verifyBatches` /
  `transferInstruction` / `transactionSize` (`_components/transactions.ts`),
  then `sendBatches` with `kitBatchSender(client)`
  (`connector/send-batches.ts`) and `build: batch => batch.instructions`,
  which is what `SendPanel.send` does.
  - **Modes, plan vs chain:** keep on A1: ready with `creators: null`, the
    `updateV1` data decodes as `data: None`, `newUpdateAuthority: Some(N)`.
    Swap on A2 and B with C as the new creator: A2 → [C 100 unverified];
    B → [C 60 unverified, S 20, X 20]. Replace on A3 with N: [N 100
    unverified]. After each run `updateAuthority = N` and exactly the
    planned creators, other creators' flags unchanged; name, symbol, URI,
    royalty, isMutable, primarySaleHappened, token standard and collection
    unchanged. One prompt (`[1]`) per run, exactly the fee (5,000 lamports
    per transaction). Planned again by W, all four read "done".
  - **Step 2:** C's `planVerify` on three swapped NFTs: all ready; on a
    plain W NFT "Your wallet isn't one of its creators", and N gets the
    same on a swapped NFT. `verifyBatches` signed by C's client: one
    transaction (3 NFTs, 407 B), prompts `[1]`, C paid 5,000 lamports, W
    not prompted; only C's flag flipped. `planVerify` then says "done".
  - **Plan skips** (identical in all three modes except D): D with replace,
    "Other verified creator (S) must unverify first"; forced, 55
    (CannotUnverifyAnotherCreator), so the plan agrees with the program. D
    with swap and keep: ready and accepted (swap writes [C 50 unverified,
    S 50 verified]; keep leaves both verified). E: "Immutable". F: "done".
    Fungible: "Fungible token, not an NFT". Bare mint: "No Token Metadata
    account". J: "Update authority is S"; forced, keep and swap both 158
    (InvalidAuthorityType). E forced with keep (no data): **accepted**, the
    authority moves and isMutable stays false; with swap data, 59
    (DataIsImmutable). Transfer to yourself: the plan says "done" (the
    step's input also refuses it with "That's the current update
    authority"); forced, the program accepts it as a no-op for the fee.
  - **Packing:** 12 plain NFTs with swap: `packBatches` gives 6
    transactions of 2 NFTs, 710 B each (a third would pass 900 B);
    `transactionSize` equals the compiled size. A swap/replace update is
    about 219 B per NFT, so with data the 10-per-transaction cap never
    applies; list order kept. One prompt for all 6 (`[6]`), each batch
    signing → confirming → confirmed, 30,000 lamports, all 12 NFTs N's
    with [C 100 unverified].
  - **Failure inside a run:** 8 plain NFTs with replace plus D forced in
    at position 2: batches [P1, D], 3 × 2, [P8]. Batch 0 fails in
    `prepare` with `Custom program error: #55 (instruction #3)`; the other
    4 go out in one prompt (`[4]`) and confirm (20,000 lamports). P1 stays
    W's because its transaction was dropped. `sendBatches` doesn't throw,
    so no toast; the panel row reads "Transaction 1 · 2 NFTs" plus the
    bare error and the summary "4 of 5 transactions confirmed. The NFTs
    were read again, so sending now only retries the ones that didn't go
    through." Planned again, only P1 is ready.
  - Every refusal toasts as kit's bare `Custom program error: #NN
    (instruction #K)`, K from 1 with the compute-unit-limit instruction
    first; all at simulation, before the wallet is asked.

  **Open, plan:** `planTransfer` skips immutable NFTs with "Immutable" in
  every mode, but the program accepts an authority-only `updateV1` (keep,
  no data) on immutable metadata; the tool refuses a transfer it could make
  in keep mode. **Open, partial failure:** one refused NFT also drops the
  good NFT packed with it; the row doesn't name the mint and the error is a
  bare number; only reachable when an NFT's state changes between check and
  send. **Open, errors:** 55, 59 and 158 show as bare numbers. UI not
  exercised against the surfnet.

  **Squads path, by hand on mainnet (2026-10-22, the user, 2-of-2
  multisig):** run 1, authority to the vault and then a creator
  verification proposal, clean. Run 2, authority back from the vault for 6
  NFTs in swap mode: the five proposal transactions (create, three adds,
  activate + approve) all landed within one second from one wallet prompt
  (verified from the wallet's history); the proposal was Active with 1 of 2
  approvals. A sixth prompt then failed with the panel's "Whatever
  confirmed before this stays" toast and left no trace on chain: the
  panel's action buttons acted on the status from before the run (its
  re-read was still in flight), so "Finish creating the proposal" sent an
  activate on an already active proposal, which the program refuses.
  **Fixed 2026-10-22:** the panel's actions are disabled while the
  proposal is being re-read (a re-read before finishing was considered and
  dropped: a status changed by someone else between refreshes is already
  answered by the program's refusal and the toast). Run 3, authority back
  from the vault for 5 NFTs (3 transactions): the create step and the
  first add landed in consecutive slots at 12:57:12, then the second add
  was refused by preflight with 3012 (Anchor's AccountNotInitialized) and
  never broadcast; the wallet shows no failed transaction. The RPC
  confirmed the first add from one node and simulated the next on another
  a slot or two behind, where the batch and proposal didn't exist yet.
  The wallet's own "simulation failed" warnings for all but the first
  transaction are expected (each depends on the one before it) and the
  panel says so. Run 4 (proposal #10, 6 NFTs, 4 transactions): all four
  landed within two seconds, yet the panel then showed "Draft: 2 of 2
  added" and offered "Finish creating the proposal", which sent an
  activate on the already active proposal (6008, InvalidProposalStatus).
  Same cause as run 2 and run 3, and systematic: 40 back-to-back reads of
  the confirmed slot from the HTTP endpoint went backwards twice, so it is
  answered by several nodes about a slot apart, and the read right after a
  websocket confirmation is usually answered by one that hasn't reached
  that slot. **Fixed 2026-10-23, one mechanism for both:** the sender
  confirms through `@blastctrl/kit-extensions`'
  `sendAndConfirmWithSlotFactory` (kit's own strategy, plus the slot the
  confirmation came at); `sendInOrder` sends each step with the previous
  step's slot as `minContextSlot` and reports the slot after each
  confirmation; the panel reads the proposal with the last confirmed slot
  as `minContextSlot`. A node that hasn't reached the slot refuses
  (-32016, "minimum context slot has not been reached") instead of
  answering from an older state, and `retryWhileBehind`
  (`connector/min-context-slot.ts`) tries the send or the read again
  until a node that has caught up answers. A run that fails partway keeps
  the slot of its last confirmed step, so the read after it is right too.
  Tried first and replaced: a retry on any preflight failure, and an
  optimistic write of the expected state into the query cache. The
  toast's "whatever confirmed before this stays" is only added when
  something in the run confirmed. Not yet seen: the second
  member's approve and the execute from this panel.

- [x] **NFT faucet** (`nft-faucet`)

  Not implemented (2026-10-21): the route has no working tool behind it, so
  there is nothing to test. Ticked on that basis.

## Permanent storage (`permanent-storage-tools/`)

- [x] **File upload** (`file-upload`, `lib/turbo.ts`)

  Tested by hand in the browser on mainnet, 2026-10-21 (the Turbo upload
  and SOL top-up go to ArDrive, not to the surfnet). A file uploaded at
  once through the connector compat bridge; the toast's propagation
  warning is accurate: Turbo's status endpoint
  `https://upload.ardrive.io/v1/tx/<id>/status` reported
  `CONFIRMED` / `info: new` immediately, while `https://arweave.net/<id>`
  answered 404 on the sandbox subdomain for about ten minutes before the
  file was served. `page.test.tsx` covers the page with a mocked Turbo
  client. No defects found.

## Swaps

- [x] **Gasless swap** (`gasless-swap`, `api/octane/build-jup-swap`, `packages/octane-core`)

  Tested by hand on the frontend against the live backend and Jupiter
  (2026-10-22, the user). Not simulated: the fee payer and the swap route
  come from the Octane backend, so a surfnet can't stand in for it; the
  `packages/octane-core` tests fake Jupiter and the RPC.

- [ ] **Gasless swap with BONK selected** (`gasless-swap?token=bonk`)

  The gasless BONK swap page was merged into the gasless swap on
  2026-10-24, and the BONK burn was removed from `packages/octane-core`, so
  BONK now swaps like any other token. `/gasless-bonk-swap` redirects here
  with BONK selected. The old page passed a hand test against the live
  backend (2026-10-22, the user); the merged page with BONK selected hasn't
  been tested by hand yet. Same dependencies as the gasless swap.

## Out of scope

- `gmeet-cc-capture`: a Google Meet captions bookmarklet, no chain state.
- `api/octane/price`: upstream price feed, covered by the octane-core fakes.
