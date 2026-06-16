import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiOnboardingPost, apiOnboardingGet, handleApiError } from "../client.js";
import { ONBOARDING_ENDPOINTS } from "../constants.js";
import type {
  OnboardingApiResponse,
  OnboardingRequestOtpData,
  OnboardingVerifyOtpData,
  OnboardingWizardPayload,
} from "../types.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const RequestOtpSchema = z.object({
  email: z.string().email().describe("Email address to send the OTP to. If the account does not exist it will be created automatically."),
  lang: z.string().optional().describe("Locale hint (e.g. 'en', 'it'). Stored in the session context but does not affect response language."),
});

const VerifyOtpSchema = z.object({
  email: z.string().email().describe("Must match the email used in pop_onboarding_request_otp"),
  otp: z.string().describe("6-digit OTP from the request-otp response (or the administrator password for admin accounts)"),
  platform: z.string().default("mcp").describe("Client identifier recorded in the session. Default: 'mcp'"),
  site_id: z.string().optional().describe("Optional caller site domain or identifier"),
});

const OnboardingTokenSchema = z.object({
  onboarding_token: z.string().describe("Token returned by pop_onboarding_verify_otp. Expires 30 minutes after issue."),
});

const ConfigurationsSchema = z.object({
  general_store_country: z.string().optional().describe("ISO 3166-1 alpha-2 country code (e.g. IT, DE, BE). Determines wizard_variant and available integrations. Locked after first save."),
  general_store_your_name: z.string().optional().describe("Account holder first name"),
  general_store_your_surname: z.string().optional().describe("Account holder last name"),
  general_store_company_name: z.string().optional().describe("Legal company name"),
  general_store_vat_number: z.string().optional().describe("VAT number (format validated per country). Must be unique on the target environment — 422 if already in use."),
  general_store_tax_regime: z.string().optional().describe("Tax regime code (e.g. RF01). Required for IT/SM accounts. Use lookup.tax_regimes from get_account_setup to find valid values."),
  company_technical_email: z.string().email().optional().describe("Technical/notifications email"),
  company_accounting_email: z.string().email().optional().describe("Accounting/billing email"),
  general_store_phone: z.string().optional().describe("Company phone number"),
  general_store_email: z.string().email().optional().describe("Company public email"),
  use_national_id: z.union([z.literal(0), z.literal(1)]).optional()
    .describe("Set to 1 if general_store_vat_number contains a national tax ID instead of a VAT number. Not supported for IT, SM, GB, PL."),
  active_sdipop_integration: z.union([z.literal(0), z.literal(1)]).optional()
    .describe("Set to 1 to activate SdI via POP. Only valid for IT/SM accounts. Mutually exclusive with active_peppol_integration."),
  business_apply_signature: z.union([z.literal(0), z.literal(1)]).optional()
    .describe("Set to 1 to enable electronic signature with SdI"),
  business_apply_legal_storage: z.union([z.literal(0), z.literal(1)]).optional()
    .describe("Set to 1 to enable certified long-term storage (conservazione sostitutiva) with SdI"),
  active_peppol_integration: z.union([z.literal(0), z.literal(1)]).optional()
    .describe("Set to 1 to register a Peppol legal entity. Mutually exclusive with active_sdipop_integration. Requires peppol_* fields."),
  peppol_identifier_scheme: z.string().optional()
    .describe("Required when active_peppol_integration=1. Use lookup.peppol.endpoint_scheme_options from get_account_setup for valid values."),
  peppol_endpoint_identifier_value: z.string().optional()
    .describe("Required when active_peppol_integration=1. Format: '<scheme>:<value>' e.g. '9925:0123456789'"),
  peppol_le_address: z.string().optional().describe("Peppol legal entity street address. Required when active_peppol_integration=1."),
  peppol_le_city: z.string().optional().describe("Peppol legal entity city. Required when active_peppol_integration=1."),
  peppol_le_zipcode: z.string().optional().describe("Peppol legal entity zip/postal code. Required when active_peppol_integration=1."),
});

const SaveAccountSetupSchema = z.object({
  onboarding_token: z.string().describe("Token returned by pop_onboarding_verify_otp. Expires 30 minutes after issue."),
  environment: z.enum(["live", "sandbox"]).default("live")
    .describe("Which POP environment to configure. 'live' affects your production account; 'sandbox' is for testing."),
  configurations: ConfigurationsSchema.describe("Account setup fields. Send only the fields you want to set. Locked fields (field_locks=true) cannot be changed."),
});

// ── Formatters ────────────────────────────────────────────────────────────────

