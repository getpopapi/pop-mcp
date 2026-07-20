# pop-mcp — Project Context for Claude

## What This Project Is

A **TypeScript MCP (Model Context Protocol) server** for the **POP Cloud API**, enabling LLMs (Claude, etc.) to generate, submit, and manage electronic invoices directly from AI assistants.

The server exposes invoice-generation, integration, status, validation, archival, and onboarding tools covering the maintained POP API surface, including SdI, Peppol, KSeF, ZUGFeRD, PDF, and Zoho.

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
    ├── invoices.ts       SdI, Peppol, PDF, KSeF, ZUGFeRD, and Zoho invoice actions
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
| `pop_create_ksef_invoice` | POST `/create-ksef-xml` | Any (KSeF setup for provider submission) |
| `pop_create_zugferd_invoice` | POST `/create-zugferd` | Any |
| `pop_sync_zoho_document` | POST `/integration/zoho/sync` | Zoho connector required |
| `pop_get_invoice_status` | POST `/sdi/document-notifications` | Any |
| `pop_get_peppol_document` | POST `/peppol/document-get` | Basic+ |
| `pop_get_sdi_document` | POST `/sdi/document-get` | Basic+ |
| `pop_verify_sdi_document` | POST `/sdi/document-verify` | Basic+ |
| `pop_preserve_document` | POST `/sdi/document-preserve` | Basic+ |

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

- [x] Invoice, integration, status, validation, archival, and onboarding tools implemented and registered
- [x] 5 onboarding tools implemented and registered (v1.1.0)
- [x] Full Zod schemas for invoice data validation
- [x] Build passes with zero TypeScript errors
- [x] Tools verified via `tools/list` MCP call
- [x] README updated with auth section, correct payload docs, brand consistency
- [x] Published to npm as `@getpopapi/pop-mcp@1.0.2`
- [x] Published to MCP Registry as `io.github.popapidev/pop-mcp`
- [x] Canonical payload structure documented in `rapidapi-endpoint-examples-v2.txt`
- [ ] Publish v1.2.0 to npm and MCP Registry
- [ ] Update `io.github.popapidev` → `io.github.getpopapi` once org membership is public
- [ ] Add evaluation questions (see `/root/.claude/skills/mcp-builder/reference/evaluation.md`)
- [ ] Update RapidAPI endpoint examples to v2 payload format

## Remote HTTP server (2026-07-13, pivoted to Vercel 2026-07-16)

Added a second transport alongside stdio: an HTTP server exposing the same tool set over
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
- `src/mcpServer.ts` — `createPopServer(ctx)` — is the single place both `src/cli.ts` (stdio,
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
- **Not yet done**: live POP sandbox-key round trip against the deployed endpoint, and the
  pre-public checklist (rate limiting, monitoring — both dashboard-level, no code). See
  `README.md`'s "Remote MCP (HTTP)" section for consumer-facing docs, and
  `mcp-and-openai-app-publishing-report.md` for the full step-by-step.

### Deploy crash saga — resolved (2026-07-17)

Every request to `mcp.popapi.io` 500'd with `FUNCTION_INVOCATION_FAILED` /
`Invalid export found in module ".../src/server.mjs". The default export must be a function or
server.` for several deploys, surviving multiple attempted fixes (guarding `main()` in the old
`index.ts`, renaming `index.ts` → `cli.ts`, `.vercelignore` excludes, scoping `vercel.json`'s
`functions` glob to `api/**/*.ts`, then pre-bundling `api/*.ts` into self-contained `.js` with
esbuild via `scripts/bundle-vercel-api.mjs`). None of it mattered because none of it was the actual
bug.

**Root cause**, found by reading the `vercel build` log line that every previous session had
scrolled past: `✓ Build complete — Using src/server.ts as the root entrypoint.` Vercel has a
zero-config feature ("Deploy Node servers with zero configuration") that auto-detects a file
literally named `server.ts`/`server.js` at the project root or in `src/` and deploys **that** as
the one and only Vercel Function, completely ignoring `api/`. This repo had `src/server.ts`
(exporting `createPopServer`, not a `.listen()`-ing server or a default-exported handler) — Vercel
grabbed it by filename convention, built it as the entrypoint, and it crashed on every path because
it doesn't match the shape Vercel expects. This is the same class of bug as the earlier
`index.ts` rename (also a bare filename convention collision, not a real code crash) — it just
took this long to notice because the fix-du-jour always looked plausible and the error message
never changed.

**First follow-up fix (incomplete)**: renamed `src/server.ts` → `src/mcpServer.ts` (updated the two
importers, `src/cli.ts` and `src/mcpHandler.ts`), on the theory that avoiding the filename
`server.ts` would be enough. Deployed and got a *different* error confirming the deeper cause:
```
Error: No entrypoint found in "/home/runner/work/pop-mcp/pop-mcp". Set package.json "main" to a
server file, or add one of: app.js, ..., index.js, ..., server.js, ..., main.js, ...,
src/app.js, ..., src/index.js, ..., src/server.js, ..., src/main.js, ...
```
This proved the project's Vercel **Framework Preset** itself is (or auto-detected as) their
"Node.js zero-config server" preset — not "Other" — so it was *unconditionally* requiring one of
`app|index|server|main.{js,ts,...}` (root or `src/`) as a server entrypoint, regardless of `api/`
or `vercel.json`. With `src/server.ts` present, it grabbed that file and crashed on its shape. With
it renamed away, the preset had nothing to grab and failed the build outright. Renaming alone can
never fix this — there was always going to be *some* file Vercel would either misuse or complain
about, because the preset itself was wrong for this project.

**Second fix**: `vercel.json` → `"framework": null`. Per Vercel's docs, this is literally how you
pin the Framework Preset to **"Other"** from config (the dashboard-level Framework Preset dropdown
otherwise wins) — plain `api/`-directory Serverless Functions, zero root-entrypoint detection of any
kind. This stopped the crash, but produced a new build-time error:
```
Error: No Output Directory named "public" found after the Build completed. Update
vercel.json#outputDirectory to ensure the correct output directory is generated.
```
The "Other" framework preset defaults to expecting a static-site output directory named `public/`
(the classic zero-config static-site convention), and since `buildCommand` is a no-op (this project
has no static frontend, only `api/` functions), that directory never gets created.

**Third fix (the actual complete one)**: added a physical, git-tracked `public/.gitkeep` (empty
placeholder — deliberately not `index.html`, to avoid it ever shadowing the `"/"` → `/api/health`
rewrite) plus `"outputDirectory": "public"` in `vercel.json` for explicitness. Since the directory
already exists on disk from the checkout (not generated by `buildCommand`), Vercel's "Other" preset
is satisfied without needing any real static build step.

Combined with the `src/mcpServer.ts` rename (harmless, kept) and the
`scripts/bundle-vercel-api.mjs` esbuild pre-bundling step (also harmless, also kept — makes the
deployed function smaller/more predictable), this should be the complete fix.

**Lesson for next time a Vercel deploy crashes mysteriously**: read the full `vercel build` output
line by line before touching code — it explicitly names what it decided to treat as the entrypoint
or framework, and later, what output directory it expected. Don't infer the cause from the runtime
crash message alone, and don't stop at the first plausible-looking fix — confirm the *build log*
after every attempt, since Vercel tends to fail one requirement at a time rather than reporting
everything up front.
