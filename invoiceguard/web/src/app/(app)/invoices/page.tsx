import Link from "next/link";
import { Search, UploadCloud } from "lucide-react";
import { countInvoices, listInvoices } from "@/lib/data";
import { PageShell, Empty, Status } from "@/lib/page";

const PAGE_SIZE = 20;

function pageHref(page: number, q: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/invoices?${qs}` : "/invoices";
}

function pageWindow(current: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const query = q ? q : undefined;

  let rows: any[] = [];
  let total = 0;
  let error = "";
  let safePage = page;
  try {
    total = await countInvoices({ query });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    safePage = Math.min(page, totalPages);
    rows = await listInvoices({ query, offset: (safePage - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  } catch (e: any) {
    error = e.message;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, safePage * PAGE_SIZE);

  return (
    <PageShell
      title="Invoices"
      description="Invoice inbox with vendor, number, amount, date and status."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <form method="post" action="/api/invoices/export">
            <button type="submit" className="rounded-xl bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
              Export CSV
            </button>
          </form>
          <Link href="/invoices/upload" className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-teal px-4 py-2 text-sm font-medium text-white">
            <UploadCloud className="size-4" /> Upload invoice
          </Link>
        </div>
      }
    >
      <form method="get" action="/invoices" role="search" className="glass flex w-full max-w-md items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500">
        <Search className="size-4 shrink-0" />
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search invoices, vendors, numbers…"
          className="w-full bg-transparent text-slate-200 outline-none placeholder:text-slate-500"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10">
          Search
        </button>
      </form>
      {error ? (
        <Empty>{error}</Empty>
      ) : rows.length === 0 ? (
        <Empty>{q ? `No invoices match “${q}”.` : "No invoices yet. Upload a PDF or image to start intake."}</Empty>
      ) : (
        <>
          <div className="glass overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <tr>{["Invoice", "Vendor", "Date", "Amount", "Risk", "Status"].map((h) => <th key={h} className="px-5 py-4">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.025]">
                      <td className="px-5 py-4 font-medium text-white">
                        <Link href={`/invoices/${r.id}`} className="hover:text-brand">{r.invoice_number || "Unassigned"}</Link>
                        <div className="text-xs text-slate-500">{r.file_name || "—"}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-300">{r.vendors?.legal_name || "Unknown vendor"}</td>
                      <td className="px-5 py-4 text-slate-400">{r.invoice_date || "—"}</td>
                      <td className="px-5 py-4 text-slate-200">{r.total == null ? "—" : `${r.currency} ${Number(r.total).toLocaleString()}`}</td>
                      <td className="px-5 py-4">
                        <span className="text-slate-200">{r.risk_score ?? "—"}</span>
                        {r.risk_band && <span className="ml-2 text-xs text-slate-500">{r.risk_band}</span>}
                      </td>
                      <td className="px-5 py-4"><Status value={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <p>
              Showing {from}–{to} of {total} invoice{total === 1 ? "" : "s"}
              {q ? <> matching “{q}”</> : null}
            </p>
            <nav aria-label="Invoice pages" className="flex items-center gap-1">
              {safePage > 1 ? (
                <Link href={pageHref(safePage - 1, q)} className="rounded-lg bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10">Prev</Link>
              ) : (
                <span className="rounded-lg bg-white/[.02] px-3 py-1.5 text-slate-600">Prev</span>
              )}
              {pageWindow(safePage, totalPages).map((p) => (
                <Link
                  key={p}
                  href={pageHref(p, q)}
                  aria-current={p === safePage ? "page" : undefined}
                  className={p === safePage ? "rounded-lg bg-brand/20 px-3 py-1.5 font-medium text-white" : "rounded-lg bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"}
                >
                  {p}
                </Link>
              ))}
              {safePage < totalPages ? (
                <Link href={pageHref(safePage + 1, q)} className="rounded-lg bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10">Next</Link>
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
