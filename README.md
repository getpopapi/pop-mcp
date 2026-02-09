# POP Api MCP

MCP server to create UBL invoices (and optionally send via PEPPOL) through POP Api.

## Setup

1. Install deps:

```bash
npm install
```

2. Configure environment variables:

- `POP_BASE_URL`: base URL of your POP Api instance (default: `https://popapi.io`)
- `POP_API_KEY`: API key (required)
- `POP_API_KEY_HEADER`: header name used for the API key (default: `X-API-Key`)

Example MCP config:

```json
{
  "mcpServers": {
    "popapi": {
      "command": "node",
      "args": ["/Users/mircobabini/Desktop/Workspace/pop-mcp/src/index.js"],
      "env": {
        "POP_BASE_URL": "https://popapi.io",
        "POP_API_KEY": "your_api_key",
        "POP_API_KEY_HEADER": "X-API-Key"
      }
    }
  }
}
```

## Tool

### `create_ubl_invoice`

Create a UBL invoice using `POST /wp-json/api/v2/create-ubl`.

Input schema:

```json
{
  "base_url": "https://override-base-url-optional",
  "payload": { "license_key": "...", "data": { } },
  "integration": { "use": "peppol-via-pop", "action": "create" }
}
```

If `integration` is provided, it will be merged into the payload as shown in your documentation.
