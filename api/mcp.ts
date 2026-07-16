import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMcpHttpRequest, handleMcpOptions } from "../src/mcpHandler.js";

// Vercel Node.js serverless function backing the /mcp endpoint (see
// vercel.json for the /mcp -> /api/mcp rewrite). Multi-tenant: callers pass
// their own POP license key via Authorization: Bearer <key> per request.
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    handleMcpOptions(res);
    return;
  }

  await handleMcpHttpRequest(req, res);
}
