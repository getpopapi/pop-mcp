export const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};

export function modernRequest(id: number, method: string, params: Record<string, unknown> = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: { ...params, _meta: MODERN_META },
  };
}

/**
 * Per SEP-2243, every HTTP request MUST carry MCP-Protocol-Version (matching
 * the body's _meta) and Mcp-Method (matching the body's method); Mcp-Name is
 * required in addition for tools/call, resources/read, and prompts/get.
 */
export function modernHeaders(method: string, name?: string): Record<string, string> {
  return {
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {}),
  };
}
