import Link from "next/link";
import { countRiskFindings, listRiskFindings } from "@/lib/data";
import { updateFindingStatus } from "@/lib/actions";
import { PageShell, Empty, Status } from "@/lib/page";

const PAGE_SIZE = 20;

function pageHref(page: number): string {
  return page > 1 ? `/risk-review?page=${page}` : "/risk-review";
}

function pageWindow(current: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

export default async function RiskPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  let rows: any[] = [];
  let total = 0;
  let error = "";
  let safePage = page;
  try {
    total = await countRiskFindings();
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    safePage = Math.min(page, totalPages);
    rows = await listRiskFindings({ limit: PAGE_SIZE, offset: (safePage - 1) * PAGE_SIZE });
  } catch (e: any) {
    error = e.message;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, safePage * PAGE_SIZE);

  return (
    <PageShell title="Risk review" description="Prioritised suspicious invoices with deterministic reason codes.">
      {error ? (
        <Empty>{error}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No risk findings yet. Detection runs after extraction.</Empty>
      ) : (
        <>
          <div className="grid gap-4">
            {rows.map((r) => {
              const resolved = r.status === "confirmed" || r.status === "dismissed";
              return (
                <div key={r.id} className="glass rounded-2xl p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">{r.reason_code.replaceAll("_", " ")}</p>
                      <h2 className="mt-1 font-display text-lg font-medium text-white">{r.invoices?.invoice_number || "Unassigned invoice"}</h2>
                      <p className="text-sm text-slate-400">{r.invoices?.vendors?.legal_name || "Unknown vendor"} · {r.invoices?.currency || ""} {r.invoices?.total ?? "—"}</p>
                    </div>
                    <div className="flex gap-2">
                      <Status value={r.severity} />
                      <Status value={r.status} />
                      <span className="rounded-full bg-danger/10 px-2.5 py-1 text-[11px] text-danger">+{r.score_contribution}</span>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-300">{r.evidence?.message || r.evidence?.reason || JSON.stringify(r.evidence)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {resolved ? (
                      <form action={updateFindingStatus}>
                        <input type="hidden" name="finding_id" value={r.id} />
                        <input type="hidden" name="status" value="open" />
                        <button className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white">Reopen</button>
                      </form>
                    ) : (
                      <>
                        <form action={updateFindingStatus}>
                          <input type="hidden" name="finding_id" value={r.id} />
                          <input type="hidden" name="status" value="confirmed" />
                          <button className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">Confirm</button>
                        </form>
                        <form action={updateFindingStatus}>
                          <input type="hidden" name="finding_id" value={r.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <button className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white">Dismiss</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <p>
              Showing {from}–{to} of {total} finding{total === 1 ? "" : "s"}
            </p>
            <nav aria-label="Risk finding pages" className="flex items-center gap-1">
              {safePage > 1 ? (
                <Link href={pageHref(safePage - 1)} className="rounded-lg bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10">Prev</Link>
              ) : (
                <span className="rounded-lg bg-white/[.02] px-3 py-1.5 text-slate-600">Prev</span>
              )}
              {pageWindow(safePage, totalPages).map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  aria-current={p === safePage ? "page" : undefined}
                  className={p === safePage ? "rounded-lg bg-brand/20 px-3 py-1.5 font-medium text-white" : "rounded-lg bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"}
                >
                  {p}
                </Link>
              ))}
              {safePage < totalPages ? (
                <Link href={pageHref(safePage + 1)} className="rounded-lg bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10">Next</Link>
              ) : (
                <span className="rounded-lg bg-white/[.02] px-3 py-1.5 text-slate-600">Next</span>
              )}
            </nav>
          </div>
        </>
      )}
    </PageShell>
  );
}
