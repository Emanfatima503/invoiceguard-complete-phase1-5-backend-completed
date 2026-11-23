import { AlertTriangle, Copy, FileStack, Hourglass, Wallet, Activity } from "lucide-react";
import { KpiCard, RiskGauge, TrendChart, type TrendPoint } from "@/components/charts";
import { configured, supabase } from "@/lib/supabase";

type Kpis = {
  invoices_received: number; invoices_processed: number; pending_review: number; high_risk_flags: number;
  duplicate_candidates: number; avg_open_risk: number | null; amount_under_review: Record<string, number>;
};
type AuditRow = { id: string; action: string; actor_type: string; created_at: string };

// Shown only while Supabase isn't connected, so you can see the design. Clearly labelled in the UI.
const PREVIEW = {
  kpis: { invoices_received: 148, invoices_processed: 141, pending_review: 12, high_risk_flags: 4,
    duplicate_candidates: 3, avg_open_risk: 41, amount_under_review: { PKR: 2_380_000 } } as Kpis,
  trend: [9, 14, 11, 17, 13, 21, 16, 19].map((n, i) => ({
    week: new Date(Date.now() - (7 - i) * 7 * 864e5).toISOString().slice(0, 10),
    invoices: n, avg_score: [18, 22, 31, 27, 44, 38, 29, 41][i], high_risk: [0, 1, 1, 0, 3, 2, 1, 2][i],
  })) as TrendPoint[],
  activity: [
    ["invoices.insert", "system", 3], ["risk_findings.insert", "system", 9], ["invoice_reviews.insert", "user", 42],
    ["invoices.update", "user", 43], ["duplicate_candidates.insert", "system", 95],
  ].map(([action, actor_type, mins], i) => ({ id: String(i), action, actor_type,
    created_at: new Date(Date.now() - Number(mins) * 6e4).toISOString() })) as AuditRow[],
};

async function load() {
  if (!configured) return PREVIEW;
  const sb = await supabase();
  const [k, t, a] = await Promise.all([
    sb.from("dashboard_kpis").select("*").single(),
    sb.from("risk_trend").select("*"),
    sb.from("audit_events").select("id, action, actor_type, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const err = k.error ?? t.error ?? a.error;
  if (err) throw new Error(`Supabase: ${err.message}. Did you run supabase/001_schema.sql?`);
  return { kpis: k.data as Kpis, trend: (t.data ?? []) as TrendPoint[], activity: (a.data ?? []) as AuditRow[] };
}

const ACTION_LABEL: Record<string, string> = {
  "invoices.insert": "Invoice received", "invoices.update": "Invoice updated",
  "risk_findings.insert": "Risk finding raised", "duplicate_candidates.insert": "Duplicate candidate found",
  "invoice_reviews.insert": "Finance review recorded", "vendor_bank_accounts.insert": "New bank account seen",
  "vendor_bank_accounts.update": "Bank account status changed", "vendors.insert": "Vendor added",
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

export default async function Dashboard() {
  const { kpis, trend, activity } = await load();
  const [cur, amount] = Object.entries(kpis.amount_under_review)[0] ?? ["PKR", 0];

  const cards = [
    { label: "Invoices received", value: kpis.invoices_received, hint: `${kpis.invoices_processed} fully processed`, icon: <FileStack className="size-4" />, tone: "brand" },
    { label: "Pending review", value: kpis.pending_review, hint: "Need human verification", icon: <Hourglass className="size-4" />, tone: "violet" },
    { label: "High-risk flags", value: kpis.high_risk_flags, hint: "Risk alerts, not confirmed fraud", icon: <AlertTriangle className="size-4" />, tone: "danger" },
    { label: "Duplicate candidates", value: kpis.duplicate_candidates, hint: "Pairs awaiting review", icon: <Copy className="size-4" />, tone: "warn" },
    { label: "Amount under review", value: Number(amount), currency: cur, hint: "Flagged amount, not confirmed loss", icon: <Wallet className="size-4" />, tone: "teal" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">Fraud-risk triage overview. Scores are review priorities, not fraud verdicts.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="glass rounded-2xl p-5 xl:col-span-2">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="font-display font-medium text-white">Risk trend · last 12 weeks</h2>
            <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" /> Invoices</span>
              <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-warn" /> Avg risk score</span>
            </div>
          </header>
          <TrendChart data={trend} />
        </section>
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-4 font-display font-medium text-white">Average open risk</h2>
          <RiskGauge score={kpis.avg_open_risk} />
        </section>
      </div>

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display font-medium text-white"><Activity className="size-4 text-teal" /> Recent activity</h2>
        {activity.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Nothing yet. Activity shows up here once invoices start arriving.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-white/10 pl-6">
            {activity.map((e) => (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[29px] top-1.5 size-2.5 rounded-full ring-4 ring-ink-950 ${e.actor_type === "user" ? "bg-teal" : "bg-brand"}`} />
                <p className="text-sm text-slate-200">{ACTION_LABEL[e.action] ?? e.action}</p>
                <p className="text-xs text-slate-500">{e.actor_type === "user" ? "You" : "n8n automation"} · {ago(e.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
