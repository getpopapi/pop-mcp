import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

export const TaxIdVatSchema = z.object({
  country_id: z.string().length(2).describe("ISO 3166-1 alpha-2 country code (e.g. 'IT', 'DE', 'FR')"),
  id_code: z.string().min(1).describe("VAT number or tax ID (e.g. '12345678901' for Italy)"),
}).strict();

export const TransmitterIdSchema = TaxIdVatSchema;

export const TransmitterContactSchema = z.object({
  phone: z.string().describe("Transmitter phone number"),
  email: z.string().email().describe("Transmitter email address"),
}).strict();

export const TransmitterDataSchema = z.object({
  transmitter_id: TransmitterIdSchema.describe("Transmitter tax identification"),
  progressive: z.string().describe("Progressive transmission ID (e.g. '00001')"),
  transmitter_format: z.enum(["FPR12", "FPA12"]).describe("FPR12 for private/companies, FPA12 for Public Administration"),
  sdi_code: z.string().length(7).describe("SDI destination code — 7 characters ('0000000' for private individuals)"),
  transmitter_contact: TransmitterContactSchema,
  recipient_pec: z.string().email().optional().describe("PEC (certified email) for delivery — alternative to SDI code"),
}).strict();

export const PersonalDataLenderSchema = z.object({
  tax_id_vat: z.object({
    country_id: z.string().length(2).describe("ISO country code (e.g. 'IT')"),
    id_code: z.string().min(1).describe("VAT number"),
    tax_regime: z.string().describe("Tax regime code (e.g. 'RF01' for ordinary, 'RF19' for flat rate)"),
  }).strict(),
  company_name: z.string().optional().describe("Company or business name (required if not individual)"),
  first_name: z.string().optional().describe("First name (for individual/freelance)"),
  last_name: z.string().optional().describe("Last name (for individual/freelance)"),
}).strict();

export const AddressSchema = z.object({
  address: z.string().describe("Street address"),
  zip_code: z.string().describe("Postal/ZIP code"),
  city: z.string().describe("City"),
  province_id: z.string().optional().describe("Province/state code (e.g. 'MI' for Milan, 'CT' for Catania)"),
  country_id: z.string().length(2).describe("ISO country code (e.g. 'IT')"),
}).strict();

export const ContactSchema = z.object({
  phone: z.string().describe("Phone number"),
  email: z.string().email().describe("Email address"),
}).strict();

export const TransferLenderSchema = z.object({
  personal_data: PersonalDataLenderSchema,
  place: AddressSchema,
  contact: ContactSchema,
}).strict();

export const PersonalDataClientSchema = z.object({
  tax_id_vat: z.object({
    country_id: z.string().length(2).describe("ISO country code"),
    id_code: z.string().describe("VAT number (empty string '' if not applicable)"),
  }).strict(),
  tax_id_code: z.string().optional().describe("Italian fiscal code (codice fiscale) — required for Italian private individuals"),
  company_name: z.string().optional().describe("Company name"),
  first_name: z.string().optional().describe("Customer first name"),
  last_name: z.string().optional().describe("Customer last name"),
  email: z.string().email().optional().describe("Customer email"),
}).strict();

export const ClientAddressSchema = z.object({
  address: z.string().describe("Street address"),
  zip_code: z.string().describe("Postal/ZIP code"),
  city: z.string().describe("City"),
  province_id: z.string().optional().describe("Province code (optional for non-Italian addresses)"),
  country_id: z.string().length(2).describe("ISO country code"),
}).strict();

export const TransfereeClientSchema = z.object({
  personal_data: PersonalDataClientSchema,
  place: ClientAddressSchema,
}).strict();

