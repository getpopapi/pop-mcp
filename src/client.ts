import axios, { AxiosError, AxiosInstance } from "axios";
import { API_BASE_URLS, DEFAULT_TIMEOUT_MS, USER_AGENT } from "./constants.js";
import type { Environment } from "./types.js";

let apiClient: AxiosInstance | null = null;

export function getApiKey(): string {
  const key = process.env.POP_API_KEY;
  if (!key) {
    throw new Error(
      "POP_API_KEY environment variable is not set. " +
      "Please set it to your POP API license key."
    );
  }
  return key;
}

export function getEnvironment(): Environment {
  const env = process.env.POP_ENVIRONMENT?.toLowerCase();
  if (env === "staging") return "staging";
  return "production";
}

export function getClient(): AxiosInstance {
  if (!apiClient) {
    const env = getEnvironment();
    const baseURL = API_BASE_URLS[env];

    apiClient = axios.create({
      baseURL,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-API-Key": getApiKey(),
      },
    });
  }
  return apiClient;
}

export async function apiPost<T>(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<T> {
  const client = getClient();
  const response = await client.post<T>(endpoint, payload);
  return response.data;
}

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const data = error.response.data as Record<string, unknown> | undefined;
      const message =
        (data?.message as string) ||
        (data?.error as string) ||
        `HTTP ${error.response.status}`;
      const code = (data?.error_code as string) || (data?.code as string);
      const hint = getErrorHint(error.response.status, code);
      return `POP API Error (${error.response.status}): ${message}${code ? ` [${code}]` : ""}${hint}`;
    }
    if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. The POP API did not respond in time. Please try again.";
    }
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return "Error: Cannot reach POP API. Check your internet connection or try the staging environment (set POP_ENVIRONMENT=staging).";
    }
  }
  const msg = error instanceof Error ? error.message : String(error);
  return `Unexpected error: ${msg}`;
}

function getErrorHint(status: number, code?: string): string {
  if (code === "unauthorized_user") {
    return "\nHint: Verify your POP_API_KEY is correct.";
  }
  if (code === "insufficient_level") {
    return "\nHint: This operation requires a higher plan level (Basic/Growth/Pro).";
  }
  if (code === "business_not_registered") {
    return "\nHint: Register your business details on popapi.io before using SdI/Peppol features.";
  }
  if (code === "integration_inactive") {
    return "\nHint: Activate the SdI or Peppol integration on your POP account.";
  }
  if (status === 403) {
    return "\nHint: Your plan may not include this feature. Check your subscription on popapi.io.";
  }
  if (status === 404) {
    return "\nHint: The resource was not found. Check the UUID or license key.";
  }
  return "";
}
