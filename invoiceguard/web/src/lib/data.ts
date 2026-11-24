import "server-only";
import { supabase } from "@/lib/supabase";
import { admin, adminConfigured } from "@/lib/admin";

// Select strings are unchanged from the originals so existing pages keep
// receiving exactly the same shapes.
const INVOICE_SELECT = "id,invoice_number,invoice_date,due_date,currency,total,status,risk_score,risk_band,created_at,file_name,vendor_id,vendors(legal_name)";
const VENDOR_SELECT = "id,legal_name,tax_id,registration_id,contact_email,verified,risk_baseline,created_at,updated_at";
const RISK_FINDING_SELECT = "id,invoice_id,reason_code,severity,evidence,score_contribution,status,created_at,invoices(invoice_number,total,currency,vendor_id,vendors(legal_name))";
const DUPLICATE_SELECT = "id,invoice_a,invoice_b,match_score,match_reasons,review_status,created_at,invoice_a_ref:invoices!duplicate_candidates_invoice_a_fkey(invoice_number,total,currency,invoice_date,vendor_id,vendors(legal_name)),invoice_b_ref:invoices!duplicate_candidates_invoice_b_fkey(invoice_number,total,currency,invoice_date,vendor_id,vendors(legal_name))";
const REVIEW_SELECT = "id,invoice_id,decision,notes,decided_at,invoices(invoice_number,total,currency,status,risk_score,risk_band,vendor_id,vendors(legal_name))";
const AUDIT_SELECT = "id,actor_id,actor_type,action,object_type,object_id,before_json,after_json,created_at";

export type ListInvoicesOptions = { limit?: number; offset?: number; query?: string; status?: string | string[] };
export type ListOptions = { limit?: number; offset?: number };
export type CountInvoicesOptions = { query?: string; status?: string | string[] };

export type VendorRiskSummary = {
  vendor_id: string;
  legal_name: string;
  routine: number;
  review: number;
  priority: number;
  hold: number;
  total: number;
};

/**
 * Row shapes as the pages read them. The Supabase client has no Database
 * generic, so its inferred join shape (every embedded relation as an array)
 * does not match what PostgREST actually returns for these many-to-one
 * foreign keys: a single object, or null when the reference is unresolved.
 * The loaders below cast to these types at the boundary; the queries and
 * the data are unchanged.
 */
export type VendorRef = { legal_name: string | null };

export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  total: number | null;
  status: string | null;
  risk_score: number | null;
  risk_band: string | null;
  created_at: string | null;
  file_name: string | null;
  vendor_id: string | null;
  vendors: VendorRef | null;
};

/** An invoice as embedded by a many-to-one join (duplicate refs, risk findings). */
export type InvoiceRef = {
  invoice_number: string | null;
  invoice_date?: string | null;
  currency: string | null;
  total: number | null;
  vendor_id: string | null;
  vendors: VendorRef | null;
};

export type RiskFindingRow = {
  id: string;
  invoice_id: string | null;
  reason_code: string;
  severity: string | null;
  evidence: { message?: string; reason?: string } | null;
  score_contribution: number | null;
  status: string | null;
  created_at: string | null;
  invoices: InvoiceRef | null;
};

export type DuplicateCandidateRow = {
  id: string;
  invoice_a: string | null;
  invoice_b: string | null;
  match_score: number | null;
  match_reasons: string[] | null;
  review_status: string | null;
  created_at: string | null;
  invoice_a_ref: InvoiceRef | null;
  invoice_b_ref: InvoiceRef | null;
};

