\set ON_ERROR_STOP 0
insert into vendors(legal_name,tax_id) values ('ACME Traders (Pvt.) Ltd','NTN-1') returning normalized_name;
insert into invoices(vendor_id,invoice_number,total,file_key,file_sha256,source) select id,'inv-001 / 42',118000,'a.pdf','h1','upload' from vendors returning normalized_invoice_number;
-- 1 same file twice -> should FAIL
insert into invoices(vendor_id,invoice_number,file_key,file_sha256,source) select id,'X','b.pdf','h1','upload' from vendors;
-- 2 same number different file -> should SUCCEED (flag later)
insert into invoices(vendor_id,invoice_number,file_key,file_sha256,source) select id,'INV00142','c.pdf','h2','email' from vendors;
-- 3 approve without review -> FAIL
update invoices set status='approved' where file_sha256='h1';
-- 4 export from needs_review -> FAIL
update invoices set status='exported' where file_sha256='h1';
-- 5 system verify bank account -> FAIL
insert into vendor_bank_accounts(vendor_id,account_fingerprint,status) select id,'fp1','verified' from vendors;
insert into vendor_bank_accounts(vendor_id,account_fingerprint) select id,'fp1' from vendors;
-- 6 human verify -> OK
set request.jwt.sub='11111111-1111-1111-1111-111111111111';
update vendor_bank_accounts set status='verified' returning verified_by;
-- 7 human approve after review -> OK
insert into invoice_reviews(invoice_id,decision) select id,'approve' from invoices where file_sha256='h1';
update invoices set status='approved' where file_sha256='h1' returning status;
update invoices set status='exported' where file_sha256='h1' returning status;
-- 8 audit append-only -> FAIL
delete from audit_events;
select action, actor_type from audit_events order by created_at;
select * from dashboard_kpis; select * from risk_trend;
