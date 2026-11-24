import { listInvoices } from "@/lib/data";
import { bulkReview, reviewInvoice } from "@/lib/actions";
import { PageShell, Empty, Status } from "@/lib/page";

// Queue statuses, exactly as the original page filtered them client-side.
// Filtering now happens in the query, before the cap, so no waiting invoice
// is pushed out of the queue by invoices in other statuses.
const QUEUE_STATUSES = ["needs_review", "in_review", "info_requested"];

export default async function ApprovalsPage() {
  let rows: any[] = [];
  let error = "";
  try {
    rows = await listInvoices({ status: QUEUE_STATUSES, limit: 100 });
  } catch (e: any) {
    error = e.message;
  }
  return (
    <PageShell title="Approvals" description="Finance review queue: verify, request information, approve or reject.">
      {error ? (
        <Empty>{error}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No invoices are waiting for human approval.</Empty>
      ) : (
        <>
          <form id="bulk-review-form" action={bulkReview} className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-400">Bulk action for the checked invoices below:</p>
            <input name="notes" placeholder="Bulk note (optional)" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
            <div className="flex gap-2">
              <button name="decision" value="approve" className="rounded-xl bg-teal/10 px-4 py-2 text-xs font-medium text-teal">Bulk approve</button>
              <button name="decision" value="reject" className="rounded-xl bg-danger/10 px-4 py-2 text-xs font-medium text-danger">Bulk reject</button>
            </div>
          </form>
          <div className="grid gap-4">
            {rows.map((r) => (
              <div key={r.id} className="glass rounded-2xl p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="invoice_id"
                      value={r.id}
                      form="bulk-review-form"
                      aria-label={`Select ${r.invoice_number || "unassigned invoice"} for bulk review`}
                      className="mt-1.5 size-4 shrink-0 accent-teal"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-medium text-white">{r.invoice_number || "Unassigned"}</h2>
                        <Status value={r.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{r.vendors?.legal_name || "Unknown vendor"} · {r.currency} {r.total ?? "—"}</p>
                      <p className="mt-1 text-xs text-slate-500">Risk {r.risk_score ?? "—"} · {r.risk_band ?? "not scored"}</p>
                    </div>
                  </div>
                  <form action={reviewInvoice} className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
                    <input type="hidden" name="invoice_id" value={r.id} />
                    <input name="notes" placeholder="Review note (optional)" className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 sm:col-span-2" />
                    <button name="decision" value="verify_fields" className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white">Verify fields</button>
                    <button name="decision" value="approve" className="rounded-xl bg-teal/10 px-3 py-2 text-xs font-medium text-teal">Approve</button>
                    <button name="decision" value="reject" className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">Reject</button>
                    <button name="decision" value="request_info" className="rounded-xl bg-warn/10 px-3 py-2 text-xs font-medium text-warn">Request info</button>
                    <button name="decision" value="mark_suspicious" className="rounded-xl bg-brand/10 px-3 py-2 text-xs font-medium text-brand">Mark suspicious</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
