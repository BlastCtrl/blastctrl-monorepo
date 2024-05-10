# OCTANE INTERNAL FORK

This is a fork of the old Octane project by Solana (now Anza)

https://github.com/anza-xyz/octane

This repository recreates the "core" package from the Octane project in a simplified way, excluding functionality which isn't needed. The only required feature for the BlastTools frontend is the gasless swap feature.

### Tests

To be able to run the tests, you need to start the Solana local validator in the background with `solana-test-validator`.

Start the tests with:

```bash
pnpm -F octane-core test
```
