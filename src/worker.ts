import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPopServer } from "./server.js";
import type { Environment } from "./types.js";

export interface Env {
  POP_ENVIRONMENT?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function unauthorized(message: string): Response {
  return jsonResponse(401, {
    error_code: "unauthorized_user",
    message,
  });
}

function resolveEnvironment(env: Env): Environment {
  return env.POP_ENVIRONMENT?.toLowerCase() === "staging" ? "staging" : "production";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health") {
      return jsonResponse(200, { status: "ok", server: "pop-mcp" });
    }

    if (url.pathname !== "/mcp") {
      return jsonResponse(404, { error: "Not found" });
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return unauthorized(
        "Missing or invalid Authorization header. Expected: Authorization: Bearer <license_key>"
      );
    }

    try {
      const server = createPopServer({
        apiKey: token,
        environment: resolveEnvironment(env),
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);
      const response = await transport.handleRequest(request);

      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error("Error handling MCP request:", error instanceof Error ? error.message : error);
      return jsonResponse(500, { error: "Internal server error" });
    }
  },
};
