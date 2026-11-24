import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getInvoiceFileUrl, listInvoiceLineItems } from "@/lib/data";
import { retryInvoice } from "@/lib/actions";
import { PageShell, Status, Empty } from "@/lib/page";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabase();
  const [inv, findings, reviews, runs, lineItems, fileUrl] = await Promise.all([
    sb.from("invoices").select("*,vendors(legal_name,tax_id,contact_email)").eq("id", id).maybeSingle(),
    sb.from("risk_findings").select("reason_code,severity,evidence,score_contribution,status,created_at").eq("invoice_id", id).order("created_at", { ascending: false }),
    sb.from("invoice_reviews").select("decision,notes,decided_at").eq("invoice_id", id).order("decided_at", { ascending: false }),
    sb.from("extraction_runs").select("provider,model_version,normalized_output,confidence,created_at").eq("invoice_id", id).order("created_at", { ascending: false }),
    // These two throw on error (unlike the queries above, which return
    // { data, error }): guard them so one failing lookup does not take the
    // whole page down. The page already renders both empty states.
    listInvoiceLineItems(id).catch(() => []),
    getInvoiceFileUrl(id).catch(() => null),
  ]);
  if (inv.error) throw new Error(inv.error.message);
  if (!inv.data) notFound();
  return (
    <PageShell
      title={inv.data.invoice_number || "Invoice detail"}
      description={`${inv.data.vendors?.legal_name || "Unknown vendor"} · ${inv.data.file_name || "source document"}`}
      action={<Link href="/invoices" className="rounded-xl bg-white/5 px-4 py-2 text-sm text-slate-200">Back to invoices</Link>}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h2 className="font-display font-medium text-white">Invoice fields</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[["Vendor", inv.data.vendors?.legal_name || "—"], ["Invoice date", inv.data.invoice_date || "—"], ["Due date", inv.data.due_date || "—"], ["Subtotal", `${inv.data.currency} ${inv.data.subtotal ?? "—"}`], ["Tax", `${inv.data.currency} ${inv.data.tax_total ?? "—"}`], ["Total", `${inv.data.currency} ${inv.data.total ?? "—"}`]].map(([a, b]) => (
              <div key={a}>
                <p className="text-xs text-slate-500">{a}</p>
                <p className="mt-1 text-sm text-slate-200">{b}</p>
              </div>
            ))}
          </div>
          {fileUrl && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="text-xs text-slate-500">Source file</p>
              <p className="mt-1 text-sm text-slate-300">{fileUrl.file_name || "source document"} <span className="text-xs text-slate-500">({fileUrl.mime_type || "unknown type"})</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={fileUrl.url} target="_blank" rel="noreferrer" className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">View original file</a>
                <a href={fileUrl.url} download={fileUrl.file_name} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">Download</a>
              </div>
            </div>
          )}
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-slate-500">Status</p>
          <div className="mt-2"><Status value={inv.data.status} /></div>
          <p className="mt-5 text-xs text-slate-500">Risk</p>
          <p className="mt-1 font-display text-3xl font-semibold text-white">{inv.data.risk_score ?? "—"}</p>
          <p className="text-xs capitalize text-slate-500">{inv.data.risk_band || "not scored"}</p>
          {inv.data.status === "failed" && (
            <form action={retryInvoice} className="mt-5 border-t border-white/5 pt-4">
              <input type="hidden" name="invoice_id" value={inv.data.id} />
              <p className="text-xs text-slate-500">Processing failed for this invoice.</p>
              <button className="mt-2 w-full rounded-xl bg-warn/10 px-3 py-2 text-xs font-medium text-warn">Retry processing</button>
            </form>
          )}
        </div>
      </div>
      <section className="glass rounded-2xl p-5">
        <h2 className="font-display font-medium text-white">Line items</h2>
        {!lineItems || lineItems.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">No line items extracted yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                <tr>{["#", "Description", "Qty", "Unit price", "Tax", "Line total"].map((h) => <th key={h} className="px-3 py-3 first:pl-0">{h}</th>)}</tr>
              </thead>
              <tbody>
                {lineItems.map((item: any) => (
                  <tr key={item.id} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-3 first:pl-0 text-slate-500">{item.position}</td>
                    <td className="px-3 py-3 text-slate-200">{item.description || "—"}</td>
                    <td className="px-3 py-3 text-slate-400">{item.quantity ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-400">{item.unit_price == null ? "—" : Number(item.unit_price).toLocaleString()}</td>
                    <td className="px-3 py-3 text-slate-400">{item.tax_rate == null ? "—" : `${(Number(item.tax_rate) * 100).toLocaleString()}%`}</td>
                    <td className="px-3 py-3 text-slate-200">{item.line_total == null ? "—" : Number(item.line_total).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Risk findings" empty="No findings yet.">
          {findings.data?.map((f) => (
            <div key={`${f.reason_code}-${f.created_at}`} className="border-b border-white/5 py-3 last:border-0">
              <div className="flex justify-between gap-3">
                <span className="text-sm text-white">{f.reason_code.replaceAll("_", " ")}</span>
                <span className="text-xs text-danger">+{f.score_contribution}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{f.severity} · {f.status}</p>
              <p className="mt-2 text-xs text-slate-400">{f.evidence?.message || JSON.stringify(f.evidence)}</p>
            </div>
          ))}
        </Section>
        <Section title="AI extraction" empty="No extraction run yet.">
          {runs.data?.map((r) => (
            <div key={`${r.provider}-${r.created_at}`} className="border-b border-white/5 py-3 last:border-0">
              <p className="text-sm text-white">{r.provider} {r.model_version ? `· ${r.model_version}` : ""}</p>
              <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-black/20 p-3 text-[11px] text-slate-400">{JSON.stringify(r.normalized_output, null, 2)}</pre>
            </div>
          ))}
        </Section>
      </div>
      <Section title="Review history" empty="No human review recorded yet.">
        {reviews.data?.map((r, i) => (
          <div key={i} className="border-b border-white/5 py-3 last:border-0">
            <p className="text-sm text-white">{r.decision.replaceAll("_", " ")}</p>
            <p className="mt-1 text-xs text-slate-500">{new Date(r.decided_at).toLocaleString()}</p>
            {r.notes && <p className="mt-2 text-sm text-slate-400">{r.notes}</p>}
          </div>
        ))}
      </Section>
    </PageShell>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: any }) {
  const arr = Array.isArray(children) ? children : children?.props?.children;
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="font-display font-medium text-white">{title}</h2>
      {!arr || arr.length === 0 ? <p className="py-6 text-sm text-slate-500">{empty}</p> : <div className="mt-2">{children}</div>}
    </section>
  );
}
