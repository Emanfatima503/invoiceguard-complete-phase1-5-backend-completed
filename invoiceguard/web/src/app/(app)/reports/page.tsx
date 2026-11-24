import { countInvoices, countRiskFindings, listDuplicates, listInvoices, listReviews } from "@/lib/data";
import { PageShell, Empty } from "@/lib/page";

const OUTCOME_DECISIONS = ["approve", "reject", "request_info", "mark_suspicious", "verify_fields"];

export default async function ReportsPage() {
  let inv: Awaited<ReturnType<typeof listInvoices>> = [];
  let dups: Awaited<ReturnType<typeof listDuplicates>> = [];
  let reviews: Awaited<ReturnType<typeof listReviews>> = [];
  let invoiceCount = 0;
  let findingCount = 0;
  let error = "";
  try {
    [inv, dups, reviews, invoiceCount, findingCount] = await Promise.all([
      listInvoices(),
      listDuplicates(),
      listReviews(),
      countInvoices(),
      countRiskFindings(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load reports";
  }

  if (error) {
    return (
      <PageShell title="Reports" description="Operational fraud indicators, review outcomes and vendor anomalies.">
        <Empty>{error}</Empty>
      </PageShell>
    );
  }

  // Totals are grouped per currency. Different currencies are never summed
  // into one figure, and no total is labelled PKR unless it is PKR.
  const totalsByCurrency = new Map<string, number>();
  for (const x of inv) {
    const currency = x.currency || "Unknown";
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + Number(x.total || 0));
  }
  const currencyTotals = [...totalsByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b));

  const high = inv.filter((x) => ["priority", "hold"].includes(x.risk_band)).length;
  const approved = reviews.filter((x) => x.decision === "approve").length;

  return (
    <PageShell title="Reports" description="Operational fraud indicators, review outcomes and vendor anomalies.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Invoices", invoiceCount, ""], ["Risk findings", findingCount, ""], ["Duplicate candidates", dups.length, ""], ["Approved reviews", approved, "Among the 200 most recent reviews"]].map(([a, b, caption]) => (
          <div key={a} className="glass rounded-2xl p-5">
            <p className="text-sm text-slate-400">{a}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-white">{b}</p>
            {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display font-medium text-white">Exposure snapshot</h2>
          {currencyTotals.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No invoice values to total yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {currencyTotals.map(([currency, total]) => (
                <div key={currency} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-400">{currency}</span>
                  <span className="text-2xl font-semibold text-white">{currency} {total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Totals are grouped per currency and cover the {inv.length} most recent invoices returned by the list, not every invoice on record.
          </p>
          <p className="mt-4 text-sm text-slate-300">High-risk invoices among those shown: <span className="font-semibold text-danger">{high}</span></p>
        </div>
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display font-medium text-white">Review outcomes</h2>
          <div className="mt-4 space-y-2">
            {OUTCOME_DECISIONS.map((d) => (
              <div key={d} className="flex justify-between rounded-lg bg-white/[.025] px-3 py-2 text-sm">
                <span className="capitalize text-slate-400">{d.replaceAll("_", " ")}</span>
                <span className="text-white">{reviews.filter((x) => x.decision === d).length}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Outcomes cover the {reviews.length} most recent reviews returned by the list.</p>
        </div>
      </div>
    </PageShell>
  );
}
