// Generates the @solana/kit client in src/generated from
// idl/squads_multisig_program.json.
//
// The IDL is the legacy-format Anchor IDL the Squads v4 SDK ships
// (Squads-Protocol/v4 `sdk/multisig/idl`), which carries no PDA seeds and no
// account defaults. The PDAs and the `rentPayer` defaults below follow the
// SDK (`sdk/multisig/src/pda.ts` and `src/instructions/*.ts`). See README.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as typeScriptPlugin from "prettier/plugins/typescript";
import {
  accountValueNode,
  addPdasVisitor,
  constantPdaSeedNodeFromString,
  createFromRoot,
  numberTypeNode,
  publicKeyTypeNode,
  updateInstructionsVisitor,
  updateProgramsVisitor,
  variablePdaSeedNode,
} from "codama";

const packageDir = dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(
  readFileSync(join(packageDir, "idl", "squads_multisig_program.json"), "utf8"),
);

const codama = createFromRoot(rootNodeFromAnchor(idl));

// Program name: `squadsMultisigProgram` -> `squadsMultisig`.
codama.update(
  updateProgramsVisitor({
    squadsMultisigProgram: { name: "squadsMultisig" },
  }),
);

// PDAs, as the SDK's `src/pda.ts` derives them. Every seed prefix is a UTF-8
// constant and every number is little-endian.
const utf8 = (text) => constantPdaSeedNodeFromString("utf8", text);
const multisigSeed = variablePdaSeedNode(
  "multisig",
  publicKeyTypeNode(),
  "The multisig account",
);

codama.update(
  addPdasVisitor({
    squadsMultisig: [
      {
        name: "vault",
        docs: ["A vault of a multisig: the account its transactions sign as."],
        seeds: [
          utf8("multisig"),
          multisigSeed,
          utf8("vault"),
          variablePdaSeedNode("index", numberTypeNode("u8"), "Vault index"),
        ],
      },
      {
        name: "transaction",
        docs: ["A vault, config or batch transaction account of a multisig."],
        seeds: [
          utf8("multisig"),
          multisigSeed,
          utf8("transaction"),
          variablePdaSeedNode(
            "index",
            numberTypeNode("u64"),
            "Transaction index",
          ),
        ],
      },
      {
        name: "proposal",
        docs: ["The proposal of a transaction (or batch) of a multisig."],
        seeds: [
          utf8("multisig"),
          multisigSeed,
          utf8("transaction"),
          variablePdaSeedNode(
            "transactionIndex",
            numberTypeNode("u64"),
            "Index of the transaction the proposal is for",
          ),
          utf8("proposal"),
        ],
      },
      {
        name: "batchTransaction",
        docs: ["A transaction inside a batch."],
        seeds: [
          utf8("multisig"),
          multisigSeed,
          utf8("transaction"),
          variablePdaSeedNode(
            "batchIndex",
            numberTypeNode("u64"),
            "Transaction index of the batch",
          ),
          utf8("batch_transaction"),
          variablePdaSeedNode(
            "transactionIndex",
            numberTypeNode("u32"),
            "Index of the transaction inside the batch, starting at 1",
          ),
        ],
      },
      {
        name: "ephemeralSigner",
        docs: ["A signer a vault transaction can create accounts with."],
        seeds: [
          utf8("multisig"),
          variablePdaSeedNode(
            "transaction",
            publicKeyTypeNode(),
            "The vault or batch transaction account",
          ),
          utf8("ephemeral_signer"),
          variablePdaSeedNode(
            "index",
            numberTypeNode("u8"),
            "Ephemeral signer index",
          ),
        ],
      },
      {
        name: "spendingLimit",
        seeds: [
          utf8("multisig"),
          multisigSeed,
          utf8("spending_limit"),
          variablePdaSeedNode(
            "createKey",
            publicKeyTypeNode(),
            "The key the spending limit was created with",
          ),
        ],
      },
      {
        name: "programConfig",
        seeds: [utf8("multisig"), utf8("program_config")],
      },
    ],
  }),
);

// `rentPayer` defaults to the signer that creates the account, as the SDK's
// instruction builders do (`rentPayer ?? creator` / `?? member`).
const rentPayer = (signer) => ({
  accounts: { rentPayer: { defaultValue: accountValueNode(signer) } },
});
codama.update(
  updateInstructionsVisitor({
    batchCreate: rentPayer("creator"),
    proposalCreate: rentPayer("creator"),
    batchAddTransaction: rentPayer("member"),
    vaultTransactionCreate: rentPayer("creator"),
    configTransactionCreate: rentPayer("creator"),
  }),
);

// The renderer formats with Prettier's standalone build and merges in the
// Prettier config this package.json points at (@blastctrl/prettier-config:
// Prettier defaults plus the Tailwind plugin). The standalone build cannot
// load a plugin by name, so put back the parser plugins the renderer would
// use; the Tailwind plugin only sorts class names, which this code has none of.
await codama.accept(
  renderVisitor(packageDir, {
    generatedFolder: "src/generated",
    kitImportStrategy: "rootOnly",
    renderParentInstructions: true,
    syncPackageJson: false,
    prettierOptions: {
      plugins: [estreePlugin, typeScriptPlugin, babelPlugin],
    },
  }),
);
