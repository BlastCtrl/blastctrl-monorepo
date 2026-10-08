# Shared rent analysis

This internal package contains account discovery and eligibility rules moved
from the BlastCtrl reclaim-rent tool. Both the Next.js app and the MCP server
use it. It has no React, Next.js, wallet adapter, or environment-variable dependency.

- `discoverReclaimableAccounts`: read token accounts, referenced controlled
  mints, and live rent-exemption minimums.
- `lookupReclaimableMint`: check a mint supplied by the web user.
- `excessLamports`, `closes`, `reclaimLamports`, `keepOpenReason`: shared rules.
- `quoteReclaim`: calculate the two preview scenarios with the existing batch
  size, excess-only service fee, and base network fee estimate.

The web app still owns DAS metadata, React Query caching, selection, transaction
construction, wallet signing, and submission. The MCP server does not import
the transaction code.

Build with `pnpm --filter @blastctrl/rent-reclaimer build`. The web app's
`dev` and `build` scripts also build this package. After editing this package
while a web dev server is running, build it again to update its exports.
