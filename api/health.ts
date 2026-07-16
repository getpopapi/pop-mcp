import type { IncomingMessage, ServerResponse } from "node:http";

// Backs the "/" health check (see vercel.json for the rewrite).
export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", server: "pop-mcp" }));
}
