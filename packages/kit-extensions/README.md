# Kit Extensions

Internal extensions for `@solana/kit`: a send-and-confirm that reports the
slot, and the Token-2022 helpers the apps need without
`@solana-program/token-2022` (program address, mint detection, extension
parsing).

```ts
import { sendAndConfirmWithSlotFactory } from "@blastctrl/kit-extensions";
```

This workspace package exports TypeScript source directly, like `@blastctrl/mpl-core`.

```bash
pnpm -F @blastctrl/kit-extensions typecheck
pnpm -F @blastctrl/kit-extensions lint
pnpm -F @blastctrl/kit-extensions format
```
