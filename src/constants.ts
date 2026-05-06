export const API_BASE_URLS = {
  production: "https://popapi.io/wp-json/api/v2",
  staging: "https://staging7.popapi.io/wp-json/api/v2",
} as const;

export const API_ENDPOINTS = {
  createXml: "/create-xml",
  createUbl: "/create-ubl",
  createPdf: "/create-pdf",
  documentNotifications: "/sdi-via-pop/document-notifications",
  peppolDocumentGet: "/peppol/document-get",
  sdiDocumentVerify: "/sdi-via-pop/document-verify",
  sdiDocumentPreserve: "/sdi-via-pop/document-preserve",
  sdiDocumentGet: "/sdi-via-pop/document-get",
} as const;

export const CHARACTER_LIMIT = 25000;

export const DEFAULT_TIMEOUT_MS = 30000;

export const USER_AGENT = "pop-mcp-server/1.0.0";
