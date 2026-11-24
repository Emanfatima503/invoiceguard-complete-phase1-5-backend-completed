# InvoiceGuard

AI invoice fraud and anomaly detection. Upload an invoice (PDF, PNG or JPEG) and InvoiceGuard extracts its fields, checks it against vendor and bank-account history, scores its fraud risk, flags duplicates, and routes suspicious invoices to a human review queue. Nothing is approved or exported without a human decision: those gates are enforced in the database, not just in the UI.

## How it works

- **Intake.** Browser upload posts to the Next.js `/api/intake` route; automated sources post attachments to the n8n intake webhook. Both validate file type and size (10 MB max), hash the file (SHA-256), block exact duplicates, store the file privately, and create an invoice row.
- **Processing.** Text extraction, OCR fallback, Groq field normalization, vendor and bank-account resolution, deterministic risk scoring and duplicate matching all run in the Next.js `processInvoice` function (`invoiceguard/web/src/lib/invoice-processing.ts`). n8n only intakes and triggers processing; it does not extract or score.
- **Review.** Risk findings, duplicate candidates, approvals and the append-only audit log live in Supabase and are surfaced in the Next.js dashboard.

## Tech stack

- Next.js 16 + Tailwind 4 + Motion dashboard (`invoiceguard/web`)
- Supabase: Postgres schema, Auth, private Storage bucket (`invoiceguard/supabase`)
- n8n workflows for automated intake (`invoiceguard/n8n`)
- Groq for field normalization, OCR.space as the OCR fallback
- Gmail ingestion via a manual n8n setup (no trigger workflow ships in the repo)

## Repository structure

```
invoiceguard/
├── docs/
│   ├── PHASE-0-SETUP.md   ← start here: Supabase project, schema, login, dashboard
│   └── PHASES.md          ← what each phase implements
├── n8n/
│   ├── phase-1-intake.json        ← automated intake webhook workflow
│   ├── phase-2-5-processing.json  ← processing bridge workflow
│   └── README.md                  ← env vars, webhook auth, Gmail manual setup
├── supabase/
│   ├── 001_schema.sql     ← 9 tables, RLS, private invoices bucket, audit triggers
│   └── tests/             ← optional local Postgres checks
└── web/                   ← Next.js dashboard (src/app, src/lib, API routes)
    └── .env.example       ← copy to .env.local and fill in (never commit .env.local)
```

## Setup

Follow [invoiceguard/docs/PHASE-0-SETUP.md](invoiceguard/docs/PHASE-0-SETUP.md): create the Supabase project, run `001_schema.sql`, create one login user, copy `invoiceguard/web/.env.example` to `.env.local` and fill it in, then `npm install` and `npm run dev` in `invoiceguard/web`.

Without a filled `.env.local` the dashboard runs in Preview mode with labelled sample data.

## Status

Honest status, from the code in this repo:

- Implemented in code: Supabase schema with database-level approve/export and bank-verification gates, Next.js dashboard and API routes, intake validation and duplicate stops, `processInvoice` extraction/normalization/detection/risk scoring, and the two n8n workflows as importable JSON.
- Manual setup required: Gmail ingestion (see `invoiceguard/n8n/README.md`) and header authentication on both n8n webhooks.
- Owner action: run `npm install` in `invoiceguard/web` on the build machine and commit the regenerated `package-lock.json` (this build changed `package.json`).
- Still needs live verification: n8n import and end-to-end runs, the Gmail flow, and the full intake-to-review path against a real Supabase project. Nothing in this repo has been run or tested from a static review alone.
