# pop-mcp — Project Context for Claude

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
| `pop_get_sdi_document` | POST `/sdi/document-get` | Growth+ |
| `pop_verify_sdi_document` | POST `/sdi/document-verify` | Growth+ |
| `pop_preserve_document` | POST `/sdi/document-preserve` | Growth+ |

---

## POP API Key Facts

- **Auth:** `X-API-Key: {license_key}` header (set via `POP_API_KEY` env var)
- **Base URL (prod):** `https://popapi.io/wp-json/api/v2`
- **Base URL (staging):** `https://staging7.popapi.io/wp-json/api/v2`
- **Environment:** controlled by `POP_ENVIRONMENT=staging|production` (default: production)
- **No OAuth**, no bearer tokens — license key only

## Invoice Data Model (official payload structure)

The `data` object for all creation tools follows this exact structure.
**Reference file:** `rapidapi-endpoint-examples-v2.txt` — this is the canonical payload doc.

### Required top-level fields in `data`

```json
{
  "id": 1,
  "filename": "IT12345678901_00001",
  "type": "invoice",
  "version": "FPR12",
  "sdi_type": "ABC1234",
  "customer_type": "company",
  "nature": "N3.1"
}
```

- `sdi_type` — 7 chars exactly. `0000000` for private individuals without SDI code.
- `version` — `FPR12` (private/companies) or `FPA12` (Public Administration)
- `customer_type` — `private` | `company` | `freelance` | `pa`
- `nature` — required only when VAT rate is 0% (e.g. `N2.1`, `N3.1`, `N6.1`). Top-level field, NOT inside order_items.

### `transmitter_data`

```json
{
  "transmitter_id": { "country_id": "IT", "id_code": "12345678901" },
  "progressive": "00001",
  "transmitter_format": "FPR12",
  "sdi_code": "ABC1234",
  "transmitter_contact": { "phone": "+39 02 1234567", "email": "info@acmesrl.it" },
  "recipient_pec": "optional@pec.it"
}
```

### `transfer_lender` (supplier)

```json
{
  "personal_data": {
    "tax_id_vat": { "country_id": "IT", "id_code": "12345678901", "tax_regime": "RF01" },
    "company_name": "Acme Srl"
  },
  "place": { "address": "Via Roma 1", "zip_code": "20121", "city": "Milano", "province_id": "MI", "country_id": "IT" },
  "contact": { "phone": "+39 02 1234567", "email": "info@acmesrl.it" }
}
```

### `transferee_client` (customer)

```json
{
  "personal_data": {
    "tax_id_vat": { "country_id": "IT", "id_code": "98765432101" },
    "tax_id_code": "RSSMRA80A01H501U",
    "company_name": "Cliente SpA",
    "first_name": "Mario",
    "last_name": "Rossi",
    "email": "customer@example.it"
  },
  "place": { "address": "Via Verdi 5", "zip_code": "00100", "city": "Roma", "province_id": "RM", "country_id": "IT" }
}
```

- `tax_id_code` (codice fiscale) required for Italian private individuals
- `tax_id_vat.id_code` — use empty string `""` for private individuals without VAT

### `invoice_body`

```json
{
  "general_data": {
    "doc_type": "TD01",
    "currency": "EUR",
    "date": "2025-01-15",
    "invoice_number": "WEB1/2025"
  },
  "total_document_amount": "1220.00"
}
```

- `doc_type`: `TD01` = invoice, `TD04` = credit note
- `order_items` and `payment_data` are **NOT** inside `invoice_body` — they are top-level `data` fields

### `order_items[]` (top-level in `data`)

```json
[{
  "item_code": { "type": "INTERNO", "value": "001" },
  "item_type": "product",
  "gift_product": null,
  "description": "Consulenza informatica",
  "quantity": "1.00",
  "unit": "N.",
  "unit_price": "1000.00",
  "total_price": "1000.00",
  "rate": "22.00",
  "total_tax": 220.00
}]
```

- `quantity`, `unit_price`, `total_price`, `rate` — **strings** (not numbers)
- `total_tax` — **number** (only numeric field)
- `item_type`: `product` | `shipping` | `fee`
- No `line_number` field

### `payment_data` (top-level in `data`)

