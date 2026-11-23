-- =====================================================================
-- InvoiceGuard — Phase 0 schema (Supabase / PostgreSQL)
-- Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a fresh project.
--
-- Design rules (from blueprint 4.6 + C.3):
--   * Money = numeric(14,2), never float. Currency = ISO 3-letter code.
--   * Bank details stored only as a fingerprint + last 4 digits.
--   * audit_events is append-only (UPDATE/DELETE are blocked).
--   * The browser (logged-in user) can READ everything and write reviews.
--     n8n uses the service_role key and does the heavy writes.
--   * Single-user app: no organizations table. (Add organization_id
--     to every table if this ever becomes multi-tenant.)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers ---------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- vendors ---------------------------------------------------
create table public.vendors (
  id               uuid primary key default gen_random_uuid(),
  legal_name       text not null,
  -- "ACME Traders (Pvt.) Ltd" -> "acmetraderspvtltd" ; used for matching
  normalized_name  text generated always as
                     (lower(regexp_replace(legal_name, '[^a-zA-Z0-9]', '', 'g'))) stored,
  tax_id           text,                -- NTN / GST / VAT number
  registration_id  text,
  contact_email    text,
  verified         boolean not null default false,
  risk_baseline    jsonb   not null default '{}'::jsonb,  -- median amount, invoices/month… (Phase 2)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index vendors_normalized_name_idx on public.vendors (normalized_name);
create unique index vendors_tax_id_uq on public.vendors (tax_id) where tax_id is not null;

-- ---------- vendor bank accounts -------------------------------------
-- One row per distinct account. A changed account is a NEW row
-- (status = unverified) — a verified row is never overwritten.
create table public.vendor_bank_accounts (
  id                   uuid primary key default gen_random_uuid(),
  vendor_id            uuid not null references public.vendors(id) on delete restrict,
  account_fingerprint  text not null,     -- sha256(normalized IBAN/account no.) computed in n8n
  account_last4        text check (account_last4 ~ '^[0-9A-Z]{4}$'),
  bank_name            text,
  currency             char(3) check (currency ~ '^[A-Z]{3}$'),
  status               text not null default 'unverified'
                         check (status in ('unverified','verified','rejected')),
  verified_at          timestamptz,
  verified_by          uuid,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  unique (vendor_id, account_fingerprint)
);

-- Only a logged-in human can verify an account; fingerprints are immutable.
create or replace function public.guard_bank_account() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.account_fingerprint <> old.account_fingerprint then
    raise exception 'account_fingerprint is immutable; add a new bank account row instead';
  end if;
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status <> 'verified') then
    if auth.uid() is null then
      raise exception 'bank accounts can only be verified by a logged-in reviewer';
    end if;
    new.verified_at := now();
    new.verified_by := auth.uid();
  end if;
  return new;
end $$;
create trigger vendor_bank_accounts_guard
  before insert or update on public.vendor_bank_accounts
  for each row execute function public.guard_bank_account();

-- ---------- invoices --------------------------------------------------
create table public.invoices (
  id                         uuid primary key default gen_random_uuid(),
  vendor_id                  uuid references public.vendors(id) on delete restrict, -- null until resolved
  bank_account_id            uuid references public.vendor_bank_accounts(id),
  document_type              text not null default 'invoice'
                               check (document_type in ('invoice','credit_note','revision')),
  invoice_number             text,
  -- "inv-001 / 42" -> "INV00142" ; used by duplicate checks
  normalized_invoice_number  text generated always as
                               (nullif(upper(regexp_replace(coalesce(invoice_number,''), '[^a-zA-Z0-9]', '', 'g')), '')) stored,
  invoice_date               date,
  due_date                   date,
  currency                   char(3) not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  subtotal                   numeric(14,2),
  tax_total                  numeric(14,2),
  total                      numeric(14,2),
  status                     text not null default 'received'
                               check (status in ('received','extracting','needs_review','in_review',
                                                 'info_requested','approved','rejected','exported','failed')),
  risk_score                 int check (risk_score between 0 and 100),
  risk_band                  text check (risk_band in ('routine','review','priority','hold')),
  ai_summary                 text,                      -- Phase 3: reviewer-facing explanation
  -- file + ingestion
  file_key                   text not null,             -- path inside the private "invoices" bucket
  file_name                  text,
  mime_type                  text,
  file_sha256                text not null,
  text_sha256                text,                      -- hash of normalized extracted text (catches re-saved copies)
  source                     text not null check (source in ('email','upload')),
  source_message_id          text,                      -- Gmail message id
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- Acceptance test: the same file is never ingested twice.
  constraint invoices_file_sha256_uq unique (file_sha256)
);
-- NOT unique on purpose: a repeated vendor+invoice number is a fraud signal.
-- We store it and flag it (Phase 2) instead of letting the DB silently drop it.
create index invoices_vendor_number_idx on public.invoices (vendor_id, normalized_invoice_number);
create index invoices_status_idx        on public.invoices (status);
create index invoices_created_idx       on public.invoices (created_at desc);
create index invoices_text_sha_idx      on public.invoices (text_sha256);
create unique index invoices_message_file_uq
  on public.invoices (source_message_id, file_sha256) where source_message_id is not null;

