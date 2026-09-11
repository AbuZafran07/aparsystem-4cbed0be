-- Finance ERP Phase 1: seed data
-- Minimal placeholder Chart of Accounts + baseline accounting rules + the
-- current fiscal period, so the posting engine has something to attach to.
-- Account codes/names are PLACEHOLDERS per the Accounting Rule Matrix v1.1
-- ("Account name bersifat placeholder sampai COA final") - Finance/Accounting
-- must review before relying on these for statutory reporting.

INSERT INTO public.chart_of_accounts (code, name, account_type, normal_balance, is_control_account) VALUES
  ('1100', 'Bank - Default', 'ASSET', 'DEBIT', false),
  ('1200', 'Accounts Receivable', 'ASSET', 'DEBIT', true),
  ('2100', 'Accounts Payable', 'LIABILITY', 'CREDIT', true),
  ('3900', 'Opening Balance Equity', 'EQUITY', 'CREDIT', false),
  ('4100', 'Sales Revenue', 'REVENUE', 'CREDIT', false),
  ('5100', 'Purchase Expense', 'EXPENSE', 'DEBIT', false)
ON CONFLICT (code) DO NOTHING;

-- AR-01: Sales Invoice -> Dr Accounts Receivable / Cr Sales Revenue
INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id)
SELECT 'AR_INVOICE', ar.id, rev.id
FROM public.chart_of_accounts ar, public.chart_of_accounts rev
WHERE ar.code = '1200' AND rev.code = '4100'
ON CONFLICT (source_type) DO NOTHING;

-- AR-02: Customer Receipt -> Dr Bank / Cr Accounts Receivable
INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id)
SELECT 'AR_RECEIPT', bank.id, ar.id
FROM public.chart_of_accounts bank, public.chart_of_accounts ar
WHERE bank.code = '1100' AND ar.code = '1200'
ON CONFLICT (source_type) DO NOTHING;

-- AP-02: Purchase Invoice (Expense) -> Dr Purchase Expense / Cr Accounts Payable
INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id)
SELECT 'AP_INVOICE', exp.id, ap.id
FROM public.chart_of_accounts exp, public.chart_of_accounts ap
WHERE exp.code = '5100' AND ap.code = '2100'
ON CONFLICT (source_type) DO NOTHING;

-- AP-03: Supplier Payment -> Dr Accounts Payable / Cr Bank
INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id)
SELECT 'AP_PAYMENT', ap.id, bank.id
FROM public.chart_of_accounts ap, public.chart_of_accounts bank
WHERE ap.code = '2100' AND bank.code = '1100'
ON CONFLICT (source_type) DO NOTHING;

-- Current fiscal period so journal posting has an OPEN period to attach to
-- immediately after this migration runs.
INSERT INTO public.fiscal_periods (fiscal_year, period_no, start_date, end_date, status)
VALUES (2026, 9, '2026-09-01', '2026-09-30', 'OPEN')
ON CONFLICT (fiscal_year, period_no) DO NOTHING;
