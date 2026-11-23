# InvoiceGuard — Phase 1–5 backend completion

This implementation preserves the existing Next.js frontend and completes the backend processing path behind the existing pages.

## Processing path

1. Browser upload creates the invoice row and private storage object.
2. The intake route immediately calls the processing service.
3. Processing extracts PDF text with `pdftotext` when available, then `pdfjs-dist`, and uses OCR.space when text is insufficient or the source is an image.
4. `extraction_runs` records the text/OCR run and the Groq normalization run.
5. Vendors and bank-account fingerprints are resolved/created without mutating verified account fingerprints.
6. Deterministic duplicate, arithmetic, baseline and OCR/vendor findings are written to `risk_findings`.
7. Exact duplicate number/content pairs are written to `duplicate_candidates` for review.
8. The invoice receives a deterministic 0–100 risk score and `routine/review/priority/hold` band.
9. Routine invoices enter `in_review`; flagged invoices enter `needs_review` so the existing Approvals page can act on them.
10. Human decisions continue through the existing `invoice_reviews` actions and PostgreSQL approval/export guards.

## Required environment

In `web/.env.local` keep the existing Supabase URL/publishable key and server secret. Add:

- `GROQ_API_KEY` for Phase 3 AI normalization.
- `GROQ_MODEL` (default `llama-3.3-70b-versatile`).
- `OCR_SPACE_API_KEY` for scanned/image OCR and PDF fallback.
- `PROCESSING_SECRET` for protected automation calls.

If Groq is unavailable, deterministic field parsing is used as a safe fallback and the extraction run records the fallback reason. If OCR is needed and `OCR_SPACE_API_KEY` is missing, processing fails with an actionable message.

## Dependency

The web app now uses `pdfjs-dist` for PDF text extraction when a system `pdftotext` executable is not available.

After replacing the project files, run:

```powershell
cd web
npm install
npm run dev
```

## n8n

Import:

- `n8n/phase-1-intake.json`
- `n8n/phase-2-5-processing.json`

Set `INVOICEGUARD_BASE_URL` and `PROCESSING_SECRET` in n8n. Phase 1 now calls the processing endpoint after creating the invoice row, so Gmail intake converges on the same processing logic as browser uploads.
