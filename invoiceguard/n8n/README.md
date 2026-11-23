# InvoiceGuard n8n workflows

## Environment variables

Configure these in n8n before activating the workflows:

- `SUPABASE_URL` — InvoiceGuard Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase secret key
- `INVOICEGUARD_BASE_URL` — URL of the running Next.js app, for example `http://localhost:3000`
- `PROCESSING_SECRET` — must match `web/.env.local`

## Workflows

### phase-1-intake.json
Browser/Gmail intake pipeline. It hashes the file, blocks an exact SHA-256 duplicate, stores the private file, creates the invoice row, then calls the Phase 2–5 processing endpoint.

### phase-2-5-processing.json
Small automation bridge that accepts an `invoice_id` and calls the Next.js processing endpoint. The processing service performs text/OCR extraction, Groq normalization when configured, vendor resolution, deterministic detection/risk scoring, duplicate candidate creation and status updates.

Import both JSON files into n8n. The browser upload path can process directly without n8n; Gmail/other automated sources can use the n8n intake webhook.
