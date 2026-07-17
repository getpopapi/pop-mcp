import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPopServer } from "./mcpServer.js";
import type { Environment } from "./types.js";

// Node-http handler for the Vercel serverless function backing /mcp (see
// api/mcp.ts + vercel.json). We intentionally bridge Node's
// IncomingMessage/ServerResponse to the SDK's Web-standard transport
// ourselves instead of using the SDK's Node wrapper, to avoid the request
// hanging behind Vercel's serverless adapter.

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

function getRequestUrl(req: IncomingMessage): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = req.headers.host ?? "localhost";
  const path = req.url ?? "/";
  return `${proto}://${host}${path}`;
}

function toHeaders(init: IncomingMessage["headers"]): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(init)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }

  return headers;
}

async function readRequestBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

async function writeWebResponse(webResponse: Response, res: ServerResponse): Promise<void> {
  const headerValues: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headerValues[key] = value;
  });

  res.writeHead(webResponse.status, {
    ...headerValues,
    ...CORS_HEADERS,
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  const body = Readable.fromWeb(webResponse.body as globalThis.ReadableStream);
  await new Promise<void>((resolve, reject) => {
    body.on("error", reject);
    res.on("error", reject);
    res.on("finish", resolve);
    body.pipe(res);
  });
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
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const body = await readRequestBody(req);
    const webRequest = new Request(getRequestUrl(req), {
      method: req.method,
      headers: toHeaders(req.headers),
      body,
      duplex: body ? "half" : undefined,
    });
    const webResponse = await transport.handleRequest(webRequest);
    await writeWebResponse(webResponse, res);
  } catch (error) {
    console.error("Error handling MCP request:", error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