/** Fall back to the default when the caller passes no usable limit. */
function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Math.floor(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  const n = Math.floor(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Empty string / empty array mean "no status filter" (an empty .in() matches nothing). */
function normalizeStatus(status: string | string[] | undefined): string | string[] | undefined {
  if (status === undefined) return undefined;
  if (Array.isArray(status)) return status.length > 0 ? status : undefined;
  return status ? status : undefined;
}

/** Escape the LIKE wildcards in a user search string so they match literally. */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function listInvoices(opts: ListInvoicesOptions = {}): Promise<InvoiceRow[]> {
  const limit = normalizeLimit(opts.limit, 100);
  const offset = normalizeOffset(opts.offset);
  const status = normalizeStatus(opts.status);
  const queryText = opts.query?.trim();
  const sb = await supabase();

  if (queryText) {
    // Search path: invoice_number ILIKE plus vendor legal_name ILIKE.
    // PostgREST .or() across a joined table is fragile, so this runs two
    // queries (number match, vendor match via a vendor pre-query + .in) and
    // merges/dedupes in code. Each branch fetches offset+limit rows, which
    // is enough for the merged window to be exact, then offset/limit are
    // applied to the merged, newest-first list.
    const pattern = `%${escapeIlike(queryText)}%`;
    const take = offset + limit;
    let numberQuery = sb.from("invoices").select(INVOICE_SELECT).ilike("invoice_number", pattern);
    if (status) numberQuery = Array.isArray(status) ? numberQuery.in("status", status) : numberQuery.eq("status", status);
    const numberRes = await numberQuery.order("created_at", { ascending: false }).limit(take);
    if (numberRes.error) throw new Error(numberRes.error.message);

    const { data: vendorRows, error: vendorError } = await sb.from("vendors").select("id").ilike("legal_name", pattern).limit(1000);
    if (vendorError) throw new Error(vendorError.message);
    const vendorIds = (vendorRows ?? []).map((v) => v.id);
    let vendorMatches: NonNullable<typeof numberRes.data> = [];
    if (vendorIds.length > 0) {
      let vendorQuery = sb.from("invoices").select(INVOICE_SELECT).in("vendor_id", vendorIds);
      if (status) vendorQuery = Array.isArray(status) ? vendorQuery.in("status", status) : vendorQuery.eq("status", status);
      const vendorRes = await vendorQuery.order("created_at", { ascending: false }).limit(take);
      if (vendorRes.error) throw new Error(vendorRes.error.message);
      vendorMatches = vendorRes.data ?? [];
    }

    const byId = new Map<string, NonNullable<typeof numberRes.data>[number]>();
    for (const row of [...(numberRes.data ?? []), ...vendorMatches]) byId.set(row.id, row);
    // Newest first; id breaks ties so equal timestamps order deterministically.
    const merged = [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id)));
    return merged.slice(offset, offset + limit) as unknown as InvoiceRow[];
  }

  // Plain path: status filters are applied BEFORE the limit/range so the
  // approvals queue no longer filters after the 100-row cap.
  let query = sb.from("invoices").select(INVOICE_SELECT);
  if (status) query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceRow[];
}

