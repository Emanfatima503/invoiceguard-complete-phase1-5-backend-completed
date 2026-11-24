"use server";

import { revalidatePath } from "next/cache";
import { supabase, configured } from "@/lib/supabase";

type UserClient = Awaited<ReturnType<typeof supabase>>;

/**
 * Defense in depth: these actions are only reachable from the logged-in UI,
 * but never trust that alone — require a session whenever Supabase is
 * configured (same gate as the intake/export routes). When Supabase is
 * unconfigured (preview mode) there is no session to check and the
 * database calls below fail anyway.
 */
async function requireSession(sb: UserClient): Promise<void> {
  if (!configured) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Authentication required");
}

const REVIEW_DECISIONS = ["verify_fields", "mark_suspicious", "request_info", "approve", "reject"] as const;
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

function isReviewDecision(value: string): value is ReviewDecision {
  return (REVIEW_DECISIONS as readonly string[]).includes(value);
}

/** Invoice status that follows each review decision (same mapping as before). */
function statusForDecision(decision: ReviewDecision): string {
  if (decision === "approve") return "approved";
  if (decision === "reject") return "rejected";
  if (decision === "request_info") return "info_requested";
  if (decision === "mark_suspicious") return "needs_review";
  return "in_review";
}

/**
 * Shared by reviewInvoice and bulkReview: insert the review row, then move
 * the invoice to the status for that decision.
 */
/** Statuses a human review may act on (the approvals queue lists exactly these). */
const REVIEWABLE_STATUSES = ["needs_review", "in_review", "info_requested"];

async function applyReview(sb: UserClient, invoiceId: string, decision: ReviewDecision, notes: string | null): Promise<void> {
  // Prior-status guard: refuse to review an invoice that already left the
  // queue (approved, rejected, exported, failed, ...). Without this a stale
  // form or a forged request could re-review finished work.
  const { data: current } = await sb.from("invoices").select("status").eq("id", invoiceId).maybeSingle();
  if (!current) throw new Error("Invoice not found");
  if (!REVIEWABLE_STATUSES.includes(current.status)) throw new Error(`Invoice cannot be reviewed from status "${current.status}"`);
  const { error } = await sb.from("invoice_reviews").insert({ invoice_id: invoiceId, decision, notes });
  if (error) throw new Error(error.message);
  const { error: updateError } = await sb.from("invoices").update({ status: statusForDecision(decision) }).eq("id", invoiceId);
  if (updateError) throw new Error(updateError.message);
}

export async function reviewInvoice(form: FormData) {
  const invoiceId = String(form.get("invoice_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  if (!invoiceId || !isReviewDecision(decision)) throw new Error("Invalid review request");
  const sb = await supabase();
  await requireSession(sb);
  await applyReview(sb, invoiceId, decision, notes);
  revalidatePath("/approvals");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/risk-review");
}

export async function updateDuplicate(form: FormData) {
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!id || !["pending", "confirmed_duplicate", "not_duplicate"].includes(status)) throw new Error("Invalid duplicate decision");
  const sb = await supabase();
  await requireSession(sb);
  const { error } = await sb.from("duplicate_candidates").update({ review_status: status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/duplicates");
  revalidatePath("/dashboard");
}

export async function verifyVendor(form: FormData) {
  const id = String(form.get("id") ?? "");
  const verified = String(form.get("verified") ?? "true") === "true";
  if (!id) throw new Error("Invalid vendor request");
  const sb = await supabase();
  await requireSession(sb);
  const { error } = await sb.from("vendors").update({ verified }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/vendors");
}

export async function updateFindingStatus(form: FormData) {
  const findingId = String(form.get("finding_id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!findingId || !["open", "confirmed", "dismissed"].includes(status)) throw new Error("Invalid finding status");
  const sb = await supabase();
  await requireSession(sb);
  const { error } = await sb.from("risk_findings").update({ status }).eq("id", findingId);
  if (error) throw new Error(error.message);
  revalidatePath("/risk-review");
  revalidatePath("/dashboard");
}

export async function retryInvoice(form: FormData) {
  const invoiceId = String(form.get("invoice_id") ?? "");
  if (!invoiceId) throw new Error("Invalid retry request");
  const sb = await supabase();
  await requireSession(sb);
  // Only failed invoices can be retried: reprocessing any other status
  // would re-run extraction and reset findings on live work.
  const { data: current } = await sb.from("invoices").select("status").eq("id", invoiceId).maybeSingle();
  if (!current) throw new Error("Invoice not found");
  if (current.status !== "failed") throw new Error("Only failed invoices can be retried");
  const { processInvoice } = await import("@/lib/invoice-processing");
  try {
    await processInvoice(invoiceId);
  } catch (e) {
    // Same failure handling as the intake route: mark the invoice failed
    // with the error in ai_summary, then rethrow so the caller sees it.
    const message = e instanceof Error ? e.message || "unknown error" : "unknown error";
    const { error } = await sb.from("invoices").update({ status: "failed", ai_summary: `Processing failed: ${message}` }).eq("id", invoiceId);
    if (error) throw new Error(error.message);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    throw e;
  }
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function bulkReview(form: FormData) {
  const invoiceIds = [...new Set(form.getAll("invoice_id").map((v) => String(v)).filter(Boolean))];
  const decision = String(form.get("decision") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  // Nothing checked: a silent no-op (submitting the bulk form with no
  // selection must not error).
  if (invoiceIds.length === 0) return;
  if (!isReviewDecision(decision)) throw new Error("Invalid bulk review request");
  const sb = await supabase();
  await requireSession(sb);
  // Sequential, no transaction: if one invoice fails, the ones already
  // reviewed stay reviewed and the error names the failing invoice.
  for (const invoiceId of invoiceIds) {
    try {
      await applyReview(sb, invoiceId, decision, notes);
    } catch (e) {
      throw new Error(`Bulk review failed for invoice ${invoiceId}: ${e instanceof Error ? e.message || "unknown error" : "unknown error"}`);
    }
  }
  revalidatePath("/approvals");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/risk-review");
}

export async function verifyBankAccount(form: FormData) {
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!id || !["verified", "rejected"].includes(status)) throw new Error("Invalid bank account decision");
  // MUST use the logged-in user client, not admin(): the guard_bank_account
  // trigger rejects verification when auth.uid() is null, and it sets
  // verified_at / verified_by itself, so they are not set here.
  const sb = await supabase();
  await requireSession(sb);
  const { error } = await sb.from("vendor_bank_accounts").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/vendors");
}
