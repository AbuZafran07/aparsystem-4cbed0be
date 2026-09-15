-- Phase 4: WMS stock integration -> Inventory & COGS journal posting.
-- Additive only: new table, new COA/accounting_rules seed rows, and a new
-- auto-post trigger. Does NOT alter ar_invoices/ap_invoices, their existing
-- auto-post triggers, or any other existing accounting logic.

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wms_id text NOT NULL UNIQUE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('STOCK_IN', 'STOCK_OUT', 'STOCK_ADJUSTMENT')),
  transaction_date date NOT NULL,
  product_ref text,
  warehouse_ref text,
  quantity numeric,
  total_cost numeric NOT NULL DEFAULT 0,
  source_reference text,
  journal_id uuid REFERENCES public.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_wms_id ON public.inventory_transactions(wms_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON public.inventory_transactions(transaction_type);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based inventory_transactions read access" ON public.inventory_transactions;
CREATE POLICY "Role-based inventory_transactions read access" ON public.inventory_transactions
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );
-- Intentionally no INSERT/UPDATE policy: rows are written only by the
-- wms-sync edge function via the service-role key, which bypasses RLS.

-- Seed the Chart of Accounts entries needed for the recommended stock rule
-- mappings below. New codes only (1300/2200/5200/5300); Phase 1's seed
-- (1100/1200/2100/3900/4100/5100) is untouched. Admin can repoint these on
-- the existing Accounting Rules page at any time.
INSERT INTO public.chart_of_accounts (code, name, account_type, normal_balance, is_control_account, is_active)
VALUES
  ('1300', 'Persediaan', 'ASSET', 'DEBIT', false, true),
  ('2200', 'GRNI (Goods Received Not Invoiced)', 'LIABILITY', 'CREDIT', false, true),
  ('5200', 'Harga Pokok Penjualan (COGS)', 'EXPENSE', 'DEBIT', false, true),
  ('5300', 'Penyesuaian Persediaan', 'EXPENSE', 'DEBIT', false, true)
ON CONFLICT (code) DO NOTHING;

-- Seed the 3 new stock accounting rules so they immediately appear,
-- editable, on the existing Accounting Rules page (STOCK_IN/STOCK_OUT/
-- STOCK_ADJUSTMENT source_types, same accounting_rules table Phase 1
-- already ships and that page already reads generically).
INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id, is_active)
SELECT 'STOCK_IN', d.id, c.id, true
FROM public.chart_of_accounts d, public.chart_of_accounts c
WHERE d.code = '1300' AND c.code = '2200'
ON CONFLICT (source_type) DO NOTHING;

INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id, is_active)
SELECT 'STOCK_OUT', d.id, c.id, true
FROM public.chart_of_accounts d, public.chart_of_accounts c
WHERE d.code = '5200' AND c.code = '1300'
ON CONFLICT (source_type) DO NOTHING;

INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id, is_active)
SELECT 'STOCK_ADJUSTMENT', d.id, c.id, true
FROM public.chart_of_accounts d, public.chart_of_accounts c
WHERE d.code = '1300' AND c.code = '5300'
ON CONFLICT (source_type) DO NOTHING;

-- Auto-posting trigger. Mirrors the existing trg_auto_post_ar_invoice
-- pattern: idempotency check on (source_type, source_id), pull the debit/
-- credit accounts from accounting_rules, then insert directly into
-- journal_entries/journal_entry_lines/general_ledger under SECURITY
-- DEFINER (same journal numbering scheme as generate_journal_no()) rather
-- than calling the create_journal_entry/post_journal_entry RPCs: those
-- RPCs require has_role(auth.uid(), ...), but inventory_transactions rows
-- are inserted by wms-sync via the service-role key, where auth.uid() is
-- NULL, so the RPCs' auth check would always reject them.
CREATE OR REPLACE FUNCTION public.trg_auto_post_inventory_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_amount numeric;
  v_debit_account uuid;
  v_credit_account uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_prefix text;
  v_last_number integer;
  v_user_id uuid := COALESCE(auth.uid(), '5c2d93f2-d564-46ba-9a2c-66e028788147'::uuid);
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = NEW.transaction_type AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rule FROM public.accounting_rules WHERE source_type = NEW.transaction_type AND is_active;
  IF NOT FOUND OR v_rule.debit_account_id IS NULL OR v_rule.credit_account_id IS NULL THEN
    RAISE NOTICE 'inventory_transactions %: no active accounting_rules for %, skipping auto-post (can be posted later once the rule is filled in)', NEW.id, NEW.transaction_type;
    RETURN NEW;
  END IF;

  v_amount := ABS(COALESCE(NEW.total_cost, 0));
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_debit_account := v_rule.debit_account_id;
  v_credit_account := v_rule.credit_account_id;

  IF NEW.transaction_type = 'STOCK_ADJUSTMENT' AND NEW.total_cost < 0 THEN
    v_debit_account := v_rule.credit_account_id;
    v_credit_account := v_rule.debit_account_id;
  END IF;

  v_prefix := 'JE-' || to_char(CURRENT_DATE, 'YYYYMM') || '-';
  SELECT COALESCE(MAX(NULLIF(regexp_replace(journal_no, '^JE-\d{6}-', ''), '')::integer), 0)
  INTO v_last_number
  FROM public.journal_entries
  WHERE journal_no LIKE v_prefix || '%';
  v_journal_no := v_prefix || LPAD((v_last_number + 1)::text, 4, '0');

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no,
    NEW.transaction_date,
    'Auto-posted: ' || NEW.transaction_type ||
      COALESCE(' - ' || NEW.product_ref, '') ||
      COALESCE(' (' || NEW.source_reference || ')', ''),
    NEW.transaction_type,
    NEW.id,
    'DRAFT',
    v_user_id
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
  VALUES
    (v_journal_id, 1, v_debit_account, v_amount, 0, 'WMS ' || NEW.transaction_type || ' ' || NEW.wms_id),
    (v_journal_id, 2, v_credit_account, 0, v_amount, 'WMS ' || NEW.transaction_type || ' ' || NEW.wms_id);

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, NEW.transaction_date, debit, credit, NEW.transaction_type, NEW.id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  UPDATE public.inventory_transactions SET journal_id = v_journal_id WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_inventory_transaction_auto_post ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transaction_auto_post
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_post_inventory_transaction();