export async function listVendors() {
  const sb = await supabase();
  const { data, error } = await sb.from("vendors").select(VENDOR_SELECT).order("legal_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listRiskFindings(opts: ListOptions = {}): Promise<RiskFindingRow[]> {
  const limit = normalizeLimit(opts.limit, 200);
  const offset = normalizeOffset(opts.offset);
  const sb = await supabase();
  const { data, error } = await sb.from("risk_findings").select(RISK_FINDING_SELECT).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RiskFindingRow[];
}

export async function listDuplicates(): Promise<DuplicateCandidateRow[]> {
  const sb = await supabase();
  const { data, error } = await sb.from("duplicate_candidates").select(DUPLICATE_SELECT).order("match_score", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DuplicateCandidateRow[];
}

export async function listReviews() {
  const sb = await supabase();
  const { data, error } = await sb.from("invoice_reviews").select(REVIEW_SELECT).order("decided_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAudit(opts: ListOptions = {}) {
  const limit = normalizeLimit(opts.limit, 200);
  const offset = normalizeOffset(opts.offset);
  const sb = await supabase();
  const { data, error } = await sb.from("audit_events").select(AUDIT_SELECT).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countInvoices(opts: CountInvoicesOptions = {}): Promise<number> {
  const status = normalizeStatus(opts.status);
  const queryText = opts.query?.trim();
  const sb = await supabase();

  if (queryText) {
    // Head-counts cannot be merged without double-counting rows that match
    // both branches, so the search count fetches ids from both branches and
    // dedupes in code (same filters as listInvoices).
    const pattern = `%${escapeIlike(queryText)}%`;
    let numberQuery = sb.from("invoices").select("id").ilike("invoice_number", pattern);
    if (status) numberQuery = Array.isArray(status) ? numberQuery.in("status", status) : numberQuery.eq("status", status);
    const numberRes = await numberQuery;
    if (numberRes.error) throw new Error(numberRes.error.message);
    const ids = new Set<string>();
    for (const row of numberRes.data ?? []) ids.add(row.id);

    const { data: vendorRows, error: vendorError } = await sb.from("vendors").select("id").ilike("legal_name", pattern).limit(1000);
    if (vendorError) throw new Error(vendorError.message);
    const vendorIds = (vendorRows ?? []).map((v) => v.id);
    if (vendorIds.length > 0) {
      let vendorQuery = sb.from("invoices").select("id").in("vendor_id", vendorIds);
      if (status) vendorQuery = Array.isArray(status) ? vendorQuery.in("status", status) : vendorQuery.eq("status", status);
      const vendorRes = await vendorQuery;
      if (vendorRes.error) throw new Error(vendorRes.error.message);
      for (const row of vendorRes.data ?? []) ids.add(row.id);
    }
    return ids.size;
  }

  let query = sb.from("invoices").select("*", { count: "exact", head: true });
  if (status) query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countRiskFindings(): Promise<number> {
  const sb = await supabase();
  const { count, error } = await sb.from("risk_findings").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countAudit(): Promise<number> {
  const sb = await supabase();
  const { count, error } = await sb.from("audit_events").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listVendorBankAccounts(vendorId: string) {
  const sb = await supabase();
  const { data, error } = await sb.from("vendor_bank_accounts").select("id,vendor_id,account_last4,bank_name,currency,status,verified_at,created_at").eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInvoiceLineItems(invoiceId: string) {
  const sb = await supabase();
  const { data, error } = await sb.from("invoice_line_items").select("id,position,description,quantity,unit_price,line_total,tax_rate").eq("invoice_id", invoiceId).order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getVendorRiskSummary(): Promise<VendorRiskSummary[]> {
  const sb = await supabase();
  // 1000-row cap: the summary aggregates in code, so very large histories
  // are summarised from the 1000 newest invoices. Move the aggregation into
  // a DB view if the invoice table grows past that.
  const { data: invoiceRows, error } = await sb.from("invoices").select("vendor_id,risk_band").order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const { data: vendorRows, error: vendorError } = await sb.from("vendors").select("id,legal_name");
  if (vendorError) throw new Error(vendorError.message);
  const names = new Map<string, string>();
  for (const v of vendorRows ?? []) names.set(v.id, v.legal_name);
  const summary = new Map<string, VendorRiskSummary>();
  for (const row of invoiceRows ?? []) {
    if (!row.vendor_id) continue; // Vendor not resolved yet; cannot attribute to a vendor.
    let entry = summary.get(row.vendor_id);
    if (!entry) {
      entry = { vendor_id: row.vendor_id, legal_name: names.get(row.vendor_id) ?? "Unknown vendor", routine: 0, review: 0, priority: 0, hold: 0, total: 0 };
      summary.set(row.vendor_id, entry);
    }
    entry.total += 1;
    if (row.risk_band === "routine") entry.routine += 1;
    else if (row.risk_band === "review") entry.review += 1;
    else if (row.risk_band === "priority") entry.priority += 1;
    else if (row.risk_band === "hold") entry.hold += 1;
    // A null risk_band counts toward total only (invoice not scored yet).
  }
  return [...summary.values()].sort((a, b) => b.total - a.total || a.legal_name.localeCompare(b.legal_name));
}

export async function getInvoiceFileUrl(invoiceId: string): Promise<{ url: string; file_name: string | null; mime_type: string | null } | null> {
  // No service key configured (e.g. preview mode): no signed URL is
  // possible, so return null instead of throwing (admin() throws).
  if (!adminConfigured) return null;
  const sb = admin();
  const { data, error } = await sb.from("invoices").select("file_key,file_name,mime_type").eq("id", invoiceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.file_key) return null;
  const { data: signed, error: signError } = await sb.storage.from("invoices").createSignedUrl(data.file_key, 3600);
  if (signError || !signed) throw new Error(signError?.message || "Could not create a signed file URL");
  return { url: signed.signedUrl, file_name: data.file_name, mime_type: data.mime_type };
}
