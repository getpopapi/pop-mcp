import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, handleApiError, getApiKey } from "../client.js";
import { API_ENDPOINTS } from "../constants.js";
import {
  InvoiceDataSchema,
  SdiIntegrationSchema,
  PeppolIntegrationSchema,
  WebhookIntegrationSchema,
  FattureIntegrationSchema,
} from "../schemas/invoice.js";
import type { CreateInvoiceResponse } from "../types.js";

const AnyIntegrationSchema = z.discriminatedUnion("use", [
  SdiIntegrationSchema,
  PeppolIntegrationSchema,
  WebhookIntegrationSchema,
  FattureIntegrationSchema,
]);

const CreateSdiInvoiceSchema = z.object({
  data: InvoiceDataSchema.describe("Full invoice data object"),
  submit_to_sdi: z.boolean().default(false)
    .describe("If true, automatically submits the invoice to the Italian SdI (Sistema di Interscambio). Requires active SdI via POP integration (Growth+ plan)."),
  integration: z.union([
    SdiIntegrationSchema,
    WebhookIntegrationSchema,
    FattureIntegrationSchema,
  ]).optional().describe("Integration configuration — use this to override the default behaviour or deliver via webhook/Fatture in Cloud. Overrides submit_to_sdi if set."),
  plugin_version: z.string().optional().describe("Caller application version"),
  site_title: z.string().optional().describe("Site/shop title"),
  site_url: z.string().url().optional().describe("Site/shop URL"),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

const CreatePeppolInvoiceSchema = z.object({
  data: InvoiceDataSchema.describe("Full invoice data object. Note: Peppol only supports company and freelance customer types."),
  submit_to_peppol: z.boolean().default(false)
    .describe("If true, automatically submits to the Peppol network. Requires active Peppol via POP integration."),
  integration: z.union([
    PeppolIntegrationSchema,
    WebhookIntegrationSchema,
  ]).optional().describe("Integration configuration override"),
  plugin_version: z.string().optional(),
  site_title: z.string().optional(),
  site_url: z.string().url().optional(),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

const CreatePdfInvoiceSchema = z.object({
  data: InvoiceDataSchema.describe("Full invoice data object. Must include data.pdf configuration for PDF-specific settings."),
  send_email: z.boolean().default(false)
    .describe("If true, emails the PDF to recipients in data.pdf.email_invoice.to (max 3 addresses, Basic+ plan required)."),
  plugin_version: z.string().optional(),
  site_title: z.string().optional(),
  site_url: z.string().url().optional(),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

function buildBasePayload(
  data: z.infer<typeof InvoiceDataSchema>,
  extras?: {
    plugin_version?: string;
    site_title?: string;
    site_url?: string;
    environment?: string;
  }
): Record<string, unknown> {
  return {
    license_key: getApiKey(),
    user_agent: "pop-mcp-server",
    user_agent_version: "1.0.0",
    ...(extras?.plugin_version ? { plugin_version: extras.plugin_version } : {}),
    ...(extras?.site_title ? { site_title: extras.site_title } : {}),
    ...(extras?.site_url ? { site_url: extras.site_url } : {}),
    ...(extras?.environment ? { environment: extras.environment } : {}),
    data,
  };
}

function formatInvoiceResponse(result: CreateInvoiceResponse): string {
  if (!result.success && !result.integration) {
    return JSON.stringify(result, null, 2);
  }
  const lines: string[] = ["# Invoice Created Successfully", ""];
  if (result.document_number) lines.push(`**Document Number:** ${result.document_number}`);
  if (result.message) lines.push(`**Status:** ${result.message}`);
  if (result.integration) {
    lines.push("", "## Submission Details");
    lines.push(`**UUID:** ${result.integration.uuid}`);
    lines.push(`**Status:** ${result.integration.status}`);
    lines.push(`**Type:** ${result.integration.type}`);
    lines.push("", "_Use `pop_get_invoice_status` with this UUID to track SdI processing._");
  }
  if (result.pdf_url) {
    lines.push("", `**PDF URL:** ${result.pdf_url}`);
  }
  return lines.join("\n");
}

export function registerInvoiceTools(server: McpServer): void {
  // ── Create SdI (FatturaPA XML) Invoice ───────────────────────────────────
  server.registerTool(
    "pop_create_sdi_invoice",
    {
      title: "Create SdI / FatturaPA Invoice (XML)",
      description: `Generate an Italian FatturaPA electronic invoice in XML format and optionally submit it to the SdI (Sistema di Interscambio).

This tool creates a compliant FatturaPA XML document that satisfies Italian e-invoicing regulations (D.Lgs. 127/2015). The invoice can be generated locally (XML only) or submitted directly to SdI for B2B/B2C delivery.

Key facts:
- Supports invoice types: TD01 (invoice) and TD04 (credit note)
- Customer types: private, company, freelance, pa (Public Administration)
- For Private customers: sdi_type must be '0000000' and tax_id_code (codice fiscale) is required
- For PA customers: use version='FPA12' and the 6-char PA office code as sdi_type
- VAT rates: 22%, 10%, 5%, 4%, 0% (with nature code required when 0%)
- Submission to SdI requires Growth+ plan with active SdI via POP integration

Returns: XML document string when not submitting, or JSON with UUID when submitting.

Args:
  - data: Complete invoice data (transmitter, supplier, customer, line items, payment)
  - submit_to_sdi: Set true to automatically submit to SdI (requires active integration)
  - integration: Override integration config (sdi-via-pop, pop-to-webhook, fatture-in-cloud)`,
      inputSchema: CreateSdiInvoiceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const integration =
          params.integration ??
          (params.submit_to_sdi ? { use: "sdi-via-pop" as const, action: "create" as const } : undefined);

        const payload = {
          ...buildBasePayload(params.data, {
            plugin_version: params.plugin_version,
            site_title: params.site_title,
            site_url: params.site_url,
            environment: params.environment,
          }),
          ...(integration ? { integration } : {}),
        };

        const result = await apiPost<string | CreateInvoiceResponse>(
          API_ENDPOINTS.createXml,
          payload
        );

        if (typeof result === "string") {
          return {
            content: [{ type: "text", text: result }],
          };
        }

        const text = formatInvoiceResponse(result as CreateInvoiceResponse);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Create Peppol (UBL) Invoice ───────────────────────────────────────────
  server.registerTool(
    "pop_create_peppol_invoice",
    {
      title: "Create Peppol / UBL Invoice",
      description: `Generate a Peppol e-invoice in UBL 2.1 format and optionally submit it to the Peppol network.

Peppol (Pan-European Public Procurement Online) enables cross-border B2B electronic invoicing across Europe. The API generates a compliant UBL 2.1 XML document.

Restrictions:
- Customer type must be 'company' or 'freelance' (Peppol does not support private individuals)
- Submission requires active Peppol via POP integration (Basic+ plan)
- The customer must have a valid Peppol participant ID

Returns: UBL XML string or JSON with UUID when submitting to the network.

Args:
  - data: Complete invoice data (customer_type must be 'company' or 'freelance')
  - submit_to_peppol: Set true to submit to Peppol network
  - integration: Override integration config`,
      inputSchema: CreatePeppolInvoiceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const integration =
          params.integration ??
          (params.submit_to_peppol ? { use: "peppol-via-pop" as const, action: "create" as const } : undefined);

        const payload = {
          ...buildBasePayload(params.data, {
            plugin_version: params.plugin_version,
            site_title: params.site_title,
            site_url: params.site_url,
            environment: params.environment,
          }),
          ...(integration ? { integration } : {}),
        };

        const result = await apiPost<string | CreateInvoiceResponse>(
          API_ENDPOINTS.createUbl,
          payload
        );

        if (typeof result === "string") {
          return { content: [{ type: "text", text: result }] };
        }

        const text = formatInvoiceResponse(result as CreateInvoiceResponse);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Create PDF Invoice ────────────────────────────────────────────────────
  server.registerTool(
    "pop_create_pdf_invoice",
    {
      title: "Create PDF Invoice",
      description: `Generate a PDF invoice with optional branding and email delivery.

Creates a printable PDF invoice. Can include company logo, custom footer, and billing/shipping addresses. The PDF can be emailed automatically to up to 3 recipients (Basic+ plan required for email).

Configuration via data.pdf:
  - invoice_html: '\"true\"' to generate HTML version
  - doc_type_title: Title shown on document (e.g. 'Invoice', 'Receipt', 'Credit Note')
  - logo_url: Company logo URL (HTTPS)
  - head.store_info_address: Supplier address displayed in header
  - head.billing: Customer billing address array
  - email_invoice.to: Array of up to 3 recipient emails (requires Basic+ plan)
  - email_invoice.from: Reply-to email address
  - footer_text: Custom footer message

Returns: PDF binary data or confirmation JSON with email delivery status.

Args:
  - data: Invoice data with data.pdf configuration populated
  - send_email: Set true to deliver PDF via email (requires email_invoice in data.pdf)`,
      inputSchema: CreatePdfInvoiceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const payload = buildBasePayload(params.data, {
          plugin_version: params.plugin_version,
          site_title: params.site_title,
          site_url: params.site_url,
          environment: params.environment,
        });

        const result = await apiPost<unknown>(API_ENDPOINTS.createPdf, payload);

        if (typeof result === "string") {
          return { content: [{ type: "text", text: result }] };
        }

        const output = result as Record<string, unknown>;
        const text =
          typeof output === "object"
            ? JSON.stringify(output, null, 2)
            : String(output);

        return {
          content: [{ type: "text", text }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );
}
