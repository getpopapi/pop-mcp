# pop-mcp

MCP (Model Context Protocol) server for **POP** — enabling LLMs to generate, submit, and manage Italian e-invoices (FatturaPA/SdI), Peppol invoices, and PDF invoices directly from AI assistants.

> **npm:** `@getpopapi/pop-mcp`

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)

---

## What is POP?

[POP](https://popapi.io) is a cloud service for electronic invoice generation and delivery, supporting:

- 🇮🇹 **Italian e-invoicing (FatturaPA/SdI)** — compliant with D.Lgs. 127/2015
- 🇪🇺 **Peppol** — pan-European cross-border B2B invoicing (UBL 2.1)
- 📄 **PDF invoices** — branded, with email delivery
- ✅ **Validation** — fiscal codes, VAT numbers, document pre-submission checks
- 🗄️ **Preservation** — Italian legal archival (conservazione sostitutiva)

---

## Tools Available (8 total)

### Invoice Creation
| Tool | Endpoint | Plan |
|------|----------|------|
| `pop_create_sdi_invoice` | POST `/create-xml` | Any |
| `pop_create_peppol_invoice` | POST `/create-ubl` | Any (Basic+ to submit) |
| `pop_create_pdf_invoice` | POST `/create-pdf` | Any (Basic+ for email) |

### Status & Retrieval
| Tool | Endpoint | Plan |
|------|----------|------|
| `pop_get_invoice_status` | POST `/sdi-via-pop/document-notifications` | Any |
| `pop_get_peppol_document` | POST `/peppol/document-get` | Basic+ |
| `pop_get_sdi_document` | POST `/sdi-via-pop/document-get` | Basic+ |

### Validation & Advanced SdI
| Tool | Endpoint | Plan |
|------|----------|------|
| `pop_verify_sdi_document` | POST `/sdi-via-pop/document-verify` | Basic+ |
| `pop_preserve_document` | POST `/sdi-via-pop/document-preserve` | Basic+ |

---

## Prerequisites

- Node.js >= 18
- A [POP](https://popapi.io) license key
- For SdI/Peppol submission: active integration on your POP account (Basic/Growth plan)

---

## Authentication

### Get Your License Key

> **New to POP?** Visit [popapi.io](https://popapi.io) to create your account and get your license key.

API-only users can activate their account and obtain a `license_key` with this flow:

1. Open [https://popapi.io/otp-login/](https://popapi.io/otp-login/)
2. Enter your email address
3. Receive a one-time password (OTP) by email and enter it
4. Complete the configuration wizard
5. Open [https://popapi.io/](https://popapi.io/) → **Account > API**
6. Copy the default generated `license_key`

### Key Management

- Your account includes one default `license_key`, visible under **Account > API**
- You can generate additional keys linked to the same account from that same page
- Every `license_key` must be treated as a secret credential — do not commit it to source control

### Recommended First Steps

1. Get your `license_key`
2. Test it with `GET /account-profile`
3. Send one document-generation request with a real payload
4. Add optional delivery integrations only after local generation works

---

## Installation

### From npm (recommended)

```bash
npm install -g @getpopapi/pop-mcp
```

### From Source

```bash
git clone https://github.com/getpopapi/pop-mcp
cd pop-mcp
npm install
npm run build
```

---

## Configuration

Set your POP license key as an environment variable:

```bash
export POP_API_KEY=your_license_key_here
```

Optional — use the staging environment:

```bash
export POP_ENVIRONMENT=staging
```

---

## Claude Desktop Setup

Add to your `claude_desktop_config.json`:

**If installed from npm:**

```json
{
  "mcpServers": {
    "pop": {
      "command": "pop-mcp",
      "env": {
        "POP_API_KEY": "your_license_key_here"
      }
    }
  }
}
```

**If running from source:**

```json
{
  "mcpServers": {
    "pop": {
      "command": "node",
      "args": ["/path/to/pop-mcp/dist/index.js"],
      "env": {
        "POP_API_KEY": "your_license_key_here"
      }
    }
  }
}
```

**Config file locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

---

## Remote MCP (HTTP)

`pop-mcp` is also available as a remote, generic MCP server at:

```
https://mcp.popapi.io/mcp
```

This is a shared, multi-tenant endpoint — unlike the stdio path above, it does **not** read
`POP_API_KEY` from the server's environment. Every request must carry your own POP license key as
a Bearer token:

```
Authorization: Bearer <your_license_key>
```

Any MCP-speaking HTTP client can connect: Claude (remote connector), the OpenAI Responses API,
n8n, [MCP Inspector](https://github.com/modelcontextprotocol/inspector), or a custom integration —
not just Claude Desktop. All 13 tools (8 invoice/status/advanced + 5 onboarding) are available;
onboarding tools use their own `onboarding_token` per call and don't require the Bearer key.

**Example with MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector
```

Configure it to connect to `https://mcp.popapi.io/mcp` with header
`Authorization: Bearer <your_license_key>`.

**Example with curl** (`tools/list` — every request requires the Bearer header, including this one):

```bash
curl -X POST https://mcp.popapi.io/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer your_license_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A missing or malformed `Authorization` header returns a `401` with `error_code: "unauthorized_user"`
before any POP API call is made. An invalid-but-well-formed key is passed straight through to POP's
API and surfaces whatever error POP returns (`unauthorized_user`, `insufficient_level`, etc.) — the
worker does not re-validate keys itself.

To run/deploy the Worker yourself:

```bash
npm run dev:worker     # wrangler dev, local
npm run deploy:worker  # wrangler deploy
```

---

## Tool Reference

The `license_key` is always injected automatically from `POP_API_KEY` — never pass it manually.

### `pop_create_sdi_invoice`

Generate an Italian FatturaPA XML document. Optionally submit it to the SdI (Sistema di Interscambio).

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | object | ✅ | Full invoice data (see Invoice Data Structure) |
| `submit_to_sdi` | boolean | — | Set `true` to submit to SdI. Requires Basic+ plan with active SdI integration. Default: `false` |
| `integration` | object | — | Override integration config. Overrides `submit_to_sdi` if set. |
| `environment` | string | — | Target environment (e.g. `"sandbox"`) |

**Integration options for `integration.use`:**
- `"sdi-via-pop"` or `"sdi"` — Submit via POP SdI
- `"pop-to-webhook"` — Deliver to a webhook (requires `id`)
- `"fatture-in-cloud"` — Deliver to Fatture in Cloud

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "user_agent": "pop-mcp",
  "user_agent_version": "1.0.0",
  "data": { "...invoice fields..." },
  "integration": { "use": "sdi-via-pop", "action": "create" }
}
```

> `integration` is omitted when `submit_to_sdi` is `false` and no override is provided (XML-only generation).

---

### `pop_create_peppol_invoice`

Generate a Peppol UBL 2.1 document. Optionally submit it to the Peppol network.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | object | ✅ | Full invoice data. `customer_type` must be `"company"` or `"freelance"` |
| `submit_to_peppol` | boolean | — | Set `true` to submit to the Peppol network. Requires Basic+ plan. Default: `false` |
| `integration` | object | — | Override integration config |
| `environment` | string | — | Target environment |

**Integration options for `integration.use`:**
- `"peppol-via-pop"` or `"peppol"` — Submit via POP Peppol
- `"pop-to-webhook"` — Deliver to a webhook (requires `id`)

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "user_agent": "pop-mcp",
  "user_agent_version": "1.0.0",
  "data": { "...invoice fields..." },
  "integration": { "use": "peppol-via-pop", "action": "create" }
}
```

---

### `pop_create_pdf_invoice`

Generate a branded PDF invoice. Optionally email it to up to 3 recipients.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | object | ✅ | Invoice data. Must include `data.pdf` for PDF-specific settings |
| `send_email` | boolean | — | Set `true` to email the PDF (requires `data.pdf.email_invoice`, Basic+ plan). Default: `false` |
| `environment` | string | — | Target environment |

**`data.pdf` fields:**

| Field | Description |
|-------|-------------|
| `doc_type_title` | Title shown on document (e.g. `"Invoice"`, `"Receipt"`) |
| `logo_url` | Company logo URL (HTTPS) |
| `head.store_info_address` | Supplier address string in header |
| `head.billing[]` | Customer billing address array |
| `head.shipping[]` | Shipping address array (optional) |
| `email_invoice.to` | Up to 3 recipient email addresses |
| `email_invoice.from` | Reply-to address |
| `footer_text` | Custom footer message |
| `total_tax` | Total tax amount as string |

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "user_agent": "pop-mcp",
  "user_agent_version": "1.0.0",
  "data": {
    "...invoice fields...",
    "pdf": {
      "doc_type_title": "Invoice",
      "logo_url": "https://example.com/logo.png",
      "head": { "store_info_address": "Via Roma 1, 00100 Roma IT", "billing": [] },
      "total_tax": "22.00",
      "email_invoice": { "to": ["customer@example.com"] }
    }
  }
}
```

---

### `pop_get_invoice_status`

Retrieve the SdI processing status and notifications for a submitted invoice.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string (UUID) | ✅ | Invoice UUID returned by `pop_create_sdi_invoice` when `submit_to_sdi=true` |
| `response_format` | `"markdown"` \| `"json"` | — | Output format. Default: `"markdown"` |
| `environment` | string | — | Target environment |

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "integration": { "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
}
```

**SdI notification statuses:** `pending` · `accepted` · `rejected` · `delivery`

> SdI processing is asynchronous and can take minutes to hours. Retry if no notifications are returned yet.

---

### `pop_get_peppol_document`

Retrieve a Peppol document from the network by UUID.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string (UUID) | ✅ | Peppol document UUID from `pop_create_peppol_invoice` |
| `zone` | string (2 chars) | — | Country code of the Peppol access point (e.g. `"BE"` for Belgium). Required for some regions. |
| `response_format` | `"markdown"` \| `"json"` | — | Output format. Default: `"markdown"` |
| `environment` | string | — | Target environment |

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "integration": { "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "zone": "IT" }
}
```

> `zone` is omitted from the payload if not provided.

---

### `pop_get_sdi_document`

Retrieve an archived SdI (FatturaPA) document from POP storage by UUID.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string (UUID) | ✅ | SdI document UUID |
| `response_format` | `"markdown"` \| `"json"` | — | Output format. Default: `"markdown"` |
| `environment` | string | — | Target environment |

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "integration": { "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
}
```

Requires: Basic+ plan with active SdI integration.

---

### `pop_verify_sdi_document`

Validate an SdI XML document for compliance before submission. Does not submit the document.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `xml_base64` | string | ✅ | The SdI XML document encoded as a Base64 string |
| `environment` | string | — | Target environment |

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "skip_business_check": true,
  "integration": { "xml": "<base64-encoded-xml-string>" }
}
```

**Validation checks performed:** XML schema conformance · fiscal code format · VAT number validity · required field presence · amount consistency

Requires: Basic+ plan with active SdI integration and registered business.

---

### `pop_preserve_document`

Archive an SdI document in certified long-term digital storage (conservazione sostitutiva). Italian law requires invoices to be preserved for 10 years.

**MCP inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uuid` | string (UUID) | ✅ | UUID of the SdI document to archive |
| `environment` | string | — | Target environment |

**API payload sent:**

```json
{
  "license_key": "YOUR_LICENSE_KEY",
  "integration": { "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
}
```

> **Important:** Only call this tool when `pop_get_invoice_status` returns status `RC` (Ricevuta di Consegna) or `MC` (Mancata Consegna). Do not call for statuses `NS`, `EC`, `SE`, or `DT`.

Requires: Basic+ plan with active SdI integration.

---

## Usage Examples

### Generate a Simple Italian Invoice (XML Only)

Ask your AI assistant:

> "Create a FatturaPA invoice for 1000€ + 22% VAT to Rossi SRL (VAT IT12345678901, Milan). My company is Bianchi SRL (VAT IT98765432109, Rome), using payment method bank transfer to IBAN IT60X0542811101000000123456."

### Submit Invoice to SdI

> "Create and submit to SdI an invoice #45 for consulting services, 500€ + 22% VAT to customer Mario Rossi (fiscal code RSSMRA80A01H501U) in Rome."

### Check Invoice Status After Submission

> "What's the status of SdI invoice with UUID abc123-def456-...?"

### Generate PDF with Email Delivery

> "Create a PDF invoice for order #123 and email it to customer@example.com."

### Verify SdI Document Before Sending

> "Verify SdI document with UUID abc123-... for compliance before submission."

---

## Plan Requirements

| Feature | Free | Basic/Growth | Pro |
|---------|------|-------------|-----|
| XML generation (local) | ✅ | ✅ | ✅ |
| PDF generation | ✅ | ✅ | ✅ |
| SdI submission | ❌ | ✅ | ✅ |
| Peppol submission | ❌ | ✅ | ✅ |
| PDF email delivery | ❌ | ✅ | ✅ |
| SdI document verification | ❌ | ✅ | ✅ |
| Document preservation | ❌ | ✅ | ✅ |

---

## Testing

### MCP Inspector (Interactive)

```bash
npm run inspector
# or
npx @modelcontextprotocol/inspector dist/index.js
```

### Quick Smoke Test

```bash
POP_API_KEY=your_key node -e "
import('./dist/index.js').catch(e => {
  if (e.message.includes('stdin')) process.exit(0);
  console.error(e); process.exit(1);
});
"
```

### Test Tool Schema Listing

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | POP_API_KEY=test node dist/index.js
```

---

## Development

```bash
# Run with auto-reload
npm run dev

# Build
npm run build

# Clean build artifacts
npm run clean
```

---

## Invoice Data Structure

The `data` parameter for invoice creation follows the FatturaPA structure:

```
data
├── id                    Invoice/order ID (numeric)
├── filename              Output filename without extension (e.g. 'IT99900088876_00009')
├── type                  "invoice" | "credit_note"
├── version               "FPR12" | "FPA12"
├── sdi_type              7-char SDI code ('0000000' for private individuals)
├── customer_type         "private" | "company" | "freelance" | "pa"
├── nature                VAT exemption code (required when rate is 0%, e.g. 'N2.1', 'N6.1')
├── transmitter_data
│   ├── transmitter_id    { country_id, id_code }
│   ├── progressive       Transmission progressive ID (e.g. '00001')
│   ├── transmitter_format  "FPR12" | "FPA12"
│   ├── sdi_code          7-char code
│   ├── transmitter_contact { phone, email }
│   └── recipient_pec     PEC email (alternative to sdi_code)
├── transfer_lender       Supplier/seller
│   ├── personal_data     { tax_id_vat: { country_id, id_code, tax_regime }, company_name }
│   ├── place             { address, zip_code, city, province_id, country_id }
│   └── contact           { phone, email }
├── transferee_client     Customer/buyer
│   ├── personal_data     { tax_id_vat, tax_id_code (fiscal code for IT private), company_name }
│   └── place             { address, zip_code, city, province_id, country_id }
├── invoice_body
│   ├── general_data      { doc_type (TD01|TD04), date (YYYY-MM-DD), invoice_number, currency }
│   └── total_document_amount
├── order_items[]
│   ├── description, quantity, unit
│   ├── unit_price, total_price
│   ├── rate              VAT rate as string (e.g. '22.00')
│   ├── total_tax         VAT amount (number)
│   └── item_type         "product" | "shipping" | "fee"
├── payment_data
│   ├── terms_payment     TP01 (instalment) | TP02 (full) | TP03 (advance)
│   ├── payment_details   MP01 (Cash) | MP02 (Check) | MP05 (Bank Transfer) | MP08 (Credit Card) | ...
│   ├── payment_amount
│   ├── beneficiary       Required for MP05 (bank transfer)
│   ├── financial_institution  Required for MP05
│   └── iban              Required for MP05
├── purchase_order_data   (optional) { id, date }
├── connected_invoice_data[]  (required for credit notes) { id, date }
├── overrides             (optional) { language, bollo_force_apply }
└── pdf                   (only for pop_create_pdf_invoice)
    ├── doc_type_title
    ├── logo_url
    ├── head              { store_info_address, billing[], shipping[] }
    ├── total_tax
    ├── email_invoice     { to[] (max 3), from }
    └── footer_text
```

---

## Error Reference

| Error Code | Meaning | Solution |
|-----------|---------|---------|
| `unauthorized_user` | Invalid license key | Check `POP_API_KEY` |
| `insufficient_level` | Plan too low | Upgrade POP plan |
| `business_not_registered` | No business profile | Register on popapi.io |
| `integration_inactive` | SdI/Peppol not enabled | Activate on popapi.io |
| `pop_api_email_limit` | >3 email recipients | Reduce to max 3 |
| `pop_api_email_not_allowed` | Plan doesn't allow email | Upgrade to Basic+ |

---

## Related Projects

- [n8n-nodes-pop](https://github.com/getpopapi/n8n-nodes-pop) — n8n community nodes for POP
- [POP](https://popapi.io) — Official website
- [API Documentation](https://documenter.getpostman.com/view/41622997/2sAYkLmGT8) — Postman docs

---

## License

MIT © [getpopapi](https://github.com/getpopapi)
