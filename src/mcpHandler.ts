import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createPopServer } from "./mcpServer.js";
import type { Environment } from "./types.js";

// Node-http handler for the Vercel serverless function backing /mcp (see
// api/mcp.ts + vercel.json). MCP 2026-07-28 is stateless: every request
// self-describes its protocol version and capabilities, so createMcpHandler
// builds one fresh McpServer per request from the factory below — no session
// ID, no handshake to track. Multi-tenant: the POP license key arrives
// per-request via Authorization: Bearer <key> and is never stored
// server-side (see ApiContext in src/types.ts).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
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

function extractBearerToken(authHeader: string | null | undefined): string | undefined {
  const [scheme, token] = (authHeader ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

// Built once per process and reused across requests (the recommended
// createMcpHandler usage): the handler itself holds no per-tenant state,
// only per-request McpServer instances minted by the factory below.
const mcpHandler = createMcpHandler(
  (ctx) => {
    const token = extractBearerToken(ctx.requestInfo?.headers.get("authorization"));
    return createPopServer({
      apiKey: token ?? "",
      environment: resolveEnvironment(process.env.POP_ENVIRONMENT),
    });
  },
  { legacy: "reject" }
);

const nodeHandler = toNodeHandler(mcpHandler);

/**
 * Handles CORS preflight for the MCP endpoint. Shared by local dev
 * (node:http) and the Vercel serverless function.
 */
export function handleMcpOptions(res: ServerResponse): void {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

/**
 * Handles a single MCP HTTP request. The Authorization header is validated
 * here, ahead of the SDK handler, so a missing/malformed key gets our own
 * `401 unauthorized_user` shape instead of a generic protocol error.
 */
export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }

  if (!extractBearerToken(req.headers.authorization)) {
    unauthorized(
      res,
      "Missing or invalid Authorization header. Expected: Authorization: Bearer <license_key>"
    );
    return;
  }

  try {
    await nodeHandler(req, res);
  } catch (error) {
    console.error("Error handling MCP request:", error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
}
