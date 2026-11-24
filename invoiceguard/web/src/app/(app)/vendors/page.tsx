import { getVendorRiskSummary, listVendorBankAccounts, listVendors, type VendorRiskSummary } from "@/lib/data";
import { verifyBankAccount, verifyVendor } from "@/lib/actions";
import { PageShell, Empty, Status } from "@/lib/page";

/** Row types come from the data loaders so the page follows their shapes. */
type VendorRow = Awaited<ReturnType<typeof listVendors>>[number];
type BankAccountRow = Awaited<ReturnType<typeof listVendorBankAccounts>>[number];

const RISK_BANDS = ["routine", "review", "priority", "hold"] as const;

export default async function VendorsPage() {
  let rows: VendorRow[] = [];
  let error = "";
  const bankAccountsByVendor: Record<string, BankAccountRow[]> = {};
  const riskByVendor: Record<string, VendorRiskSummary> = {};
  try {
    rows = await listVendors();
    const [accounts, risk] = await Promise.all([
      Promise.all(rows.map(async (v: VendorRow) => ({ vendorId: v.id, accounts: await listVendorBankAccounts(v.id) }))),
      getVendorRiskSummary(),
    ]);
    for (const entry of accounts) bankAccountsByVendor[entry.vendorId] = entry.accounts ?? [];
    for (const summary of risk ?? []) riskByVendor[summary.vendor_id] = summary;
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load vendors";
  }
  return (
    <PageShell title="Vendors" description="Vendor registry, identifiers and bank-account verification history.">
      {error ? (
        <Empty>{error}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No vendors have been created yet. Vendors are resolved during invoice intake.</Empty>
      ) : (
        <div className="grid gap-4">
          {rows.map((v) => {
            const accounts = bankAccountsByVendor[v.id] ?? [];
            const risk = riskByVendor[v.id];
            return (
              <div key={v.id} className="glass rounded-2xl p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-medium text-white">{v.legal_name}</h2>
                      <form action={verifyVendor} className="inline">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="verified" value={String(!v.verified)} />
                        <button title={v.verified ? "Click to mark unverified" : "Click to mark verified"} className="cursor-pointer">
                          <Status value={v.verified ? "verified" : "unverified"} />
                        </button>
                      </form>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{v.registration_id || "No registration ID"}</p>
                    <p className="mt-1 text-xs text-slate-500">Tax ID {v.tax_id || "—"} · {v.contact_email || "No contact email"}</p>
                    <p className="mt-1 text-xs text-slate-500">Baseline: {v.risk_baseline && Object.keys(v.risk_baseline).length ? JSON.stringify(v.risk_baseline) : "Not calculated"}</p>
                  </div>
                  <div className="lg:min-w-[280px]">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Invoice risk summary</p>
                    {!risk || risk.total === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No invoices yet.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {RISK_BANDS.map((band) => (
                          <span key={band} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] capitalize text-slate-300">
                            {band} {risk[band] ?? 0}
                          </span>
                        ))}
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white">Total {risk.total}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-5 border-t border-white/5 pt-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Bank accounts</p>
                  {accounts.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No bank accounts on file for this vendor.</p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {accounts.map((a: BankAccountRow) => (
                        <div key={a.id} className="rounded-xl border border-white/10 bg-white/[.025] p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-white">{a.bank_name || "Unknown bank"}</p>
                            <Status value={a.status} />
                          </div>
                          <p className="mt-1 text-sm text-slate-300">···· {a.account_last4 || "—"} · {a.currency || "—"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {a.verified_at ? `Verified ${new Date(a.verified_at).toLocaleString()}` : "Not verified yet"}
                          </p>
                          {a.status !== "verified" && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <form action={verifyBankAccount}>
                                <input type="hidden" name="id" value={a.id} />
                                <input type="hidden" name="status" value="verified" />
                                <button className="rounded-xl bg-teal/10 px-3 py-2 text-xs font-medium text-teal">Verify</button>
                              </form>
                              <form action={verifyBankAccount}>
                                <input type="hidden" name="id" value={a.id} />
                                <input type="hidden" name="status" value="rejected" />
                                <button className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">Reject</button>
                              </form>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
