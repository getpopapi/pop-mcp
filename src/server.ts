import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerStatusTools } from "./tools/status.js";
import { registerAdvancedTools } from "./tools/advanced.js";
import { registerOnboardingTools } from "./tools/onboarding.js";
import type { ApiContext } from "./types.js";

/**
 * Builds a fresh McpServer with all 13 tools registered against the given
 * ApiContext. Shared by the stdio entry point (src/index.ts) and the
 * Cloudflare Worker entry point (src/worker.ts) so tool wiring only lives
 * in one place.
 */
export function createPopServer(ctx: ApiContext): McpServer {
  const server = new McpServer({
    name: "pop-mcp",
    version: "1.1.0",
  });

  registerInvoiceTools(server, ctx);
  registerStatusTools(server, ctx);
  registerAdvancedTools(server, ctx);
  registerOnboardingTools(server, ctx);

  return server;
}
