# OCTANE INTERNAL FORK

This is a fork of the old Octane project by Solana (now Anza)

https://github.com/anza-xyz/octane

This repository recreates the "core" package from the Octane project in a simplified way, excluding functionality which isn't needed. The only required feature for the BlastTools frontend is the gasless swap feature: `buildJupiterSwapToSOL` builds a swap-to-SOL transaction that Octane's fee payer pays for and has already signed, and that repays the fee payer out of the SOL the user receives.

It is built on `@solana/kit` and the `@solana-program/*` clients; nothing in it touches web3.js.

### Tests

The tests fake Jupiter and the RPC, so they need no validator:

```bash
pnpm -F @blastctrl/octane-core test
```
