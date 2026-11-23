# InvoiceGuard — completion map

## Phase 0 — Foundation
- Supabase schema, RLS, private invoices bucket, immutable audit log.
- Next.js auth/session protection and dashboard.
- Database gates for approve/export and bank verification.

## Phase 1 — Intake
- Gmail attachment ingestion converges on the same intake pipeline as browser upload.
- Browser upload: PDF/PNG/JPEG, 10 MB limit, SHA-256 duplicate stop, private storage and invoice row creation.
- n8n starter workflow is included in `n8n/phase-1-intake.json`.

## Phase 2 — Detection
- Vendor registry.
- Deterministic risk findings and duplicate candidate storage.
- Reviewable duplicate status.
- Bank-account history model prevents fingerprint mutation.

## Phase 3 — AI extraction
- `extraction_runs` stores provider/model/raw/normalized/confidence output permanently.
- Groq is intended for field normalization and reviewer-facing explanation; OCR.space is the fallback when PDF text is insufficient.
- The invoice table exposes `ai_summary` for the reviewer UI.

## Phase 4 — Decisions
- Approvals queue is wired to `invoice_reviews`.
- Human approve is required before `approved`.
- Export is database-gated behind `approved`.
- Audit log is read-only in the UI and append-only in PostgreSQL.

## Phase 5 — Reporting
- Reports page calculates invoice volume, risk findings, duplicate candidates, review outcomes and exposure snapshot from live Supabase data.

## Frontend preservation
The existing visual system was retained: sidebar, typography, dark/glass surfaces, colors, KPI/chart components and motion language. Placeholder routes were made functional without redesigning the frontend.
