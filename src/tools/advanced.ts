import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, handleApiError, getApiKey } from "../client.js";
import { API_ENDPOINTS } from "../constants.js";

const VerifySdiDocumentSchema = z.object({
  uuid: z.string().uuid().describe("UUID of the SdI document draft to verify"),
}).strict();

const SendSdiDocumentSchema = z.object({
  uuid: z.string().uuid().describe("UUID of the pre-created SdI document draft to send"),
}).strict();

const PreserveDocumentSchema = z.object({
  uuid: z.string().uuid().describe("UUID of the SdI document to archive/preserve in long-term storage"),
}).strict();

const VerifyFiscalIdSchema = z.object({
  fiscal_id: z.string().min(11).max(16)
    .describe("Italian fiscal code (codice fiscale) to validate — 16 chars for individuals, 11 for companies"),
  first_name: z.string().optional().describe("First name (for individual validation)"),
  last_name: z.string().optional().describe("Last name (for individual validation)"),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Date of birth in YYYY-MM-DD format (for enhanced individual validation)"),
}).strict();

const VerifyCompanySchema = z.object({
  vat_number: z.string().min(1)
    .describe("VAT number to validate (with or without country prefix, e.g. 'IT12345678901' or '12345678901')"),
  country_code: z.string().length(2)
    .describe("ISO country code of the company (e.g. 'IT', 'DE', 'FR')"),
}).strict();

function formatVerificationResult(result: unknown, type: string): string {
  if (typeof result === "string") return result;

  const data = result as Record<string, unknown>;
  const lines = [`# ${type} Verification Result`, ""];

  if (data.success !== undefined) {
    lines.push(`**Status:** ${data.success ? "✅ Valid" : "❌ Invalid"}`);
  }
  if (data.message) lines.push(`**Message:** ${data.message}`);
  if (data.data && typeof data.data === "object") {
    lines.push("", "## Details");
    for (const [k, v] of Object.entries(data.data as Record<string, unknown>)) {
      lines.push(`- **${k}:** ${JSON.stringify(v)}`);
    }
  }
  return lines.join("\n");
}

