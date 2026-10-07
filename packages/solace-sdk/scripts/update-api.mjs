/**
 * Pulls openapi.yaml from the backend repo at a given ref and regenerates the
 * Orval client. Uses the `gh` CLI, so it works for the private repo with your
 * existing login (or GH_TOKEN in CI).
 *
 *   pnpm api:update --ref <backend-tag-or-commit>
 *   pnpm api:update --from-file ./openapi.yaml    # local fixture, no download
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const pkg = path.resolve(import.meta.dirname, "..");
const root = path.resolve(pkg, "../..");
const sourceFile = path.join(pkg, "openapi.source.json");
const source = JSON.parse(fs.readFileSync(sourceFile, "utf8"));

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const ref = flag("--ref");
const fromFile = flag("--from-file");
if (!ref && !fromFile) {
  console.error(
    "usage: pnpm api:update --ref <backend-tag-or-commit> | --from-file <openapi.yaml>",
  );
  process.exit(2);
}

const sh = (cmd, cmdArgs, cwd = pkg) =>
  execFileSync(cmd, cmdArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
const run = (cmd, cmdArgs, cwd = pkg) =>
  execFileSync(cmd, cmdArgs, { cwd, stdio: "inherit" });

let schema;
let commit = null;
if (fromFile) {
  schema = fs.readFileSync(fromFile, "utf8");
} else {
  const repo = `repos/${source.repository}`;
  commit = sh("gh", ["api", `${repo}/commits/${ref}`, "--jq", ".sha"]);
  console.log(`${source.repository}@${ref} -> ${commit}`);
  schema = sh("gh", [
    "api",
    `${repo}/contents/${source.path}?ref=${commit}`,
    "-H",
    "Accept: application/vnd.github.raw+json",
  ]);
}

// Make sure we did not download an error page or the wrong file.
if (!/^openapi:\s*["']?3\./m.test(schema) || !/^paths:/m.test(schema)) {
  console.error(
    "Downloaded content is not an OpenAPI 3 document, nothing changed.",
  );
  process.exit(1);
}

fs.writeFileSync(path.join(pkg, "openapi.yaml"), schema);

try {
  run("pnpm", ["generate"]);
} catch {
  // Put the schema and generated client back exactly as git has them.
  run("git", ["checkout", "--", "openapi.yaml", "src/generated"]);
  console.error("\nOrval failed; schema and generated client were restored.");
  process.exit(1);
}

fs.writeFileSync(
  sourceFile,
  JSON.stringify({ ...source, ref: ref ?? null, commit }, null, 2) + "\n",
);

// apps/tools consumes the SDK through dist/, so build before type checking the app.
try {
  run("pnpm", ["build"]);
  run("pnpm", ["-F", "@blastctrl/tools", "typecheck"], root);
} catch {
  console.error(
    "\nType check failed. The new client is kept so you can fix the call sites above.",
  );
  console.error(
    "To undo: git checkout -- packages/solace-sdk/openapi.yaml packages/solace-sdk/openapi.source.json packages/solace-sdk/src/generated",
  );
  process.exit(1);
}

console.log("\nDone. Review and commit:");
run("git", ["status", "--short", "--", "packages/solace-sdk"], root);
