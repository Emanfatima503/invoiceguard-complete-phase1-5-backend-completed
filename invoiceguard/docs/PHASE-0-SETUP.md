# InvoiceGuard — Phase 0 setup (Foundation)

**Goal of this phase:** a new Supabase project with the full database, a private file bucket, one login user, and the dashboard running on your machine.

**Exit check:** you can log in at `http://localhost:3000` and see the dashboard with zeros and no "Preview mode" badge.

Takes about 15 minutes.

---

## What's in the folder

```
invoiceguard/
├── supabase/
│   ├── 001_schema.sql        ← paste into Supabase SQL Editor
│   └── tests/                ← optional: local Postgres checks (stubs.sql + checks.sql)
├── web/                      ← Next.js 16 + Tailwind 4 + Motion dashboard
│   ├── .env.example
│   └── src/
│       ├── proxy.ts          ← session refresh + redirect to /login
│       ├── lib/supabase.ts   ← server-side Supabase client
│       ├── lib/nav.ts        ← all 11 sidebar routes + which phase builds them
│       ├── components/       ← sidebar, KPI cards, risk gauge, trend chart
│       └── app/
│           ├── login/        ← animated login + server actions
│           └── (app)/        ← dashboard, placeholders, loading/error states
└── docs/PHASE-0-SETUP.md     ← this file
```

---

## Step 1: Create the Supabase project

1. Go to **supabase.com → New project**.
2. Name: `invoiceguard`. Region: pick the closest (e.g. Mumbai or Singapore).
3. Set a strong database password and save it in your password manager.
4. Wait about 2 minutes for it to finish provisioning.

## Step 2: Run the schema

1. Left menu → **SQL Editor → New query**.
2. Open `supabase/001_schema.sql`, copy **all** of it, paste, then click **Run**.
3. You should see `Success. No rows returned`.
4. Check it worked:
   - **Table Editor** shows 9 tables: `vendors`, `vendor_bank_accounts`, `invoices`, `invoice_line_items`, `extraction_runs`, `risk_findings`, `duplicate_candidates`, `invoice_reviews`, `audit_events`.
   - **Storage** shows a private bucket called `invoices`.

> Run the file only once. Running it again fails with "already exists", which is harmless but means nothing new was applied.

## Step 3: Create your login (single user)

1. **Authentication → Users → Add user → Create new user**.
2. Enter your email and a password, and tick **Auto Confirm User**.
3. **Authentication → Sign In / Providers → Email** (or Settings, depending on the dashboard version): turn **off** "Allow new users to sign up". Now only you can ever log in.

## Step 4: Copy your keys

**Project Settings → API Keys**. You need two values for the dashboard:

| Value | Where it goes |
|---|---|
| Project URL | `web/.env.local` → `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`, or the legacy **anon** key) | `web/.env.local` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_…`, or legacy **service_role**) | `web/.env.local` server-only variable `SUPABASE_SERVICE_ROLE_KEY` **and** the n8n environment variable `SUPABASE_SERVICE_ROLE_KEY` |

⚠️ The secret key bypasses all security rules. Never commit it, never put it in committed source code, and never paste it in chat.

## Step 5: Run the dashboard

You need Node.js 20.9 or newer.

```bash
cd invoiceguard/web
cp .env.example .env.local      # then edit URL, publishable key and server-only secret
npm install
npm run dev
```

Open **http://localhost:3000**. You'll be sent to `/login`. Sign in with the user from Step 3 and the dashboard should load with zeros.

> If you open it **before** filling `.env.local`, it runs in **Preview mode** with labelled sample data, so you can see the design. That's expected.

---

## What the database already protects

These rules live inside Postgres, so they hold even if the UI or n8n has a bug. Each one was tested on Postgres 16:

| Rule | Blueprint ref | Tested result |
|---|---|---|
| Same file (SHA-256) can't be ingested twice | 4.12 #1 | ✅ second insert rejected |
| Same vendor + invoice number is **allowed** and stored, so Phase 2 can flag it instead of silently dropping a fraud attempt | 4.6 | ✅ stored |
| Invoice numbers are normalised: `inv-001 / 42` → `INV00142` | 4.5 | ✅ |
| Can't set status `approved` without a human `approve` review | 4.12 #7 | ✅ blocked |
| Can't set status `exported` unless already `approved` | 4.1 | ✅ blocked |
| n8n (no logged-in user) can't mark a bank account `verified`. Only you can. | 4.12 #4 | ✅ blocked |
| A new bank account becomes a **new row**. Verified rows are never overwritten and fingerprints can't be edited. | 4.12 #4 | ✅ |
| Every insert, update and delete on 6 key tables writes to `audit_events`, including before and after values and whether it was you or n8n | 4.12 #6 | ✅ |
| `audit_events` can't be edited or deleted | 4.3 | ✅ blocked |
| Money is `numeric(14,2)` and currency is a 3-letter ISO code | 4.6 | ✅ |
| Row Level Security: logged-out visitors read nothing. You can read everything and write reviews. No delete permission from the UI. | C.3 | n/a |

To re-run the tests yourself, you need local Postgres 16: run `stubs.sql`, then `001_schema.sql`, then `checks.sql` from `supabase/tests/`. The lines that are expected to fail say so in the comments.

---

## Phase 0 checklist

- [ ] Supabase project `invoiceguard` created
- [ ] `001_schema.sql` ran: 9 tables and the `invoices` bucket are visible
- [ ] User created and public sign-ups disabled
- [ ] `web/.env.local` filled with the URL and publishable key
- [ ] `npm run dev` works, you can log in, and the dashboard shows zeros
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set server-side and secret saved safely

When all boxes are ticked, Phase 1 builds the intake. The two sources feed the same pipeline through different doors: drag-and-drop upload in the browser posts straight to the Next.js `/api/intake` route, which validates the file, hashes it, blocks SHA-256 duplicates, stores it privately, creates the invoice row, and runs processing in-process. Automated sources post attachments to the n8n intake webhook (`n8n/phase-1-intake.json`), which does the same hashing, duplicate stop, storage and row creation, then triggers processing through `POST /api/invoices/process`. In both cases the text extraction, OCR.space fallback, Groq normalization and risk scoring run in the Next.js `processInvoice` function, not in n8n. Gmail ingestion is a manual n8n setup, not a shipped workflow: see `n8n/README.md` for the exact steps.
