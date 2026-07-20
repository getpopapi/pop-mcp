export interface PopApiError {
  success: false;
  error_code: string;
  message: string;
  status_code: number;
  code: string;
}

export interface IntegrationConfig {
  use: "sdi-via-pop" | "peppol-via-pop" | "ksef" | "ksef-via-pop" | "fatture-in-cloud" | "pop-to-webhook";
  action: "create" | "update" | "delete";
  id?: string;
  uuid?: string;
  zone?: string;
}

export interface CreateInvoiceResponse {
  success: boolean;
  message?: string;
  integration?: string;
  data?: {
    uuid?: string;
  };
  code?: number;
  document_number?: string;
  pdf_url?: string;
}

export interface DocumentNotification {
  id: string;
  uuid: string;
  status: "accepted" | "rejected" | "pending" | string;
  type: "receipt" | "invoice" | "delivery" | string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface NotificationsResponse {
  success: boolean;
  code: number;
  notifications: DocumentNotification[];
}

export type Environment = "production" | "staging";

export interface ApiContext {
  apiKey: string;
  environment: Environment;
}

// ── Onboarding API types ──────────────────────────────────────────────────────

export interface OnboardingRequestOtpData {
  state: string;
  delivery: string;
  otp_code?: string;
  email_delivery_success?: boolean;
  administrator_requires_password: boolean;
  existing_user: boolean;
  created_user?: boolean;
  email: string;
  lang?: string;
  message: string;
}

export interface OnboardingIntegrationEnvironmentSdi {
  available: boolean;
  enabled: boolean;
  locked: boolean;
  supports_signature?: boolean;
  supports_legal_storage?: boolean;
  signature_enabled?: boolean;
  legal_storage_enabled?: boolean;
}

export interface OnboardingIntegrationEnvironmentPeppol {
  available: boolean;
  enabled: boolean;
  locked: boolean;
  legal_entity_registered?: boolean;
  legal_entity_uuid?: string;
  identifier_scheme?: string | null;
  endpoint_identifier_value?: string | null;
}

export interface OnboardingIntegrationState {
  environments: {
    live: {
      sdi: OnboardingIntegrationEnvironmentSdi;
      peppol: OnboardingIntegrationEnvironmentPeppol;
    };
    sandbox: {
      sdi: OnboardingIntegrationEnvironmentSdi;
      peppol: OnboardingIntegrationEnvironmentPeppol;
    };
  };
  ksef: {
    available: boolean;
    enabled: boolean;
    locked: boolean;
    status: string;
  };
}

export interface OnboardingVerifyOtpData {
  message: string;
  authenticated: boolean;
  onboarding_token: string;
  token_issued_at: string;
  token_expires_at: string;
  user_id: number;
  existing_user: boolean;
  license_slug: string;
  platform: string;
  auth_source: string;
  state: string;
  next_action: string;
  wizard_required: boolean;
  wizard_completed: boolean;
  wizard_variant: string;
  country: string;
  required_fields: string[];
  field_locks: Record<string, boolean>;
  step_visibility: Record<string, boolean>;
  integration_state: OnboardingIntegrationState;
}

export interface OnboardingConfigurations {
  general_store_country?: string | null;
  general_store_your_name?: string | null;
  general_store_your_surname?: string | null;
  general_store_company_name?: string | null;
  general_store_vat_number?: string | null;
  general_store_tax_regime?: string | null;
  company_technical_email?: string | null;
  company_accounting_email?: string | null;
  [key: string]: unknown;
}

export interface OnboardingWizardPayload {
  configurations: OnboardingConfigurations;
  wizard_variant: string;
  wizard_required: boolean;
  wizard_completed: boolean;
  required_fields: string[];
  field_locks: Record<string, boolean>;
  step_visibility: Record<string, boolean>;
  integration_state: OnboardingIntegrationState;
  allowed_integration_toggles?: Record<string, boolean>;
  capabilities?: Record<string, unknown>;
  lookup?: Record<string, unknown>;
}

export interface OnboardingApiResponse<T> {
  success: boolean;
  data: T;
}