export function registerAdvancedTools(server: McpServer): void {
  // ── Verify SdI Document (pre-submission validation) ───────────────────────
  server.registerTool(
    "pop_verify_sdi_document",
    {
      title: "Verify SdI Document",
      description: `Validate an SdI (FatturaPA) XML document for compliance before submission.

Use this tool to check if a previously created SdI document draft passes XML syntax validation and Italian e-invoicing compliance checks — without actually submitting it. This helps catch errors before they result in SdI rejections.

Common validation checks:
  - XML schema conformance
  - Fiscal code format
  - VAT number validity
  - Required field presence
  - Amount consistency

Requires: Growth+ plan with active SdI via POP integration and registered business.

Args:
  - uuid: UUID of the draft SdI document to verify`,
      inputSchema: VerifySdiDocumentSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<unknown>(
          API_ENDPOINTS.sdiDocumentVerify,
          {
            license_key: getApiKey(),
            integration: { uuid: params.uuid },
          }
        );

        const text = formatVerificationResult(result, "SdI Document");
        return {
          content: [{ type: "text", text }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Send SdI Document (manual send after draft creation) ─────────────────
  server.registerTool(
    "pop_send_sdi_document",
    {
      title: "Send SdI Document to SdI Network",
      description: `Send a pre-created SdI invoice draft to the Italian SdI (Sistema di Interscambio).

This is an advanced two-step workflow: first create a draft with pop_create_sdi_invoice (submit_to_sdi=false), optionally verify it with pop_verify_sdi_document, then submit it using this tool.

When to use this instead of submit_to_sdi on creation:
  - You want to review the generated XML before sending
  - You need to run validation checks first
  - You want a deferred submission workflow

Requires: Growth+ plan with active SdI via POP integration.

Args:
  - uuid: UUID of the draft SdI document to send`,
      inputSchema: SendSdiDocumentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<unknown>(
          API_ENDPOINTS.sdiDocumentSend,
          {
            license_key: getApiKey(),
            integration: { uuid: params.uuid },
          }
        );

        const lines = ["# SdI Document Sent", ""];
        if (typeof result === "object" && result !== null) {
          const data = result as Record<string, unknown>;
          if (data.success) lines.push("✅ Document successfully sent to SdI.");
          if (data.message) lines.push(`**Message:** ${data.message}`);
          if (data.integration && typeof data.integration === "object") {
            const integ = data.integration as Record<string, unknown>;
            if (integ.uuid) lines.push(`**UUID:** ${integ.uuid}`);
            if (integ.status) lines.push(`**Status:** ${integ.status}`);
          }
          lines.push("", "_Use `pop_get_invoice_status` with this UUID to track processing._");
        } else {
          lines.push(String(result));
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Preserve / Archive Document ───────────────────────────────────────────
  server.registerTool(
    "pop_preserve_document",
    {
      title: "Preserve / Archive SdI Document",
      description: `Archive an SdI document in long-term digital storage (conservazione sostitutiva).

Italian law requires electronic invoices to be preserved for 10 years. This tool archives a document in POP's certified digital storage system to meet legal preservation requirements.

Requires: Growth+ plan with active SdI via POP integration.

Args:
  - uuid: UUID of the SdI document to archive`,
      inputSchema: PreserveDocumentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<unknown>(
          API_ENDPOINTS.sdiDocumentPreserve,
          {
            license_key: getApiKey(),
            integration: { uuid: params.uuid },
          }
        );

        const text =
          typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);

        return {
          content: [{ type: "text", text }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Verify Italian Fiscal ID ──────────────────────────────────────────────
  server.registerTool(
    "pop_verify_fiscal_id",
    {
      title: "Verify Italian Fiscal ID (Codice Fiscale)",
      description: `Validate an Italian fiscal code (codice fiscale) using the SdI via POP service.

The Italian fiscal code is a 16-character alphanumeric code for individuals or 11-digit numeric code for companies. This tool checks structural validity and optionally cross-references personal data.

Format:
  - Individuals: 16 alphanumeric chars (e.g. 'RSSMRA80A01H501U')
  - Companies: 11 numeric digits (same as VAT number)

Use cases:
  - Validate fiscal codes before issuing invoices to Italian private individuals
  - Verify customer identity data matches official records

Requires: Active SdI via POP integration.

Args:
  - fiscal_id: The fiscal code to validate
  - first_name, last_name, birth_date: Optional for enhanced validation`,
      inputSchema: VerifyFiscalIdSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const payload: Record<string, unknown> = {
          license_key: getApiKey(),
          fiscal_id: params.fiscal_id,
        };
        if (params.first_name) payload.first_name = params.first_name;
        if (params.last_name) payload.last_name = params.last_name;
        if (params.birth_date) payload.birth_date = params.birth_date;

        const result = await apiPost<unknown>(
          API_ENDPOINTS.sdiVerifyFiscalId,
          payload
        );

        const text = formatVerificationResult(result, "Fiscal ID");
        return {
          content: [{ type: "text", text }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Verify Company (VAT validation) ──────────────────────────────────────
  server.registerTool(
    "pop_verify_company",
    {
      title: "Verify Company Registration / VAT Number",
      description: `Validate a company's VAT number and registration status via the SdI via POP service.

Performs validation of the company's VAT number against official registries. For EU companies, this can cross-reference the EU VIES system. Useful for B2B invoice compliance and customer data validation.

Args:
  - vat_number: VAT number to validate (e.g. 'IT12345678901' or '12345678901')
  - country_code: Company's country ISO code (e.g. 'IT', 'DE', 'FR')

Requires: Active SdI via POP integration.`,
      inputSchema: VerifyCompanySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<unknown>(
          API_ENDPOINTS.sdiVerifyCompany,
          {
            license_key: getApiKey(),
            vat_number: params.vat_number,
            country_code: params.country_code.toUpperCase(),
          }
        );

        const text = formatVerificationResult(result, "Company");
        return {
          content: [{ type: "text", text }],
          structuredContent: result as Record<string, unknown>,
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