```json
{
  "terms_payment": "TP02",
  "payment_details": "MP05",
  "payment_amount": "1220.00",
  "beneficiary": "Acme Srl",
  "financial_institution": "Banca Esempio",
  "iban": "IT60X0542811101000000123456"
}
```

- `payment_details` is a **string enum** (e.g. `"MP05"`), NOT an array
- `beneficiary`, `financial_institution`, `iban` required for MP05 (bank transfer)
- Terms: `TP01`=instalment, `TP02`=full, `TP03`=advance
- Methods: `MP01`=Cash, `MP02`=Check, `MP05`=Bank Transfer, `MP08`=Credit Card, `MP16`=Direct Debit, `MP19`=SEPA

### `pdf` (only for `pop_create_pdf_invoice`, top-level in `data`)

```json
{
  "invoice_html": "false",
  "doc_type_title": "Fattura",
  "logo_url": "https://acmesrl.it/logo.png",
  "head": {
    "store_info_address": "Via Roma 1, 20121 Milano (MI)",
    "billing": [{ "first_name": "Mario", "last_name": "Rossi", "address_1": "Via Verdi 5", "city": "Roma", "postcode": "00100", "country": "IT" }]
  },
  "total_tax": "110.00",
  "footer_text": "Grazie per averci scelto.",
  "email_invoice": { "to": ["customer@example.it"], "from": "noreply@acmesrl.it" }
}
```

## Key Domain Rules

- `sdi_type` must be 7 chars (`0000000` for private individuals without SDI code)
- Version `FPR12` = private/company; `FPA12` = Public Administration
- Peppol only supports `customer_type: "company"` or `"freelance"` (not private)
- `nature` code required when VAT rate is 0% (e.g. `N2.1`, `N3.1`, `N6.1`)
- Bank transfer (MP05) requires `beneficiary`, `financial_institution`, `iban`
- PDF email: max 3 recipients, Basic+ plan required

## Integration Object (`integration` field)

Valid values for the `integration` object on create endpoints:

**SdI** (`pop_create_sdi_invoice`):
- `{ "use": "sdi", "action": "create"|"update"|"delete" }` — canonical name; `"sdi-via-pop"` is the old alias (still accepted)
- `{ "use": "pop-to-webhook", "action": "create"|"update"|"delete", "id": "<webhook-id>" }`
- `{ "use": "fatture-in-cloud", "action": "create"|"update"|"delete" }`

**Peppol** (`pop_create_peppol_invoice`):
- `{ "use": "peppol", "action": "create"|"update"|"delete" }` — canonical name; `"peppol-via-pop"` is the old alias (still accepted)
- `{ "use": "pop-to-webhook", "action": "create"|"update"|"delete", "id": "<webhook-id>" }`

`action` defaults to `"create"` in all cases.

## Peppol / ACube Error Notes

- **"No owned LegalEntity was found within the document" (422)**: ACube error meaning the supplier's VAT number in `transfer_lender` does not match any LegalEntity registered in the POP/ACube Peppol account. Fix: ensure the supplier is enrolled as a Peppol participant in the POP dashboard and that `transfer_lender.personal_data.tax_id_vat.id_code` matches exactly.

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
      "args": ["/absolute/path/to/pop-mcp/dist/cli.js"],
      "env": { "POP_API_KEY": "your_license_key_here" }
    }
  }
}
```

---

## Status

- [x] All 8 invoice tools implemented and registered
- [x] 5 onboarding tools implemented and registered (v1.1.0)
- [x] Full Zod schemas for invoice data validation
- [x] Build passes with zero TypeScript errors
- [x] Tools verified via `tools/list` MCP call
- [x] README updated with auth section, correct payload docs, brand consistency
- [x] Published to npm as `@getpopapi/pop-mcp@1.0.2`
- [x] Published to MCP Registry as `io.github.popapidev/pop-mcp`
- [x] Canonical payload structure documented in `rapidapi-endpoint-examples-v2.txt`
- [ ] Publish v1.1.0 to npm and MCP Registry
- [ ] Update `io.github.popapidev` → `io.github.getpopapi` once org membership is public
- [ ] Add evaluation questions (see `/root/.claude/skills/mcp-builder/reference/evaluation.md`)
- [ ] Update RapidAPI endpoint examples to v2 payload format

## Remote HTTP server (2026-07-13, pivoted to Vercel 2026-07-16)

Added a second transport alongside stdio: an HTTP server exposing the same 13 tools over
Streamable HTTP at `https://mcp.popapi.io/mcp`, for any MCP client (Claude, OpenAI Responses API,
n8n), not just Claude Desktop. This is **multi-tenant** — each caller supplies their own POP
license key via `Authorization: Bearer <key>` instead of the server reading a single fixed
`POP_API_KEY`.

