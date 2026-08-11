import { McpServer } from "@modelcontextprotocol/server";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerStatusTools } from "./tools/status.js";
import { registerAdvancedTools } from "./tools/advanced.js";
import { registerOnboardingTools } from "./tools/onboarding.js";
import type { ApiContext } from "./types.js";

/**
 * Builds a fresh McpServer with all registered tools against the given
 * ApiContext. Shared by the stdio entry point (src/cli.ts) and the
 * Vercel HTTP entry point (src/mcpHandler.ts) so tool wiring only lives
 * in one place.
 */
export function createPopServer(ctx: ApiContext): McpServer {
  const server = new McpServer(
    {
      name: "pop-mcp",
      version: "2.0.0",
    },
    {
      // Our tool catalog is identical for every POP license key, so it's
      // safe for shared/public caching across tenants.
      cacheHints: {
        "tools/list": { ttlMs: 3_600_000, cacheScope: "public" },
        "server/discover": { ttlMs: 3_600_000, cacheScope: "public" },
      },
    }
  );

  registerInvoiceTools(server, ctx);
  registerStatusTools(server, ctx);
  registerAdvancedTools(server, ctx);
  registerOnboardingTools(server, ctx);

  return server;
}
