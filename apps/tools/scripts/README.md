# Scripts

One-off maintenance scripts. Run them from `apps/tools` so the app's
dependencies resolve.

- `make-devnet-demo-mints.mjs`: makes the devnet demo mints for the
  reclaim-rent dev panel and writes `demo-mints.devnet.json`. Run it again
  when a devnet reset wipes them. Its header says how.
