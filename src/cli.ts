#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createPopServer } from "./mcpServer.js";
import { getApiKey, getEnvironment } from "./client.js";

function main(): void {
  serveStdio(
    () =>
      createPopServer({
        apiKey: getApiKey(),
        environment: getEnvironment(),
      }),
    { legacy: "reject" }
  );
  process.stderr.write("POP MCP Server running on stdio\n");
}

// Only run when this file is executed directly (the stdio CLI entry point,
// e.g. `node dist/cli.js`) — never on import. This is the sole caller of
// getApiKey(), which requires a single fixed POP_API_KEY env var; the Vercel
// HTTP path (src/mcpHandler.ts) is multi-tenant and must never reach it.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error: unknown) {
    process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