function formatRequestOtpResponse(data: OnboardingRequestOtpData): string {
  const lines = ["# OTP Request Result", ""];

  if (data.administrator_requires_password) {
    lines.push("**Status:** Administrator account — no OTP issued");
    lines.push("**Action required:** Use your administrator password as the `otp` field in `pop_onboarding_verify_otp`");
  } else {
    lines.push(`**Status:** ${data.state}`);
    if (data.otp_code) {
      lines.push("", `> **OTP Code: \`${data.otp_code}\`** — expires in 10 minutes`);
      lines.push("", "_Copy this code and pass it to `pop_onboarding_verify_otp`._");
    }
    if (data.email_delivery_success) {
      lines.push("", "An OTP was also sent to the email address.");
    }
  }

  lines.push("", "---");
  lines.push(`- **Email:** ${data.email}`);
  lines.push(`- **Account:** ${data.existing_user ? "Existing user" : "New account created"}`);
  if (data.lang) lines.push(`- **Language:** ${data.lang}`);

  return lines.join("\n");
}

function formatVerifyOtpResponse(data: OnboardingVerifyOtpData): string {
  const lines = ["# Authentication Result", ""];

  if (!data.authenticated) {
    lines.push("**Authentication failed.**");
    return lines.join("\n");
  }

  lines.push("**Authenticated successfully.**", "");
  lines.push(`> **Onboarding Token: \`${data.onboarding_token}\`**`);
  lines.push(`> Expires: ${data.token_expires_at}`);
  lines.push("", "_Save this token — pass it to `pop_onboarding_get_status`, `pop_onboarding_get_account_setup`, and `pop_onboarding_save_account_setup`._");
  lines.push("", "---");
  lines.push(`- **State:** ${data.state}`);
  lines.push(`- **Next action:** ${data.next_action}`);
  lines.push(`- **Wizard required:** ${data.wizard_required}`);
  lines.push(`- **Wizard variant:** ${data.wizard_variant || "basic (country not yet set)"}`);
  lines.push(`- **Platform:** ${data.platform}`);

  if (data.wizard_required && data.required_fields.length > 0) {
    lines.push("", "**Required fields still missing:**");
    for (const f of data.required_fields) lines.push(`  - \`${f}\``);
    lines.push("", "_Call `pop_onboarding_get_account_setup` then `pop_onboarding_save_account_setup` to complete setup._");
  } else if (!data.wizard_required) {
    lines.push("", "Account setup is already complete. No further wizard steps needed.");
  }

  return lines.join("\n");
}

function formatStatusResponse(data: Record<string, unknown>): string {
  const lines = ["# Onboarding Status", ""];
  lines.push(`- **State:** ${data.state}`);
  lines.push(`- **Next action:** ${data.next_action}`);
  lines.push(`- **Wizard required:** ${data.wizard_required}`);
  lines.push(`- **Wizard completed:** ${data.wizard_completed}`);
  lines.push(`- **Wizard variant:** ${data.wizard_variant || "basic"}`);
  lines.push(`- **Country:** ${data.country || "(not set)"}`);

  const required = data.required_fields as string[] | undefined;
  if (required && required.length > 0) {
    lines.push("", "**Missing required fields:**");
    for (const f of required) lines.push(`  - \`${f}\``);
  }

  const stepVis = data.step_visibility as Record<string, boolean> | undefined;
  if (stepVis) {
    lines.push("", "**Step visibility:**");
    for (const [step, visible] of Object.entries(stepVis)) {
      lines.push(`  - ${step}: ${visible ? "visible" : "hidden"}`);
    }
  }

  const integState = data.integration_state as Record<string, unknown> | undefined;
  if (integState) {
    const envs = integState.environments as Record<string, Record<string, Record<string, unknown>>> | undefined;
    if (envs) {
      lines.push("", "**Integration state:**");
      for (const [env, integrations] of Object.entries(envs)) {
        lines.push(`  - **${env}:**`);
        for (const [name, state] of Object.entries(integrations)) {
          lines.push(`    - ${name}: available=${state.available}, enabled=${state.enabled}, locked=${state.locked}`);
        }
      }
    }
  }

  return lines.join("\n");
}

