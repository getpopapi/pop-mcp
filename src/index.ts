#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerStatusTools } from "./tools/status.js";
import { registerAdvancedTools } from "./tools/advanced.js";

const server = new McpServer({
  name: "pop-mcp-server",
  version: "1.0.0",
});

registerInvoiceTools(server);
registerStatusTools(server);
registerAdvancedTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("POP MCP Server running on stdio\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
