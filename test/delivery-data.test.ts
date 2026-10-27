import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { InvoiceDataSchema, DeliveryDataSchema } from "../src/schemas/invoice.js";
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
      progressive: "00001",
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
    purchase_order_data: { id: "PO-1", date: "2026-10-01" },
    overrides: { language: "en", bollo_force_apply: false },
    ...overrides,
  };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

test("delivery_data with country and date is kept by the invoice schema", () => {
  const parsed = InvoiceDataSchema.parse(buildInvoice({ delivery_data: { country: "FR", date: "2026-10-20" } }));
  assert.deepEqual(parsed.delivery_data, { country: "FR", date: "2026-10-20" });
});

test("delivery_data is optional on the invoice schema", () => {
  assert.equal(InvoiceDataSchema.parse(buildInvoice()).delivery_data, undefined);
});

test("delivery_data: date optional, country required, country alpha-2 only, no address-like keys", () => {
  assert.deepEqual(DeliveryDataSchema.parse({ country: "FR" }), { country: "FR" });
  assert.equal(DeliveryDataSchema.safeParse({ date: "2026-10-20" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "FRA" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "F" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "FR", date: "20/10/2026" }).success, false);
  assert.equal(DeliveryDataSchema.safeParse({ country: "FR", address: "Rue 2" }).success, false);
});

test("nature stays a free string: the client does not validate exemption codes", () => {
  for (const nature of ["VATEX-EU-132", "VATEX-EU-143", "VATEX-EU-IC", "N3.1", "STANDARD_VAT", ""]) {
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

function sentData(): Record<string, unknown> {
  assert.equal(captured.length, 1, "exactly one request reached the (stubbed) API");
  return (JSON.parse(captured[0].data as string) as { data: Record<string, unknown> }).data;
}

test("pop_create_peppol_invoice sends delivery_data to the API for VATEX-EU-IC", async () => {
  const body = await callTool("pop_create_peppol_invoice", {
    data: buildInvoice({ delivery_data: { country: "FR" } }),
  });
  assert.equal(body.result?.isError, undefined, JSON.stringify(body));
  const data = sentData();
  assert.deepEqual(data.delivery_data, { country: "FR" });
  assert.equal(data.nature, "VATEX-EU-IC");
});

test("a credit note carries the same delivery_data block to the API", async () => {
  const creditNote = buildInvoice({
    type: "credit_note",
    invoice_body: {
      general_data: { doc_type: "TD04", currency: "EUR", date: "2026-10-24", invoice_number: "CN1/2026" },
      total_document_amount: "100.00",
    },
    connected_invoice_data: [{ id: "WEB1/2026", date: "2026-10-23" }],
    delivery_data: { country: "FR", date: "2026-10-20" },
  });
  await callTool("pop_create_peppol_invoice", { data: creditNote });
  assert.deepEqual(sentData().delivery_data, { country: "FR", date: "2026-10-20" });
});

test("nature 'VATEX-EU-132' reaches the API untouched on the Peppol tool", async () => {
  const body = await callTool("pop_create_peppol_invoice", { data: buildInvoice({ nature: "VATEX-EU-132" }) });
  assert.equal(body.result?.isError, undefined, JSON.stringify(body));
  assert.equal(sentData().nature, "VATEX-EU-132");
});

test("an invalid delivery_data is rejected before any API call", async () => {
  await callTool("pop_create_peppol_invoice", {
    data: buildInvoice({ delivery_data: { country: "FR", address: "Rue 2" } }),
  });
  assert.equal(captured.length, 0);
});

test("legacy payloads (no delivery_data) reach the API unchanged on every invoice tool", async () => {
  const legacy = (nature: string) =>
    buildInvoice({
      nature,
      ref_normative: "Art. test",
      vies: true,
      pdf: {
        invoice_html: "false",
        doc_type_title: "Invoice",
        head: {
          store_info_address: "Rue 1, 1000 Brussels",
          billing: [{ address_1: "Rue 2", city: "Paris", postcode: "75001", country: "FR" }],
        },
        total_tax: "0.00",
      },
    });
  const cases: [string, Record<string, unknown>][] = [
    ["pop_create_sdi_invoice", { data: legacy("N3.1") }],
    ["pop_create_peppol_invoice", { data: legacy("VATEX-EU-G") }],
    ["pop_create_pdf_invoice", { data: legacy("N3.1") }],
    ["pop_create_ksef_invoice", { data: legacy("STANDARD_VAT") }],
    ["pop_create_zugferd_invoice", { data: legacy("N3.1") }],
    ["pop_sync_zoho_document", { data: legacy("N3.1"), check_connector_status: false }],
  ];
  for (const [name, args] of cases) {
    captured = [];
    const body = await callTool(name, args);
    assert.equal(body.result?.isError, undefined, `${name}: ${JSON.stringify(body)}`);
    assert.deepEqual(sentData(), args.data, `${name}: outgoing data differs from the input`);
  }
});
