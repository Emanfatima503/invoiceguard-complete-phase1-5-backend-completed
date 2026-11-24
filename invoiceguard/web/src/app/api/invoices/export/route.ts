import { NextResponse } from "next/server";
import { admin, adminConfigured } from "@/lib/admin";
import { supabase, configured } from "@/lib/supabase";

export const runtime = "nodejs";

/** CSV-escape one cell: quote fields containing a comma, quote or newline. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Formula-injection guard: a cell starting with = + - @ | or % (after any
  // leading whitespace) would be executed as a formula by spreadsheet apps.
  // Prefixing with a single quote forces text treatment.
  if (/^\s*[=+\-@|%]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

type ExportRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  status: string;
  risk_score: number | null;
  risk_band: string | null;
  vendors: { legal_name: string } | { legal_name: string }[] | null;
};

function vendorName(row: ExportRow): string {
  if (!row.vendors) return "";
  if (Array.isArray(row.vendors)) return row.vendors[0]?.legal_name ?? "";
  return row.vendors.legal_name ?? "";
}

/**
 * POST /api/invoices/export — CSV export of approved invoices (premium feature).
 * POST, not GET: the export mutates state (marks rows exported), so a plain
 * link GET would let any site trigger it. Optional `ids` form field (or
 * ?ids= query) exports a selection, otherwise all approved invoices.
 * Rows are marked 'exported' first and the CSV is built from exactly the
 * rows that were marked, so a concurrent status change can neither
 * double-export a row nor silently drop one from the file.
 */
export async function POST(req: Request) {
  try {
    // Both keys are required: the publishable key gates the login check and
    // the service key runs the queries. With only the service key set, the
    // login gate below would be skipped and the export unauthenticated.
    if (!configured || !adminConfigured) {
      return NextResponse.json({ error: "Export is not configured" }, { status: 503 });
    }
    const { data: { user } } = await (await supabase()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    // Selection comes from the `ids` form field, falling back to ?ids=.
    const form = await req.formData().catch(() => null);
    const idsValue = form?.get("ids");
    const idsParam = (typeof idsValue === "string" ? idsValue : null) ?? new URL(req.url).searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const sb = admin();
    // Only approved invoices may be exported: the guard_invoice_status
    // trigger rejects 'exported' from any other status.
    let query = sb.from("invoices").select("id,invoice_number,invoice_date,due_date,currency,subtotal,tax_total,total,status,risk_score,risk_band,vendors(legal_name)").eq("status", "approved");
    if (ids.length > 0) query = query.in("id", ids);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ExportRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: ids.length > 0 ? "No approved invoices match the requested selection" : "No approved invoices to export" }, { status: 400 });
    }
    const exportIds = rows.map((row) => row.id);
    // Mark the exported rows FIRST. The .eq("status", "approved") guard keeps
    // a concurrently changed row from being force-exported (the DB trigger
    // would reject it anyway); .select("id") tells us exactly which rows
    // were marked, and the CSV below is built from those rows only.
    const { data: marked, error: updateError } = await sb.from("invoices").update({ status: "exported" }).in("id", exportIds).eq("status", "approved").select("id");
    if (updateError) {
      console.error("Invoice export failed while marking rows exported:", updateError.message);
      return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
    const markedIds = new Set((marked ?? []).map((r) => r.id));
    const exportedRows = rows.filter((row) => markedIds.has(row.id));
    if (exportedRows.length === 0) {
      // Every row changed status before the update: fail closed with no CSV
      // rather than handing out a file whose rows were never marked.
      return NextResponse.json({ error: "Export aborted: the selected invoices changed status before they could be marked exported. Nothing was exported." }, { status: 409 });
    }
    const skipped = rows.length - exportedRows.length;
    if (skipped > 0) {
      console.warn(`Invoice export: ${skipped} of ${rows.length} invoices changed status before the update and were left out of the file.`);
    }
    const header = ["invoice_number", "invoice_date", "due_date", "vendor_legal_name", "currency", "subtotal", "tax_total", "total", "status", "risk_score", "risk_band"];
    // Every row in the file was just marked exported, so the status column
    // says "exported" (the fetched rows still carry "approved").
    const lines = exportedRows.map((row) =>
      [row.invoice_number, row.invoice_date, row.due_date, vendorName(row), row.currency, row.subtotal, row.tax_total, row.total, "exported", row.risk_score, row.risk_band].map(csvCell).join(",")
    );
    const csv = [header.join(","), ...lines].join("\n") + "\n";
    const filename = `invoices-export-${new Date().toISOString().slice(0, 10)}.csv`;
    const headers: Record<string, string> = {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    };
    if (skipped > 0) headers["x-export-skipped"] = String(skipped);
    return new NextResponse(csv, { status: 200, headers });
  } catch (e: any) {
    console.error("Invoice export failed:", e?.message || e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
