#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPopServer } from "./server.js";
import { getApiKey, getEnvironment } from "./client.js";

async function main(): Promise<void> {
  const server = createPopServer({
    apiKey: getApiKey(),
    environment: getEnvironment(),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("POP MCP Server running on stdio\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
