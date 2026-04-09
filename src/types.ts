export interface PopApiError {
  success: false;
  error_code: string;
  message: string;
  status_code: number;
  code: string;
}

export interface IntegrationConfig {
  use: "sdi-via-pop" | "peppol-via-pop" | "fatture-in-cloud" | "pop-to-webhook";
  action: "create" | "update" | "delete";
  id?: string;
  uuid?: string;
  zone?: string;
}

export interface CreateInvoiceResponse {
  success: boolean;
  message?: string;
  integration?: {
    uuid: string;
    status: string;
    type: string;
  };
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
