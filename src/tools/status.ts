import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, handleApiError, getApiKey } from "../client.js";
import { API_ENDPOINTS, CHARACTER_LIMIT } from "../constants.js";
import type { NotificationsResponse, DocumentNotification } from "../types.js";

const GetInvoiceStatusSchema = z.object({
  uuid: z.string().uuid().describe("Invoice UUID returned by pop_create_sdi_invoice when submit_to_sdi=true"),
  response_format: z.enum(["markdown", "json"]).default("markdown")
    .describe("Output format: 'markdown' for human-readable, 'json' for structured data"),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

const GetPeppolDocumentSchema = z.object({
  uuid: z.string().uuid().describe("Peppol document UUID returned by pop_create_peppol_invoice when submit_to_peppol=true"),
  zone: z.string().length(2).optional()
    .describe("Country code of the Peppol access point zone (e.g. 'BE' for Belgium). Required for some countries."),
  response_format: z.enum(["markdown", "json"]).default("markdown"),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

const GetSdiDocumentSchema = z.object({
  uuid: z.string().uuid().describe("SdI document UUID to retrieve"),
  response_format: z.enum(["markdown", "json"]).default("markdown"),
  environment: z.string().optional().describe("Target environment (e.g. 'sandbox')"),
});

function formatNotifications(
  notifications: DocumentNotification[],
  uuid: string
): string {
  if (!notifications.length) {
    return `# SdI Status for Invoice ${uuid}\n\nNo notifications available yet. The invoice may still be processing. Try again in a few minutes.`;
  }

  const lines = [`# SdI Notifications for Invoice ${uuid}`, ""];
  lines.push(`Found **${notifications.length}** notification(s)`, "");

  for (const notif of notifications) {
    const statusEmoji =
      notif.status === "accepted" ? "✅" :
      notif.status === "rejected" ? "❌" :
      notif.status === "pending" ? "⏳" : "ℹ️";

    lines.push(`## ${statusEmoji} ${notif.type} — ${notif.status.toUpperCase()}`);
    lines.push(`- **Notification ID:** ${notif.id}`);
    lines.push(`- **Timestamp:** ${notif.timestamp}`);
    if (notif.details && Object.keys(notif.details).length > 0) {
      lines.push(`- **Details:**`);
      for (const [k, v] of Object.entries(notif.details)) {
        lines.push(`  - ${k}: ${JSON.stringify(v)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function registerStatusTools(server: McpServer): void {
  // ── Get Invoice Status (SdI Notifications) ───────────────────────────────
  server.registerTool(
    "pop_get_invoice_status",
    {
      title: "Get SdI Invoice Status",
      description: `Retrieve the SdI processing status and notifications for a submitted invoice.

After submitting an invoice to the Italian SdI (Sistema di Interscambio), the system processes it asynchronously and sends notifications. This tool polls the current status and all notifications.

SdI notification statuses:
  - pending: Invoice received, awaiting processing
  - accepted: Invoice accepted and delivered to recipient
  - rejected: Invoice rejected (check details for reason and correction steps)
  - delivery: Delivery notification received

Note: SdI processing can take from minutes to hours. If no notifications are returned, wait and retry.

Args:
  - uuid: The UUID returned by pop_create_sdi_invoice (when submit_to_sdi=true)
  - response_format: 'markdown' for readable output, 'json' for structured data`,
      inputSchema: GetInvoiceStatusSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<NotificationsResponse>(
          API_ENDPOINTS.documentNotifications,
          {
            license_key: getApiKey(),
            ...(params.environment ? { environment: params.environment } : {}),
            integration: { uuid: params.uuid },
          }
        );

        if (params.response_format === "json") {
          const text = JSON.stringify(result, null, 2);
          return {
            content: [{ type: "text", text }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        }

        const text = formatNotifications(result.notifications ?? [], params.uuid);
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

  // ── Get Peppol Document ───────────────────────────────────────────────────
  server.registerTool(
    "pop_get_peppol_document",
    {
      title: "Get Peppol Document",
      description: `Retrieve a Peppol document from the network by UUID.

After a Peppol invoice is submitted, use this tool to retrieve the processed document or check its delivery status on the Peppol network.

Args:
  - uuid: The Peppol document UUID from pop_create_peppol_invoice
  - zone: Country code for the Peppol access point (e.g. 'BE' for Belgium). Required for some regions.
  - response_format: Output format`,
      inputSchema: GetPeppolDocumentSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const integration: Record<string, string> = { uuid: params.uuid };
        if (params.zone) integration.zone = params.zone.toUpperCase();

        const result = await apiPost<unknown>(
          API_ENDPOINTS.peppolDocumentGet,
          {
            license_key: getApiKey(),
            ...(params.environment ? { environment: params.environment } : {}),
            integration,
          }
        );

        let text: string;
        if (typeof result === "string") {
          text = result;
        } else {
          text = JSON.stringify(result, null, 2);
        }

        if (text.length > CHARACTER_LIMIT) {
          text = text.substring(0, CHARACTER_LIMIT) + "\n\n[Response truncated — document exceeds character limit]";
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── Get SdI Document ─────────────────────────────────────────────────────
  server.registerTool(
    "pop_get_sdi_document",
    {
      title: "Get SdI Document",
      description: `Retrieve an SdI document from POP storage by UUID.

Fetches a previously submitted or preserved SdI (FatturaPA) document. Useful for auditing, re-downloading, or verifying stored invoices.

Requires: Growth+ plan with active SdI via POP integration.

Args:
  - uuid: The SdI document UUID
  - response_format: 'markdown' for readable summary, 'json' for raw data`,
      inputSchema: GetSdiDocumentSchema,
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
          API_ENDPOINTS.sdiDocumentGet,
          {
            license_key: getApiKey(),
            ...(params.environment ? { environment: params.environment } : {}),
            integration: { uuid: params.uuid },
          }
        );

        let text: string;
        if (typeof result === "string") {
          text = result;
        } else {
          text = JSON.stringify(result, null, 2);
        }

        if (text.length > CHARACTER_LIMIT) {
          text = text.substring(0, CHARACTER_LIMIT) + "\n\n[Response truncated]";
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );
}