function formatAccountSetupResponse(data: OnboardingWizardPayload): string {
  const lines = ["# Account Setup", ""];
  lines.push(`- **Wizard variant:** ${data.wizard_variant}`);
  lines.push(`- **Wizard completed:** ${data.wizard_completed}`);

  if (data.required_fields.length > 0) {
    lines.push("", "**Fields still required:**");
    for (const f of data.required_fields) lines.push(`  - \`${f}\``);
  }

  lines.push("", "## Current Configuration");
  const configs = data.configurations;
  const locks = data.field_locks ?? {};
  for (const [key, value] of Object.entries(configs)) {
    if (key.startsWith("peppol_") && value === null) continue;
    const lock = locks[key] ? " 🔒" : "";
    lines.push(`- **${key}:** ${value === null || value === undefined ? "_not set_" : value}${lock}`);
  }

  if (data.capabilities) {
    const caps = data.capabilities as Record<string, unknown>;
    lines.push("", "## Capabilities");
    lines.push(`- Supports SdI onboarding: ${caps.supports_sdi_onboarding}`);
    lines.push(`- Supports Peppol onboarding: ${caps.supports_peppol_onboarding}`);
    lines.push(`- Supports tax regime selection: ${caps.supports_tax_regime_selection}`);
  }

  if (data.lookup) {
    const lookup = data.lookup as Record<string, unknown>;
    const countries = lookup.countries as Record<string, string> | undefined;
    if (countries) {
      lines.push("", "## Supported Countries");
      for (const [code, name] of Object.entries(countries)) {
        lines.push(`  - ${code}: ${name}`);
      }
    }
    const taxRegimes = lookup.tax_regimes as Record<string, Record<string, string>> | undefined;
    const country = configs.general_store_country;
    if (taxRegimes && country && taxRegimes[country]) {
      lines.push("", `## Tax Regimes for ${country}`);
      for (const [code, desc] of Object.entries(taxRegimes[country])) {
        lines.push(`  - ${code}: ${desc}`);
      }
    }
  }

  return lines.join("\n");
}

