# pop-mcp-server — Project Context for Claude

## What This Project Is

A **TypeScript MCP (Model Context Protocol) server** for the **POP Cloud API**, enabling LLMs (Claude, etc.) to generate, submit, and manage electronic invoices directly from AI assistants.

The server exposes 8 tools covering the core POP API surface: Italian e-invoicing (FatturaPA/SdI), Peppol (EU cross-border), PDF generation, document validation, archival, and status tracking.

---

## Related Projects

These two sibling directories are the source of truth for the POP API:

- `../pop-cloud-api` — The POP Cloud API backend (WordPress REST API, PHP)
- `../n8n-nodes-pop` — n8n community nodes for POP (shows all API call patterns)

When in doubt about API behaviour, endpoint shapes, or field meanings: read those.

---

## Architecture

```
src/
├── index.ts              stdio transport entry point
├── constants.ts          API base URLs + endpoint paths
├── types.ts              TypeScript interfaces (responses, errors)
├── client.ts             Axios client, auth (POP_API_KEY header), error handling
├── schemas/
│   └── invoice.ts        Full Zod schema for FatturaPA invoice data structure
└── tools/
    ├── invoices.ts       pop_create_sdi_invoice, pop_create_peppol_invoice, pop_create_pdf_invoice
    ├── status.ts         pop_get_invoice_status, pop_get_peppol_document, pop_get_sdi_document
    └── advanced.ts       pop_verify_sdi_document, pop_preserve_document
```

**Transport:** stdio (for Claude Desktop and similar local clients)  
**Stack:** TypeScript, `@modelcontextprotocol/sdk`, `axios`, `zod`

---

## The 8 Tools

| Tool | Endpoint | Plan |
|------|----------|------|
| `pop_create_sdi_invoice` | POST `/create-xml` | Any |
| `pop_create_peppol_invoice` | POST `/create-ubl` | Any (Basic+ to submit) |
| `pop_create_pdf_invoice` | POST `/create-pdf` | Any (Basic+ for email) |
| `pop_get_invoice_status` | POST `/document-notifications` | Any |
| `pop_get_peppol_document` | POST `/peppol/document-get` | Basic+ |
| `pop_get_sdi_document` | POST `/sdi-via-pop/document-get` | Growth+ |
| `pop_verify_sdi_document` | POST `/sdi-via-pop/document-verify` | Growth+ |
| `pop_preserve_document` | POST `/sdi-via-pop/document-preserve` | Growth+ |

---

## POP API Key Facts

- **Auth:** `X-API-Key: {license_key}` header (set via `POP_API_KEY` env var)
- **Base URL (prod):** `https://popapi.io/wp-json/api/v2`
- **Base URL (staging):** `https://staging7.popapi.io/wp-json/api/v2`
- **Environment:** controlled by `POP_ENVIRONMENT=staging|production` (default: production)
- **No OAuth**, no bearer tokens — license key only

## Invoice Data Model (summary)

The `data` parameter for all creation tools mirrors the FatturaPA structure:
- `transmitter_data` — who sends (usually same as supplier)
- `transfer_lender` — supplier/seller with `tax_regime` (e.g. RF01)
- `transferee_client` — customer/buyer; `tax_id_code` required for Italian private individuals
- `invoice_body.general_data` — `doc_type` (TD01/TD04), `date`, `invoice_number`, `currency`
- `order_items[]` — line items with `rate` (VAT %), `unit_price`, `total_price`, `total_tax`
- `payment_data` — `terms_payment` (TP01/TP02/TP03) + `payment_details` (MP01–MP23)
- For credit notes (`type: "credit_note"`): `connected_invoice_data[]` is required
- For PDF: populate `data.pdf` with `doc_type_title`, `head`, optionally `email_invoice`

## Key Domain Rules

- `sdi_type` must be 7 chars (`0000000` for private individuals without SDI code)
- Version `FPR12` = private/company; `FPA12` = Public Administration
- Peppol only supports `customer_type: "company"` or `"freelance"` (not private)
- `nature` code required when VAT rate is 0% (e.g. `N2.1`, `N3.1`, `N6.1`)
- Bank transfer (MP05) requires `beneficiary`, `financial_institution`, `iban`
- PDF email: max 3 recipients, Basic+ plan required

---

## Build & Run

```bash
npm install        # install deps
npm run build      # compile TypeScript → dist/
npm run dev        # watch mode (tsx)
npm run inspector  # open MCP Inspector UI
```

Build must pass cleanly (`tsc` zero errors) before any release.

## Claude Desktop Config

```json
{
  "mcpServers": {
    "pop": {
      "command": "node",
      "args": ["/absolute/path/to/pop-mcp/dist/index.js"],
      "env": { "POP_API_KEY": "your_license_key_here" }
    }
  }
}
```

---

## Status

- [x] All 8 tools implemented and registered
- [x] Full Zod schemas for invoice data validation
- [x] Build passes with zero TypeScript errors
- [x] Tools verified via `tools/list` MCP call
- [x] README ready for GitHub MCP Registry submission
- [ ] Publish to npm as `pop-mcp-server`
- [ ] Submit PR to [MCP Registry](https://github.com/modelcontextprotocol/servers)
- [ ] Add evaluation questions (see `/root/.claude/skills/mcp-builder/reference/evaluation.md`)
