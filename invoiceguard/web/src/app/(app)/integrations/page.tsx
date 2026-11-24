import { PageShell } from "@/lib/page";

export default function IntegrationsPage() {
  const items = [
    ["Gmail", "Inbound invoice watch", "Configure n8n to download invoice attachments and POST them to the intake webhook."],
    ["OCR.space", "OCR fallback", "Used when PDF text extraction returns too little text, or the invoice is an image."],
    ["Groq", "AI extraction + explanation", "Normalizes invoice fields and produces reviewer-facing reasoning."],
    ["Supabase", "System of record", "Stores invoices, findings, reviews, audit evidence and private files."],
    ["n8n", "Orchestration", "Runs ingestion and triggers processing in the Next.js app, which handles extraction, risk scoring and duplicate matching."],
  ];
  return (
    <PageShell title="Integrations" description="Connected services and the processing pipeline.">
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([name, state, desc]) => (
          <div key={name} className="glass rounded-2xl p-5">
            <h2 className="font-display text-lg font-medium text-white">{name}</h2>
            <p className="mt-2 text-sm text-slate-300">{state}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{desc}</p>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-5">
        <h2 className="font-display font-medium text-white">Setup</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Setup instructions for the n8n workflows live in <span className="font-mono text-xs text-slate-300">n8n/README.md</span> in the repository.
          No live health status is shown on this page; a service listed here is part of the intended pipeline, not a claim that it is currently connected or running.
        </p>
      </div>
    </PageShell>
  );
}
