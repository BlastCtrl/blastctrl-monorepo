// Refetches the program's IDL from its repository on GitHub and records
// which commit it came from, so `pnpm generate` is reproducible.
//
//   pnpm idl:fetch            # the tip of main
//   pnpm idl:fetch --ref v1.2 # a tag, branch or commit
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "metaplex-foundation/mpl-core";
const IDL_PATH = "idls/mpl_core.json";

const refFlag = process.argv.indexOf("--ref");
const ref = refFlag === -1 ? "main" : process.argv[refFlag + 1];
if (!ref) throw new Error("--ref needs a value");

const headers = {
  accept: "application/vnd.github+json",
  "user-agent": "blastctrl-monorepo idl:fetch",
  ...(process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

const commit = await fetchJson(
  `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(ref)}`,
  { headers },
);
const idl = await fetchJson(
  `https://raw.githubusercontent.com/${REPO}/${commit.sha}/${IDL_PATH}`,
);

const idlDir = join(dirname(fileURLToPath(import.meta.url)), "..", "idl");
mkdirSync(idlDir, { recursive: true });
writeFileSync(
  join(idlDir, "mpl_core.json"),
  JSON.stringify(idl, null, 2) + "\n",
);
writeFileSync(
  join(idlDir, "source.json"),
  JSON.stringify(
    {
      repository: `https://github.com/${REPO}`,
      path: IDL_PATH,
      ref,
      commit: commit.sha,
      committedAt: commit.commit.committer.date,
      fetchedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${IDL_PATH} at ${commit.sha.slice(0, 7)} (${ref}) -> idl/mpl_core.json`,
);
