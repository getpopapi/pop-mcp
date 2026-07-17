// Pre-bundles each api/*.ts entry into a single self-contained .js file (all
// first-party ../src imports inlined, npm packages left external for Node to
// resolve at runtime) and removes the .ts source afterward.
//
// Why: Vercel's zero-config Node builder traces api/*.ts's relative imports
// into ../src and, on this project, ended up treating one of those traced
// src/*.mjs chunks as its own function entrypoint — crashing every request
// with "Invalid export found in module .../src/server.mjs. The default
// export must be a function or server." Bundling first-party code into one
// flat file per route removes every relative import to ../src from the
// build output, so there is nothing left outside api/ for Vercel to
// misidentify as a function.
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";

const entries = readdirSync("api").filter((f) => f.endsWith(".ts")).map((f) => `api/${f}`);

if (entries.length === 0) {
  throw new Error("bundle-vercel-api: no api/*.ts entries found");
}

await build({
  entryPoints: entries,
  outdir: "api",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  logLevel: "info",
});

for (const entry of entries) {
  rmSync(entry);
}
