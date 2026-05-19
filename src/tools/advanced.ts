import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, handleApiError, getApiKey } from "../client.js";
import { API_ENDPOINTS } from "../constants.js";

const VerifySdiDocumentSchema = z.object({
  xml_base64: z.string().describe("The SdI XML document encoded as a Base64 string"),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

const PreserveDocumentSchema = z.object({
  uuid: z.string().uuid().describe("UUID of the SdI document to archive/preserve in long-term storage"),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

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

Use this tool to check if an SdI XML document passes XML syntax validation and Italian e-invoicing compliance checks — without actually submitting it. This helps catch errors before they result in SdI rejections.

Common validation checks:
  - XML schema conformance
  - Fiscal code format
  - VAT number validity
  - Required field presence
  - Amount consistency

Requires: Growth+ plan with active SdI via POP integration and registered business.

Args:
  - xml_base64: The SdI XML document encoded as a Base64 string`,
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
            skip_business_check: true,
            ...(params.environment ? { environment: params.environment } : {}),
            integration: { xml: params.xml_base64 },
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

  // ── Preserve / Archive Document ───────────────────────────────────────────
  server.registerTool(
    "pop_preserve_document",
    {
      title: "Preserve / Archive SdI Document",
      description: `Archive an SdI document in long-term digital storage (conservazione sostitutiva).

Italian law requires electronic invoices to be preserved for 10 years. This tool archives a document in POP's certified digital storage system to meet legal preservation requirements.

IMPORTANT: Only call this tool when pop_get_invoice_status returns a status of RC (Ricevuta di Consegna — successfully delivered) or MC (Mancata Consegna — delivery failed but SdI accepted). Do NOT call for other statuses such as NS, EC, SE, or DT.

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
            ...(params.environment ? { environment: params.environment } : {}),
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

}