function formatSaveAccountSetupResponse(data: Record<string, unknown>): string {
  const lines = ["# Account Setup Save Result", ""];
  lines.push(`- **State:** ${data.state}`);
  lines.push(`- **Next action:** ${data.next_action}`);
  lines.push(`- **Saved:** ${data.saved}`);
  lines.push(`- **Applied changes:** ${data.applied_changes}`);

  if (data.applied_changes === false) {
    lines.push("", "> Setup was already complete — no changes were written.");
  }

  const inner = data.data as Record<string, unknown> | undefined;
  if (inner) {
    lines.push(`- **Wizard completed:** ${inner.wizard_completed}`);
    lines.push(`- **Wizard variant:** ${inner.wizard_variant}`);
    const req = inner.required_fields as string[] | undefined;
    if (req && req.length > 0) {
      lines.push("", "**Still required:**");
      for (const f of req) lines.push(`  - \`${f}\``);
    }

    const caps = inner.capabilities as Record<string, unknown> | undefined;
    if (caps) {
      lines.push("", "**Capabilities:**");
      lines.push(`  - SdI onboarding: ${caps.supports_sdi_onboarding}`);
      lines.push(`  - Peppol onboarding: ${caps.supports_peppol_onboarding}`);
    }
  }

  const responses = data.responses as Record<string, unknown> | undefined;
  if (responses) {
    lines.push("", "## Integration Responses");
    lines.push(`- **Environment:** ${responses.environment}`);
    if (responses.businessRegistryResponse) {
      lines.push("- **SdI business registry:** registered");
      lines.push("```json");
      lines.push(JSON.stringify(responses.businessRegistryResponse, null, 2));
      lines.push("```");
    }
    if (responses.registerLegalEntityResponse) {
      lines.push("- **Peppol legal entity:** registered");
      lines.push("```json");
      lines.push(JSON.stringify(responses.registerLegalEntityResponse, null, 2));
      lines.push("```");
    }
  }

  return lines.join("\n");
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerOnboardingTools(server: McpServer): void {
  // ── Request OTP ────────────────────────────────────────────────────────────
  server.registerTool(
    "pop_onboarding_request_otp",
    {
      title: "Request Onboarding OTP",
      description: `Start the POP onboarding flow by sending a one-time password (OTP) to an email address.

This is step 1 of 5 in the onboarding sequence:
  request-otp → verify-otp → get_status → get_account_setup → save_account_setup

Key behaviours:
- The OTP code is returned directly in the response (not just by email). Read otp_code from the response.
- OTP expires in 10 minutes. Pass it to pop_onboarding_verify_otp immediately.
- If the email does not exist, a new POP account is created automatically.
- For administrator accounts, no OTP is issued. Use the admin password as the otp field in verify-otp instead.

No API key required for this call.`,
      inputSchema: RequestOtpSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const payload: Record<string, unknown> = { email: params.email };
        if (params.lang) payload.lang = params.lang;

        const result = await apiOnboardingPost<OnboardingApiResponse<OnboardingRequestOtpData>>(
          ONBOARDING_ENDPOINTS.requestOtp,
          payload
        );

        const text = formatRequestOtpResponse(result.data);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  server.registerTool(
    "pop_onboarding_verify_otp",
    {
      title: "Verify Onboarding OTP",
      description: `Verify the OTP from pop_onboarding_request_otp and obtain an onboarding token.

This is step 2 of 5 in the onboarding sequence.

Key behaviours:
- Returns an onboarding_token (48-character string). Save it — required for all subsequent steps.
- Token expires 30 minutes after issue. No refresh endpoint; restart from request-otp if expired.
- token_issued_at and token_expires_at are ISO 8601 strings (e.g. 2026-05-26T13:47:15+00:00).
- wizard_variant is 'basic' if no country is saved yet — it updates after save_account_setup sets the country.
- If wizard_required is false after this step, the account is already fully set up. No further steps needed.
- For administrator accounts: pass the admin password as the otp field.

No API key required for this call.`,
      inputSchema: VerifyOtpSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const payload: Record<string, unknown> = {
          email: params.email,
          otp: params.otp,
          platform: params.platform,
        };
        if (params.site_id) payload.site_id = params.site_id;

        const result = await apiOnboardingPost<OnboardingApiResponse<OnboardingVerifyOtpData>>(
          ONBOARDING_ENDPOINTS.verifyOtp,
          payload
        );

        const text = formatVerifyOtpResponse(result.data);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Status ─────────────────────────────────────────────────────────────
  server.registerTool(
    "pop_onboarding_get_status",
    {
      title: "Get Onboarding Status",
      description: `Retrieve the current onboarding state for the authenticated account.

This is step 3 of 5 in the onboarding sequence (optional — use to poll state or check progress).

Returns: state, next_action, wizard_variant, wizard_completed, required_fields, step_visibility, integration_state.

Does NOT return configurations (field values). Use pop_onboarding_get_account_setup for those.

Key behaviours:
- auth_source will be 'onboarding_token' confirming the token was accepted.
- step_visibility.integration = false means SdI/Peppol toggles do not apply to this account (basic variant).
- integration_state.ksef.status = 'not_supported_in_onboarding_yet' is correct — not an error.`,
      inputSchema: OnboardingTokenSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiOnboardingGet<OnboardingApiResponse<Record<string, unknown>>>(
          ONBOARDING_ENDPOINTS.status,
          params.onboarding_token
        );

        const text = formatStatusResponse(result.data);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Account Setup ──────────────────────────────────────────────────────
  server.registerTool(
    "pop_onboarding_get_account_setup",
    {
      title: "Get Account Setup Configuration",
      description: `Retrieve the full account setup payload: current field values, lookup tables, capabilities, and integration state.

This is step 4 of 5 in the onboarding sequence. Call this before save_account_setup to understand:
- Which fields are already saved (non-null in configurations)
- Which fields are locked (field_locks = true) and cannot be changed
- Which integrations are available for the account country (capabilities)
- Valid tax regime codes (lookup.tax_regimes keyed by country)
- Valid Peppol scheme options (lookup.peppol.endpoint_scheme_options)
- Which integration toggles can be set (allowed_integration_toggles)

Key behaviours:
- Null values in configurations = field not yet saved, must be provided in save_account_setup.
- Locked fields (🔒) must not be changed — the API will reject modifications.
- Use capabilities.supports_sdi_onboarding and supports_peppol_onboarding to decide which integration to offer.
- lookup.countries labels are in Italian regardless of the lang field.`,
      inputSchema: OnboardingTokenSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiOnboardingGet<OnboardingApiResponse<OnboardingWizardPayload>>(
          ONBOARDING_ENDPOINTS.accountSetup,
          params.onboarding_token
        );

        const text = formatAccountSetupResponse(result.data);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Save Account Setup ─────────────────────────────────────────────────────
  server.registerTool(
    "pop_onboarding_save_account_setup",
    {
      title: "Save Account Setup Configuration",
      description: `Save the account setup configuration and optionally activate SdI or Peppol integration.

This is step 5 of 5 in the onboarding sequence.

Integration rules:
- To activate SdI (Italy/San Marino): set active_sdipop_integration=1 and active_peppol_integration=0
- To activate Peppol (EU countries): set active_peppol_integration=1 and active_sdipop_integration=0, and provide all peppol_* fields
- SdI and Peppol are mutually exclusive — never set both to 1
- For 'basic' variant accounts (non-IT, non-EU): do not send integration toggle fields

Key behaviours:
- general_store_vat_number must be unique on the target environment. 422 if already in use.
- Sending 0 for an integration toggle means "do not activate" — the value stores as null in configurations.
  Always read the effective activation state from integration_state.environments.*.sdi.enabled.
- Once wizard is complete (wizard_completed=true), calling this again returns the current state without writing (applied_changes=false).
- Once Peppol is registered (peppol_legal_entity_uuid set), all Peppol fields are locked permanently.
- If SdI activation fails at ACube, the account data is still saved — retry is safe.`,
      inputSchema: SaveAccountSetupSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const payload: Record<string, unknown> = {
          environment: params.environment,
          configurations: params.configurations,
        };

        const result = await apiOnboardingPost<OnboardingApiResponse<Record<string, unknown>>>(
          ONBOARDING_ENDPOINTS.accountSetup,
          payload,
          params.onboarding_token
        );

        const text = formatSaveAccountSetupResponse(result.data);
        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
