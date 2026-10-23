import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import {
  InvoiceDataSchema,
  PeppolInvoiceDataSchema,
  DeliveryDataSchema,
  VATEX_CODES,
} from "../src/schemas/invoice.js";
import { handleMcpHttpRequest } from "../src/mcpHandler.js";
import { modernRequest, modernHeaders } from "./helpers.js";

function buildInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    filename: "BE0123456789_00001",
    type: "invoice",
    version: "FPR12",
    sdi_type: "0000000",
    customer_type: "company",
    nature: "VATEX-EU-IC",
    transmitter_data: {
      transmitter_id: { country_id: "BE", id_code: "0123456789" },
      transmitter_format: "FPR12",
      sdi_code: "0000000",
      transmitter_contact: { phone: "+32 2 123 45 67", email: "info@example.be" },
    },
    transfer_lender: {
      personal_data: {
        tax_id_vat: { country_id: "BE", id_code: "0123456789", tax_regime: "RF01" },
        company_name: "Seller BV",
      },
      place: { address: "Rue 1", zip_code: "1000", city: "Brussels", country_id: "BE" },
      contact: { phone: "+32 2 123 45 67", email: "info@example.be" },
    },
    transferee_client: {
      personal_data: {
        tax_id_vat: { country_id: "FR", id_code: "12345678901" },
        company_name: "Client SARL",
      },
      place: { address: "Rue 2", zip_code: "75001", city: "Paris", country_id: "FR" },
    },
    invoice_body: {
      general_data: { doc_type: "TD01", currency: "EUR", date: "2026-10-23", invoice_number: "WEB1/2026" },
      total_document_amount: "100.00",
    },
    order_items: [{
      item_code: { type: "INTERNO", value: "001" },
      item_type: "product",
      gift_product: null,
      description: "Goods",
      quantity: "1.00",
      unit: "N.",
      unit_price: "100.00",
      total_price: "100.00",
      rate: "0.00",
      total_tax: 0,
    }],
    payment_data: { terms_payment: "TP02", payment_details: "MP19", payment_amount: "100.00" },
    ...overrides,
  };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

test("VATEX-EU-IC with delivery_data.country keeps the delivery_data block", () => {
  const parsed = PeppolInvoiceDataSchema.parse(
    buildInvoice({ delivery_data: { country: "FR", date: "2026-10-20" } })
  );
  assert.equal(parsed.nature, "VATEX-EU-IC");
  assert.deepEqual(parsed.delivery_data, { country: "FR", date: "2026-10-20" });
});

test("delivery_data.date is optional, country is required, address-like keys are rejected", () => {
  assert.deepEqual(DeliveryDataSchema.parse({ country: "FR" }), { country: "FR" });
  assert.equal(DeliveryDataSchema.safeParse({ date: "2026-10-20" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "FRA" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "FR", date: "20/10/2026" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "FR", address: "Rue 2" }).success, false);
});

test("nature outside the VATEX enum is rejected on Peppol with a message listing the allowed codes", () => {
  const result = PeppolInvoiceDataSchema.safeParse(buildInvoice({ nature: "N3.1" }));
  assert.equal(result.success, false);
  const message = result.error!.issues.map((i) => i.message).join(" ");
  assert.match(message, /official VATEX exemption codes/);
  for (const code of VATEX_CODES) assert.ok(message.includes(code), `message lists ${code}`);
});

test("nature may still be omitted or null on Peppol (domestic zero rate)", () => {
  const { nature: _omit, ...withoutNature } = buildInvoice();
  assert.equal(PeppolInvoiceDataSchema.parse(withoutNature).nature, undefined);
  assert.equal(PeppolInvoiceDataSchema.parse(buildInvoice({ nature: null })).nature, undefined);
});

test("regression: the shared InvoiceDataSchema still accepts non-VATEX nature codes (SdI, KSeF)", () => {
  for (const nature of ["N2.1", "N3.1", "N6.1", "STANDARD_VAT", "REVERSE_CHARGE"]) {
    assert.equal(InvoiceDataSchema.parse(buildInvoice({ nature })).nature, nature);
  }
});

// ─── tools/call with axios stubbed (no real network) ─────────────────────────

let server: Server;
let baseUrl: string;
let captured: InternalAxiosRequestConfig[] = [];
const originalAdapter = axios.defaults.adapter;

before(async () => {
  const stub: AxiosAdapter = async (config) => {
    captured.push(config);
    return { data: { success: true, message: "stub" }, status: 200, statusText: "OK", headers: {}, config };
  };
  axios.defaults.adapter = stub;

  server = createServer((req, res) => void handleMcpHttpRequest(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected server to bind to a port");
  baseUrl = `http://127.0.0.1:${address.port}/mcp`;
});

after(async () => {
  axios.defaults.adapter = originalAdapter;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  captured = [];
});

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-not-a-real-key",
      ...modernHeaders("tools/call", name),
    },
    body: JSON.stringify(modernRequest(1, "tools/call", { name, arguments: args })),
  });
  return (await res.json()) as { result?: { isError?: boolean; content?: { text: string }[] }; error?: { message: string } };
}

test("pop_create_peppol_invoice sends delivery_data to the API for VATEX-EU-IC", async () => {
  const body = await callTool("pop_create_peppol_invoice", {
    data: buildInvoice({ delivery_data: { country: "FR" } }),
  });
  assert.equal(body.result?.isError, undefined, JSON.stringify(body));
  assert.equal(captured.length, 1);
  const sent = JSON.parse(captured[0].data as string) as { data: Record<string, unknown> };
  assert.deepEqual(sent.data.delivery_data, { country: "FR" });
  assert.equal(sent.data.nature, "VATEX-EU-IC");
});

test("pop_create_peppol_invoice rejects an invalid nature before any API call", async () => {
  const body = await callTool("pop_create_peppol_invoice", { data: buildInvoice({ nature: "N3.1" }) });
  assert.equal(captured.length, 0);
  const text = JSON.stringify(body);
  assert.match(text, /VATEX/);
});

test("pop_create_sdi_invoice still accepts Italian nature codes", async () => {
  const body = await callTool("pop_create_sdi_invoice", { data: buildInvoice({ nature: "N3.1" }) });
  assert.equal(body.result?.isError, undefined, JSON.stringify(body));
  assert.equal(captured.length, 1);
});
