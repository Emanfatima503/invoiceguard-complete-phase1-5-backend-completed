# InvoiceGuard n8n workflows

## Environment variables

Configure these in n8n before activating the workflows:

- `SUPABASE_URL` — InvoiceGuard Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase secret key
- `INVOICEGUARD_BASE_URL` — URL of the running Next.js app, for example `http://localhost:3000`
- `PROCESSING_SECRET` — must match `web/.env.local`

## Workflows

### phase-1-intake.json
Automated intake pipeline. It validates the file (PDF, PNG or JPEG only, max 10 MB), hashes it, blocks an exact SHA-256 duplicate, stores the private file, creates the invoice row, then calls the Next.js processing endpoint. The storage key matches the browser upload route exactly: `YYYY-MM-DD/<sha256>-<sanitized-filename>`.

Text extraction and OCR do **not** run in n8n. They run in the Next.js `processInvoice` function (`web/src/lib/invoice-processing.ts`), which the workflow triggers through `POST /api/invoices/process`.

### phase-2-5-processing.json
Small automation bridge that accepts an `invoice_id` and calls the Next.js processing endpoint. The processing service performs text/OCR extraction, Groq normalization when configured, vendor resolution, deterministic detection/risk scoring, duplicate candidate creation and status updates.

Import both JSON files into n8n. The browser upload path can process directly without n8n; Gmail/other automated sources can use the n8n intake webhook.

## Securing the webhooks (required manual step)

Both workflows expose a public webhook (`invoiceguard/intake` and `invoiceguard/process`). The shipped JSON files do **not** include webhook authentication, because an n8n header-auth credential can only reference a credential that already exists in your own n8n instance. Do this in n8n after importing, before activating either workflow:

1. In n8n, create a **Header Auth** credential (Credentials → New → Header Auth). Set the header name to `Authorization` and the value to a long random secret, for example `Bearer <random-secret>`. Save it and note the secret.
2. Open the **Invoice Intake Webhook** node in `phase-1-intake.json`, set **Authentication** to **Header Auth**, and select the credential you just created. Do the same on the **Process Invoice Webhook** node in `phase-2-5-processing.json`.
3. Every caller of these webhooks must send that same `Authorization` header. The Gmail intake workflow below is one such caller.

Until this step is done, anyone who knows the webhook URL can POST to it. Do not activate the workflows on a public n8n instance without it.

## Gmail intake (manual setup — no workflow file ships for this)

No Gmail trigger workflow is included in this repo, because the Gmail Trigger node needs a Gmail OAuth2 credential from your own Google account plus inbox filter choices that cannot be shipped as static JSON. Set it up in n8n as a third workflow:

1. Create a **Gmail OAuth2** credential in n8n (Credentials → New → Gmail OAuth2) and connect the mailbox that receives invoices.
2. Add a **Gmail Trigger** node using that credential. Set it to watch the inbox for new mail and filter to messages with attachments (for example, the trigger's filters, or a Gmail search such as `has:attachment`).
3. Enable attachment download on the trigger so each attachment arrives as binary data. If a message can carry more than one attachment, split the attachments so each one is processed as its own item.
4. Add an **HTTP Request** node that POSTs each attachment to the phase-1 intake webhook:
   - **URL:** copy the production URL from the **Invoice Intake Webhook** node (path `invoiceguard/intake`). Do not guess the host.
   - **Method:** POST, multipart/form-data.
   - **Binary field:** the attachment binary, sent under the field name `data`. The intake workflow reads `data` and rejects anything that is not PDF, PNG or JPEG, or is over 10 MB.
   - **Header:** `Authorization` with the same value as the header-auth credential configured above.
   - **Message id:** include the Gmail message id as `message_id` in the request body when possible. The intake workflow stores it as `source_message_id` on the invoice row.
5. Activate the workflow and send yourself a test invoice email. Check that a row appears in the `invoices` table with `source: email` and that processing completes.

The Next.js app's Integrations page describes this same setup in one line: configure n8n to download invoice attachments and POST them to the intake webhook.

## Live verification checklist

Static review cannot prove these workflows run. After importing, verify each item against a real n8n instance:

- [ ] Both workflows import without errors and activate.
- [ ] Header auth is enabled on both webhook nodes (see above).
- [ ] A test POST to the intake webhook with a small PDF creates an invoice row and the file lands in the `invoices` bucket under a `YYYY-MM-DD/<sha>-<name>` key.
- [ ] A first-time file (no duplicate) flows through the New File? branch to Accepted: the Duplicate Check returns zero items for a new file, so this is the regression the Always Output Data fix guards.
- [ ] Posting the same file twice creates no second row (the webhook answers on receipt, so check the execution log for the duplicate branch rather than the response body).
- [ ] A non-PDF/PNG/JPEG file, and a file over 10 MB, are rejected and create no row.
- [ ] The Gmail workflow (manual setup above) ingests an emailed invoice attachment end to end.