create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();
create trigger vendors_touch before update on public.vendors
  for each row execute function public.touch_updated_at();

-- ---------- line items -----------------------------------------------
create table public.invoice_line_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  position     int  not null default 1,
  description  text,
  quantity     numeric(14,4),
  unit_price   numeric(14,2),
  line_total   numeric(14,2),
  tax_rate     numeric(6,4)       -- 0.1800 = 18%
);
create index invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id);

-- ---------- extraction runs (OCR + LLM output, kept forever) ----------
create table public.extraction_runs (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references public.invoices(id) on delete cascade,
  provider           text not null,          -- 'pdf-text' | 'ocr.space' | 'groq'
  model_version      text,
  raw_output         jsonb,
  normalized_output  jsonb,                  -- the 4.10 contract
  confidence         jsonb,                  -- per-field confidence
  created_at         timestamptz not null default now()
);
create index extraction_runs_invoice_idx on public.extraction_runs (invoice_id, created_at desc);

-- ---------- risk findings (deterministic reason codes) ---------------
create table public.risk_findings (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  reason_code         text not null check (reason_code in (
                        'DUPLICATE_NUMBER','DUPLICATE_CONTENT','FUZZY_DUPLICATE',
                        'NEW_BANK_ACCOUNT','AMOUNT_ABOVE_BASELINE','ARITHMETIC_MISMATCH',
                        'LOW_OCR_CONFIDENCE','UNKNOWN_VENDOR','SUSPICIOUS_TERMS')),
  severity            text not null check (severity in ('low','medium','high')),
  evidence            jsonb not null default '{}'::jsonb,
  score_contribution  int  not null check (score_contribution between 0 and 100),
  status              text not null default 'open' check (status in ('open','confirmed','dismissed')),
  created_at          timestamptz not null default now(),
  unique (invoice_id, reason_code)          -- re-runs upsert instead of piling up
);
create index risk_findings_severity_idx on public.risk_findings (severity, status);

-- ---------- duplicate candidates -------------------------------------
create table public.duplicate_candidates (
  id             uuid primary key default gen_random_uuid(),
  invoice_a      uuid not null references public.invoices(id) on delete cascade,
  invoice_b      uuid not null references public.invoices(id) on delete cascade,
  match_score    numeric(5,2) not null check (match_score between 0 and 100),
  match_reasons  jsonb not null default '[]'::jsonb,
  review_status  text not null default 'pending'
                   check (review_status in ('pending','confirmed_duplicate','not_duplicate')),
  created_at     timestamptz not null default now(),
  check (invoice_a < invoice_b),            -- store each pair once, in a fixed order
  unique (invoice_a, invoice_b)
);

-- ---------- finance reviews ------------------------------------------
create table public.invoice_reviews (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  reviewer_id  uuid not null default auth.uid(),
  decision     text not null check (decision in
                 ('verify_fields','mark_suspicious','request_info','approve','reject')),
  notes        text,
  decided_at   timestamptz not null default now()
);
create index invoice_reviews_invoice_idx on public.invoice_reviews (invoice_id, decided_at desc);

-- Approval gate: an invoice can only become 'approved' after a human
-- 'approve' review, and only 'approved' invoices can become 'exported'.
create or replace function public.guard_invoice_status() returns trigger
language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'approved' and not exists (
       select 1 from public.invoice_reviews r
        where r.invoice_id = new.id and r.decision = 'approve') then
    raise exception 'invoice % needs an approve review before it can be approved', new.id;
  end if;
  if new.status = 'exported' and old.status <> 'approved' then
    raise exception 'only approved invoices can be exported (was %)', old.status;
  end if;
  return new;
