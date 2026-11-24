import Link from "next/link";
import { countAudit, listAudit } from "@/lib/data";
import { PageShell, Empty } from "@/lib/page";

const PAGE_SIZE = 20;

function pageHref(page: number): string {
  return page > 1 ? `/audit-log?page=${page}` : "/audit-log";
}

function pageWindow(current: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

function prettyJson(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  let rows: Awaited<ReturnType<typeof listAudit>> = [];
  let total = 0;
  let error = "";
  let safePage = page;
  try {
    total = await countAudit();
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    safePage = Math.min(page, totalPages);
    rows = await listAudit({ limit: PAGE_SIZE, offset: (safePage - 1) * PAGE_SIZE });
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load the audit log";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, safePage * PAGE_SIZE);

  return (
    <PageShell title="Audit log" description="Immutable history of extraction, changes, reviews and overrides.">
      {error ? (
        <Empty>{error}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No audit events yet.</Empty>
      ) : (
        <>
          <div className="glass overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <tr>{["Time", "Actor", "Action", "Object", "ID", "Changes"].map((h) => <th key={h} className="px-5 py-4">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 align-top last:border-0">
                      <td className="px-5 py-4 text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-5 py-4 text-slate-300">{r.actor_type}</td>
                      <td className="px-5 py-4 text-white">{r.action}</td>
                      <td className="px-5 py-4 text-slate-400">{r.object_type}</td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">{r.object_id || "—"}</td>
                      <td className="px-5 py-4">
                        {r.before_json == null && r.after_json == null ? (
                          <span className="text-xs text-slate-600">No change data</span>
                        ) : (
                          <details className="min-w-64 text-xs">
                            <summary className="cursor-pointer text-brand hover:text-white">Before / after</summary>
                            <div className="mt-2 grid gap-2 lg:grid-cols-2">
                              <div>
                                <p className="text-[11px] uppercase tracking-wider text-slate-500">Before</p>
                                <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-black/20 p-3 text-[11px] text-slate-400">{prettyJson(r.before_json)}</pre>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-wider text-slate-500">After</p>
                                <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-black/20 p-3 text-[11px] text-slate-400">{prettyJson(r.after_json)}</pre>
                              </div>
                            </div>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <p>
              Showing {from}–{to} of {total} event{total === 1 ? "" : "s"}
            </p>
            <nav aria-label="Audit log pages" className="flex items-center gap-1">
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