export const GeneralDataSchema = z.object({
  doc_type: z.enum(["TD01", "TD04"]).describe("TD01 for invoice, TD04 for credit note"),
  currency: z.string().length(3).default("EUR").describe("ISO 4217 currency code (default: 'EUR')"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Invoice date in YYYY-MM-DD format"),
  invoice_number: z.string().describe("Full invoice number (e.g. 'WEB9/2025')"),
  invoice_prefix: z.string().optional().describe("Invoice number prefix (e.g. 'WEB')"),
  invoice_suffix: z.string().optional().describe("Invoice number suffix (e.g. '9/2025')"),
}).strict();

export const InvoiceBodySchema = z.object({
  general_data: GeneralDataSchema,
  total_document_amount: z.union([z.string(), z.number()]).describe("Total invoice amount including taxes (e.g. '122.00')"),
}).strict();

export const OrderItemSchema = z.object({
  item_code: z.object({
    type: z.string().describe("Code type: 'INTERNO', 'EAN', 'SKU', 'TARIC', etc."),
    value: z.string().describe("The actual code value"),
  }).strict(),
  item_type: z.enum(["product", "shipping", "fee"]).describe("Type of line item"),
  gift_product: z.boolean().nullable().describe("Whether this is a gift item (use null if not applicable)"),
  description: z.string().min(1).describe("Item or service description"),
  quantity: z.string().describe("Quantity as string (e.g. '1.00', '2.50')"),
  unit: z.string().describe("Unit of measure (e.g. 'N.' for pieces, 'KG', 'LT', 'HR')"),
  discount_type: z.string().optional().describe("Discount type: 'SC' for discount, '' or omit if no discount"),
  discount_percent: z.string().optional().describe("Discount percentage (e.g. '10.00')"),
  discount_amount: z.string().optional().describe("Discount amount in currency"),
  unit_price: z.string().describe("Unit price before discount (e.g. '100.00')"),
  total_price: z.string().describe("Total line price after discount (e.g. '90.00')"),
  rate: z.string().describe("VAT rate percentage as string (e.g. '22.00', '10.00', '4.00', '0.00')"),
  total_tax: z.number().describe("Total VAT amount for this line (e.g. 19.8)"),
}).strict();

export const PaymentDataSchema = z.object({
  terms_payment: z.enum(["TP01", "TP02", "TP03"]).describe("TP01=instalment, TP02=full payment, TP03=advance payment"),
  payment_details: z.enum(["MP01", "MP02", "MP05", "MP08", "MP12", "MP15", "MP16", "MP19", "MP21", "MP22", "MP23"])
    .describe("Payment method: MP01=Cash, MP02=Check, MP05=Bank Transfer, MP08=Credit Card, MP12=RIBA, MP16=Direct Debit, MP19=SEPA, MP21=SEPA Core, MP22=Withholding, MP23=PagoPA"),
  payment_amount: z.string().describe("Payment amount (e.g. '122.00')"),
  beneficiary: z.string().optional().describe("Bank account beneficiary name — required for MP05 (bank transfer)"),
  financial_institution: z.string().optional().describe("Bank name — required for MP05 (bank transfer)"),
  iban: z.string().optional().describe("IBAN — required for MP05 (bank transfer)"),
}).strict();

export const PurchaseOrderDataSchema = z.object({
  id: z.string().describe("Purchase order ID/number"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Purchase order date in YYYY-MM-DD format"),
}).strict();

export const ConnectedInvoiceSchema = z.object({
  id: z.string().describe("Reference invoice number"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Reference invoice date in YYYY-MM-DD format"),
}).strict();

export const EmailDeliverySchema = z.object({
  to: z.array(z.string().email()).max(3).describe("Recipient email addresses (max 3)"),
  from: z.string().email().optional().describe("Reply-to email address"),
}).strict();

export const BillingAddressSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  address_1: z.string(),
  address_2: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  postcode: z.string(),
  country: z.string().length(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).strict();

export const PdfConfigSchema = z.object({
  invoice_html: z.enum(["true", "false"]).describe("Whether to generate HTML invoice"),
  doc_type_title: z.string().describe("Document title shown on PDF (e.g. 'Invoice', 'Receipt', 'Credit Note')"),
  logo_url: z.string().url().optional().describe("URL of company logo to include in PDF"),
  head: z.object({
    store_info_address: z.string().describe("Full store/company address string"),
    billing: z.array(BillingAddressSchema).describe("Billing address details"),
    shipping: z.array(BillingAddressSchema).optional().describe("Shipping address details (optional)"),
  }).strict(),
  nature_rc: z.string().optional().describe("VAT exemption nature code for reverse charge"),
  ref_norm_rc: z.string().optional().describe("Legal reference for reverse charge"),
  ref_n5_normative: z.string().optional().describe("Legal reference for N5 (reverse charge) exemption"),
  total_tax: z.string().describe("Total tax amount as string"),
  footer_text: z.string().optional().describe("Custom footer text for the PDF"),
  email_invoice: EmailDeliverySchema.optional().describe("Email delivery configuration"),
}).strict();

export const OverridesSchema = z.object({
  language: z.string().optional().describe("Locale override (e.g. 'it', 'en', 'de', 'fr', 'es')"),
  bollo_force_apply: z.boolean().optional().describe("Force apply virtual stamp (bollo virtuale) for Italian invoices"),
}).strict();

// ─── Main Invoice Data Schema ─────────────────────────────────────────────────

export const InvoiceDataSchema = z.object({
  id: z.number().int().positive().describe("Invoice/order ID (numeric)"),
  filename: z.string().describe("Output filename without extension (e.g. 'IT99900088876_00009')"),
  type: z.enum(["invoice", "credit_note"]).describe("Document type"),
  version: z.enum(["FPR12", "FPA12"]).describe("FPR12 for private/companies, FPA12 for Public Administration"),
  sdi_type: z.string().length(7).describe("SDI recipient code — 7 chars ('0000000' for private individuals without SDI code)"),
  customer_type: z.enum(["private", "company", "freelance", "pa"]).describe("Customer category"),
  nature: z.string().optional().describe("VAT exemption nature code (e.g. 'N2.1', 'N3.1', 'N6.1') — required when VAT rate is 0%"),
  ref_normative: z.string().optional().describe("Legal reference for VAT exemption"),
  vies: z.boolean().optional().describe("Whether EU VIES validation was performed for this customer"),
  vat_kind: z.enum(["I", "D", "S"]).optional().describe("Italian VAT kind: I=Imponibile, D=Deducibile, S=Scissione"),
  transmitter_data: TransmitterDataSchema,
  transfer_lender: TransferLenderSchema.describe("Supplier/seller details"),
  transferee_client: TransfereeClientSchema.describe("Customer/buyer details"),
  invoice_body: InvoiceBodySchema,
  order_items: z.array(OrderItemSchema).min(1).describe("Line items (products, services, shipping)"),
  payment_data: PaymentDataSchema,
  purchase_order_data: PurchaseOrderDataSchema.optional().describe("Purchase order reference"),
  connected_invoice_data: z.array(ConnectedInvoiceSchema).optional().describe("Referenced invoices (required for credit notes)"),
  pdf: PdfConfigSchema.optional().describe("PDF generation configuration (only for create-pdf endpoint)"),
  overrides: OverridesSchema.optional().describe("Optional overrides for locale and stamp settings"),
});

export type InvoiceData = z.infer<typeof InvoiceDataSchema>;

// ─── Integration schemas ──────────────────────────────────────────────────────

export const SdiIntegrationSchema = z.object({
  use: z.literal("sdi-via-pop").describe("Use SdI via POP integration"),
  action: z.enum(["create", "update", "delete"]).default("create"),
}).strict();

export const PeppolIntegrationSchema = z.object({
  use: z.literal("peppol-via-pop").describe("Use Peppol via POP integration"),
  action: z.enum(["create", "update", "delete"]).default("create"),
}).strict();

export const WebhookIntegrationSchema = z.object({
  use: z.literal("pop-to-webhook"),
  action: z.enum(["create", "update", "delete"]).default("create"),
  id: z.string().describe("Webhook configuration ID"),
}).strict();

export const FattureIntegrationSchema = z.object({
  use: z.literal("fatture-in-cloud"),
  action: z.enum(["create", "update", "delete"]).default("create"),
}).strict();
