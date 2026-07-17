import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPopServer } from "./server.js";
import type { Environment } from "./types.js";

// Node-http handler for the Vercel serverless function backing /mcp (see
// api/mcp.ts + vercel.json). Uses the SDK's Node-native
// StreamableHTTPServerTransport, since Vercel Node functions use
// IncomingMessage/ServerResponse, not Fetch Request/Response.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function resolveEnvironment(raw: string | undefined): Environment {
  return raw?.toLowerCase() === "staging" ? "staging" : "production";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

function unauthorized(res: ServerResponse, message: string): void {
  sendJson(res, 401, { error_code: "unauthorized_user", message });
}

/**
 * Handles CORS preflight for the MCP endpoint. Shared by local dev
 * (node:http) and the Vercel serverless function.
 */
export function handleMcpOptions(res: ServerResponse): void {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

/**
 * Handles a single MCP HTTP request. Multi-tenant: the POP license key
 * arrives per-request via `Authorization: Bearer <key>` and is never stored
 * server-side (see ApiContext in src/types.ts). Stateless by design
 * (sessionIdGenerator: undefined, a fresh McpServer + transport per call) so
 * the same code runs unchanged on a Vercel serverless function.
 */
export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  const authHeader = req.headers.authorization ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    unauthorized(
      res,
      "Missing or invalid Authorization header. Expected: Authorization: Bearer <license_key>"
    );
    return;
  }

  const server = createPopServer({
    apiKey: token,
    environment: resolveEnvironment(process.env.POP_ENVIRONMENT),
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP request:", error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
}