end $$;
create trigger invoices_status_guard before update of status on public.invoices
  for each row execute function public.guard_invoice_status();

-- ---------- audit log (append-only) ----------------------------------
create table public.audit_events (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,                                   -- null = system (n8n)
  actor_type   text not null default 'system' check (actor_type in ('user','system')),
  action       text not null,                          -- e.g. invoices.update, duplicate_ingest_blocked
  object_type  text not null,
  object_id    uuid,
  before_json  jsonb,
  after_json   jsonb,
  created_at   timestamptz not null default now()
);
create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_object_idx  on public.audit_events (object_type, object_id);

create or replace function public.block_audit_changes() returns trigger
language plpgsql as $$
begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.block_audit_changes();

-- Writes one audit row for every insert/update/delete on watched tables.
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  insert into public.audit_events (actor_id, actor_type, action, object_type, object_id, before_json, after_json)
  values (uid,
          case when uid is null then 'system' else 'user' end,
          tg_table_name || '.' || lower(tg_op),
          tg_table_name,
          coalesce(new.id, old.id),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_vendors       after insert or update or delete on public.vendors              for each row execute function public.write_audit();
create trigger audit_bank_accounts after insert or update or delete on public.vendor_bank_accounts for each row execute function public.write_audit();
create trigger audit_invoices      after insert or update or delete on public.invoices             for each row execute function public.write_audit();
create trigger audit_findings      after insert or update or delete on public.risk_findings        for each row execute function public.write_audit();
create trigger audit_duplicates    after insert or update or delete on public.duplicate_candidates for each row execute function public.write_audit();
create trigger audit_reviews       after insert or update or delete on public.invoice_reviews      for each row execute function public.write_audit();

-- ---------- row level security ---------------------------------------
-- service_role (n8n) bypasses RLS. Logged-in user: read all, write
-- review-related tables. Anonymous: nothing.
do $$
declare t text;
begin
  foreach t in array array['vendors','vendor_bank_accounts','invoices','invoice_line_items',
                           'extraction_runs','risk_findings','duplicate_candidates',
                           'invoice_reviews','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s read" on public.%I for select to authenticated using (true)', t, t);
  end loop;
  foreach t in array array['vendors','vendor_bank_accounts','invoices','risk_findings',
                           'duplicate_candidates','invoice_reviews'] loop
    execute format('create policy "%s insert" on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy "%s update" on public.%I for update to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
-- (No DELETE policy anywhere: evidence is never deleted from the UI.)

-- ---------- dashboard views ------------------------------------------
create view public.dashboard_kpis with (security_invoker = true) as
select
  (select count(*) from public.invoices)                                              as invoices_received,
  (select count(*) from public.invoices where status not in ('received','extracting','failed')) as invoices_processed,
  (select count(*) from public.invoices where status in ('needs_review','in_review','info_requested')) as pending_review,
  (select count(*) from public.invoices
     where risk_band in ('priority','hold') and status not in ('approved','rejected','exported')) as high_risk_flags,
  (select count(*) from public.duplicate_candidates where review_status = 'pending')  as duplicate_candidates,
  (select round(avg(risk_score))::int from public.invoices
     where status in ('needs_review','in_review','info_requested'))                   as avg_open_risk,
  (select coalesce(jsonb_object_agg(currency, amount), '{}'::jsonb) from (
     select currency, sum(total) as amount from public.invoices
      where status in ('needs_review','in_review','info_requested') and coalesce(risk_score,0) >= 25
      group by currency) s)                                                           as amount_under_review;

create view public.risk_trend with (security_invoker = true) as
select date_trunc('week', created_at)::date            as week,
       count(*)                                         as invoices,
       round(avg(risk_score))::int                      as avg_score,
       count(*) filter (where risk_band in ('priority','hold')) as high_risk
  from public.invoices
 where created_at >= now() - interval '12 weeks'
 group by 1 order by 1;

-- ---------- private file bucket --------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760,
        array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "invoices bucket read" on storage.objects
  for select to authenticated using (bucket_id = 'invoices');
-- Uploads go through n8n (service_role), so no insert policy for users.
