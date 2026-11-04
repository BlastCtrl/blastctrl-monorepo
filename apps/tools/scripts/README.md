# Scripts

One-off maintenance scripts. Run them from `apps/tools` so the app's
dependencies resolve.

- `make-devnet-demo-mints.mjs`: makes the devnet demo mints for the
  reclaim-rent dev panel, plain Token program mints, and writes
  `demo-mints.devnet.json`. Run it again when a devnet reset wipes them. Its
  header says how.
- `reclaim-stats.ts`: usage statistics for the reclaim-rent tool, read from
  the fee wallet's transaction history: wallets, sessions, transactions,
  accounts, fees and SOL returned, per day, week or month. Needs a Triton
  endpoint for `getTransactionsForAddress`. Its header lists the flags.

  ```sh
  node --env-file=.env.local scripts/reclaim-stats.ts --address <fee wallet>
  ```
