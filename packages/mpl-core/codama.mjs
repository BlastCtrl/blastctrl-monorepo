// Generates the @solana/kit client in src/generated from idl/mpl_core.json.
//
// Ported from the program repository's own generator config,
// metaplex-foundation/mpl-core `configs/kinobi.cjs` (Apache-2.0), which was
// written for Kinobi (Codama's predecessor) and its Umi renderer. The tree
// edits are carried over to Codama 1.x; the Umi-only parts (the `base*`
// renames and `customAccountData`, which exist so hand-written Umi code can
// wrap accounts with parsed plugin data) are left out. See README.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as typeScriptPlugin from "prettier/plugins/typescript";
import {
  accountNode,
  arrayValueNode,
  bottomUpTransformerVisitor,
  bytesTypeNode,
  constantPdaSeedNodeFromString,
  createFromRoot,
  definedTypeLinkNode,
  enumValueNode,
  noneValueNode,
  pdaValueNode,
  programNode,
  publicKeyTypeNode,
  publicKeyValueNode,
  setAccountDiscriminatorFromFieldVisitor,
  structFieldTypeNode,
  structTypeNode,
  updateAccountsVisitor,
  updateDefinedTypesVisitor,
  updateInstructionsVisitor,
  updateProgramsVisitor,
  variablePdaSeedNode,
} from "codama";

const packageDir = dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(
  readFileSync(join(packageDir, "idl", "mpl_core.json"), "utf8"),
);

const codama = createFromRoot(rootNodeFromAnchor(idl));

// Program name: `mplCoreProgram` -> `mplCore`.
codama.update(
  updateProgramsVisitor({
    mplCoreProgram: { name: "mplCore" },
  }),
);

// The asset signer: the PDA an asset signs with in `executeV1`. It holds no
// data; the empty account exists so it can carry the seeds below.
codama.update(
  bottomUpTransformerVisitor([
    {
      select: "[programNode]mplCore",
      transform: (node) =>
        programNode({
          ...node,
          accounts: [
            ...node.accounts,
            accountNode({
              name: "assetSigner",
              size: 0,
              data: structTypeNode([
                structFieldTypeNode({
                  name: "data",
                  type: bytesTypeNode(),
                }),
              ]),
            }),
          ],
        }),
    },
  ]),
);

codama.update(
  updateAccountsVisitor({
    assetSigner: {
      size: 0,
      seeds: [
        constantPdaSeedNodeFromString("utf8", "mpl-core-execute"),
        variablePdaSeedNode(
          "asset",
          publicKeyTypeNode(),
          "The address of the asset account",
        ),
      ],
    },
  }),
);

// Type renames. Upstream also renames `crate` to `relationshipEntry`: the
// IDL defines the type as `RelationshipEntry` but `CreateGroupV1Args` links
// to it as `crate` (Shank kept the head of its Rust path). Kinobi renamed the
// dangling link; Codama's updateDefinedTypesVisitor only renames links along
// with an existing definition, so repoint the link directly.
codama.update(
  updateDefinedTypesVisitor({
    authority: { name: "pluginAuthority" },
  }),
);
codama.update(
  bottomUpTransformerVisitor([
    {
      select: "[definedTypeLinkNode]crate",
      transform: (node) =>
        definedTypeLinkNode("relationshipEntry", node.program),
    },
  ]),
);

// Instruction defaults.
const none = { defaultValue: noneValueNode() };
const emptyArray = { defaultValue: arrayValueNode([]) };
const accountState = {
  defaultValue: enumValueNode("dataState", "accountState"),
};

codama.update(
  updateInstructionsVisitor({
    transferV1: { arguments: { compressionProof: none } },
    addPluginV1: { arguments: { initAuthority: none } },
    addCollectionPluginV1: { arguments: { initAuthority: none } },
    burnV1: { arguments: { compressionProof: none } },
    createV1: {
      arguments: { plugins: emptyArray, dataState: accountState },
    },
    createV2: {
      arguments: {
        plugins: emptyArray,
        externalPluginAdapters: emptyArray,
        dataState: accountState,
      },
    },
    createCollectionV1: { arguments: { plugins: none } },
    createCollectionV2: {
      arguments: { plugins: none, externalPluginAdapters: emptyArray },
    },
    updateGroupV1: { arguments: { newName: none, newUri: none } },
    collect: {
      accounts: {
        recipient1: {
          defaultValue: publicKeyValueNode(
            "8AT6o8Qk5T9QnZvPThMrF9bcCQLTGkyGvVZZzHgCw11v",
          ),
        },
        recipient2: {
          defaultValue: publicKeyValueNode(
            "MmHsqX4LxTfifxoH8BVRLUKrwDn1LPCac6YcCZTHhwt",
          ),
        },
      },
    },
    updateV1: {
      arguments: { newUpdateAuthority: none, newName: none, newUri: none },
    },
    updateV2: {
      arguments: { newUpdateAuthority: none, newName: none, newUri: none },
    },
    updateCollectionV1: { arguments: { newName: none, newUri: none } },
    executeV1: {
      accounts: { assetSigner: { defaultValue: pdaValueNode("assetSigner") } },
    },
  }),
);

// Shank accounts start with a `Key` enum; use it as the discriminator.
const key = (variant) => ({
  field: "key",
  value: enumValueNode("key", variant),
});
codama.update(
  setAccountDiscriminatorFromFieldVisitor({
    assetV1: key("assetV1"),
    collectionV1: key("collectionV1"),
    groupV1: key("groupV1"),
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
