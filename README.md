# pop-mcp-server

MCP (Model Context Protocol) server for the **POP Cloud API** — enabling LLMs to generate, submit, and manage Italian e-invoices (FatturaPA/SdI), Peppol invoices, and PDF invoices directly from AI assistants.

> **npm:** `@getpopapi/pop-mcp-server`

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)

---

## What is POP Cloud API?

[POP Cloud API](https://popapi.io) is a REST API for electronic invoice generation and delivery, supporting:

- 🇮🇹 **Italian e-invoicing (FatturaPA/SdI)** — compliant with D.Lgs. 127/2015
- 🇪🇺 **Peppol** — pan-European cross-border B2B invoicing (UBL 2.1)
- 📄 **PDF invoices** — branded, with email delivery
- ✅ **Validation** — fiscal codes, VAT numbers, document pre-submission checks
- 🗄️ **Preservation** — Italian legal archival (conservazione sostitutiva)

---

## Tools Available (8 total)

### Invoice Creation
| Tool | Description |
|------|-------------|
| `pop_create_sdi_invoice` | Generate Italian FatturaPA XML; optionally submit to SdI |
| `pop_create_peppol_invoice` | Generate Peppol UBL 2.1 XML; optionally submit to network |
| `pop_create_pdf_invoice` | Generate branded PDF; optionally email to recipients |

### Status & Retrieval
| Tool | Description |
|------|-------------|
| `pop_get_invoice_status` | Poll SdI notifications/status for a submitted invoice |
| `pop_get_peppol_document` | Retrieve a Peppol document from the network |
| `pop_get_sdi_document` | Retrieve an archived SdI document by UUID |

### Validation & Advanced SdI
| Tool | Description |
|------|-------------|
| `pop_verify_sdi_document` | Pre-submission XML compliance check |
| `pop_preserve_document` | Archive document in certified long-term storage |

---

## Prerequisites

- Node.js >= 18
- A [POP API](https://popapi.io) license key
- For SdI/Peppol submission: active integration on your POP account (Basic/Growth plan)

---

## Installation

### From npm (recommended)

```bash
npm install -g @getpopapi/pop-mcp-server
```

### From Source

```bash
git clone https://github.com/getpopapi/pop-mcp-server
cd pop-mcp-server
npm install
npm run build
```

---

## Configuration

Set your POP API license key as an environment variable:

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
      "command": "pop-mcp-server",
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
      "args": ["/path/to/pop-mcp-server/dist/index.js"],
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
| SdI document verification | ❌ | ✅ Growth+ | ✅ |
| Document preservation | ❌ | ✅ Growth+ | ✅ |

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
├── id                    Invoice/order ID
├── filename              Output filename
├── type                  "invoice" | "credit_note"
├── version               "FPR12" | "FPA12"
├── sdi_type              7-char SDI code
├── customer_type         "private" | "company" | "freelance" | "pa"
├── transmitter_data      Who transmits the invoice
│   ├── transmitter_id    Country + VAT
│   ├── progressive       Transmission progressive ID
│   ├── transmitter_format
│   ├── sdi_code
│   └── transmitter_contact
├── transfer_lender       Supplier/seller info
│   ├── personal_data     + tax_regime
│   ├── place             Address
│   └── contact
├── transferee_client     Customer/buyer info
│   ├── personal_data     + tax_id_code (fiscal code for IT private)
│   └── place
├── invoice_body
│   ├── general_data      doc_type, date, number, currency
│   └── total_document_amount
├── order_items[]         Line items with VAT
├── payment_data          Payment method + terms
├── purchase_order_data   (optional) PO reference
├── connected_invoice_data[] (required for credit notes)
└── pdf                   (for PDF creation only)
    ├── doc_type_title
    ├── logo_url
    ├── head              billing/shipping addresses
    ├── email_invoice     to[], from
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

- [n8n-nodes-pop](https://github.com/getpopapi/n8n-nodes-pop) — n8n community nodes for POP API
- [POP Cloud API](https://popapi.io) — Official website
- [API Documentation](https://documenter.getpostman.com/view/41622997/2sAYkLmGT8) — Postman docs

---

## License

MIT © [getpopapi](https://github.com/getpopapi)