Key implementation points:

- **Fixed a real concurrency bug during the migration, not just added HTTP**: `src/client.ts` used
  to cache one module-level axios instance with the key baked in from whichever request called
  `getApiKey()` first — on a shared server this would leak the first caller's key to everyone
  after them. Removed the singleton; `apiPost`/`apiOnboardingPost`/`apiOnboardingGet` now take an
  `ApiContext { apiKey, environment }` per call, built once per request.
- `ApiContext` is threaded through `registerInvoiceTools/StatusTools/AdvancedTools(server, ctx)`
  (need `ctx.apiKey`) and `registerOnboardingTools(server, ctx)` (only needs `ctx.environment` —
  onboarding auth is per-call `onboarding_token`, untouched by this change).
- `src/server.ts` — `createPopServer(ctx)` — is the single place both `src/cli.ts` (stdio,
  builds `ctx` once from `process.env` at startup, unchanged behavior) and `src/mcpHandler.ts`
  (HTTP, builds `ctx` fresh per request from the `Authorization` header + `process.env
  .POP_ENVIRONMENT`) construct the `McpServer`.
- **Runs on Vercel**, not Cloudflare Workers. Originally built as a Cloudflare Worker
  (`src/worker.ts` + `wrangler.toml`, using `WebStandardStreamableHTTPServerTransport`) and
  verified locally via `wrangler dev` — but going live required `popapi.io`'s DNS to be an active
  zone on Cloudflare, and it isn't (DNS lives on SiteGround/cPanel). Cloudflare's Custom Domains
  also don't support wildcard paths, so the zone-based `[[routes]]` approach was a dead end without
  a DNS migration. Dropped in favor of Vercel, which only needs one CNAME record — same pattern
  already proven live in the sibling `pop-openai-app` repo. `src/worker.ts` and `wrangler.toml`
  were deleted; the Cloudflare deps (`wrangler`, `@cloudflare/workers-types`) were removed from
  `package.json`. Full reasoning: `mcp-and-openai-app-publishing-report.md`.
- Now runs on the SDK's Node-native **`StreamableHTTPServerTransport`** (not the Fetch-based
  `WebStandardStreamableHTTPServerTransport` the Worker used), since Vercel Node functions use
  `IncomingMessage`/`ServerResponse`, not Fetch `Request`/`Response`. One `McpServer` per request
  (`sessionIdGenerator: undefined`), same stateless pattern as `pop-openai-app`'s `mcpHandler.ts`.
  Entry points: `api/mcp.ts` (delegates to `src/mcpHandler.ts`), `api/health.ts`, `vercel.json`
  (rewrites `/mcp` → `/api/mcp`, `/` → `/api/health`).
- **Verified locally (2026-07-16)** by running the compiled `dist/mcpHandler.js` against a plain
  `node:http` server: missing/malformed `Authorization` → clean `401` with
  `error_code: "unauthorized_user"` before any POP API call; valid Bearer → MCP `initialize`
  succeeds. `npm run check` (new script, type-checks `src/` + `api/` together via
  `tsconfig.vercel.json` without touching the npm-publish `tsconfig.json`/`dist` layout) and
  `npm run build` both pass clean.
- **Not yet done**: `vercel link`/deploy itself (needs account access), live POP sandbox-key round
  trip, attaching the real `mcp.popapi.io` DNS/route, and the pre-public checklist (rate limiting,
  monitoring — both dashboard-level, no code). See `README.md`'s "Remote MCP (HTTP)" section for
  consumer-facing docs, and `mcp-and-openai-app-publishing-report.md` for the full step-by-step.
