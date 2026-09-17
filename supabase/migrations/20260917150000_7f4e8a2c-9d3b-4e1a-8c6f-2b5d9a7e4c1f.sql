-- Giro (postdated cheque / bilyet giro) module. Additive only: one new table,
-- two new intermediary GL accounts, two accounting_rules rows, and four
-- SECURITY DEFINER RPCs that post directly to journal_entries/journal_entry_lines/
-- general_ledger (same pattern as trg_auto_post_ar_invoice / run_monthly_depreciation)
-- so the maker-checker check inside post_journal_entry() is never involved.
-- Does NOT touch AR/AP tables, cash_bank_transactions, bank reconciliation,
-- any other posting trigger/RPC, or wms-sync.

-- ============================================================
-- LANGKAH 1: giro_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.giro_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_no text NOT NULL,
  giro_type text NOT NULL CHECK (giro_type IN ('IN', 'OUT')),
  party_type text NOT NULL CHECK (party_type IN ('CUSTOMER', 'VENDOR')),
  party_id uuid NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  giro_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  contra_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED')),
  journal_receive_id uuid REFERENCES public.journal_entries(id),
  journal_clear_id uuid REFERENCES public.journal_entries(id),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_giro_transactions_type_status ON public.giro_transactions(giro_type, status);
CREATE INDEX IF NOT EXISTS idx_giro_transactions_due_date ON public.giro_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_giro_transactions_party ON public.giro_transactions(party_type, party_id);

ALTER TABLE public.giro_transactions ENABLE ROW LEVEL SECURITY;

-- Writes only through the RPCs below (SECURITY DEFINER, bypass RLS), mirroring
-- depreciation_entries: read-only RLS surface, no client INSERT/UPDATE policy.
DROP POLICY IF EXISTS "Role-based giro_transactions read access" ON public.giro_transactions;
CREATE POLICY "Role-based giro_transactions read access" ON public.giro_transactions
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================================
-- Seed: intermediary GL accounts (ASSET for Giro Masuk / LIABILITY for
-- Giro Keluar) + accounting_rules defaults, so nothing is hardcoded in the
-- RPCs or the frontend -- both just read chart_of_accounts / accounting_rules.
-- ============================================================
INSERT INTO public.chart_of_accounts (code, name, account_type, normal_balance, is_control_account, is_active)
SELECT '1150', 'Giro Masuk', 'ASSET', 'DEBIT', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = '1150');

INSERT INTO public.chart_of_accounts (code, name, account_type, normal_balance, is_control_account, is_active)
SELECT '2150', 'Giro Keluar', 'LIABILITY', 'CREDIT', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = '2150');

INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id, is_active)
SELECT 'GIRO_IN',
  (SELECT id FROM public.chart_of_accounts WHERE code = '1150'),
  (SELECT id FROM public.chart_of_accounts WHERE code = '1200'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.accounting_rules WHERE source_type = 'GIRO_IN');

INSERT INTO public.accounting_rules (source_type, debit_account_id, credit_account_id, is_active)
SELECT 'GIRO_OUT',
  (SELECT id FROM public.chart_of_accounts WHERE code = '2100'),
  (SELECT id FROM public.chart_of_accounts WHERE code = '2150'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.accounting_rules WHERE source_type = 'GIRO_OUT');

-- ============================================================
-- LANGKAH 2: posting RPCs
-- ============================================================

-- (a) BUAT: insert PENDING row + post the receive/issue journal atomically.
CREATE OR REPLACE FUNCTION public.create_giro_transaction(
  _giro_type text,
  _party_type text,
  _party_id uuid,
  _giro_no text,
  _issue_date date,
  _due_date date,
  _amount numeric,
  _giro_account_id uuid,
  _contra_account_id uuid,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_period_id uuid;
  v_period_status fiscal_period_status;
  v_giro_id uuid;
  v_journal_id uuid;
  v_journal_no text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR
          has_role(v_user_id, 'ADMIN'::user_role) OR
          has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/ADMIN/SUPER_ADMIN can record giro transactions';
  END IF;

  IF _giro_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Invalid giro_type %', _giro_type;
  END IF;

  IF (_giro_type = 'IN' AND _party_type <> 'CUSTOMER') OR (_giro_type = 'OUT' AND _party_type <> 'VENDOR') THEN
    RAISE EXCEPTION 'party_type must be CUSTOMER for giro IN and VENDOR for giro OUT';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF _giro_account_id IS NULL OR _contra_account_id IS NULL THEN
    RAISE EXCEPTION 'Giro account and contra account are required';
  END IF;

  v_period_id := public.get_or_create_fiscal_period(_issue_date);
  SELECT status INTO v_period_status FROM public.fiscal_periods WHERE id = v_period_id;
  IF v_period_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Fiscal period covering % is not open for posting', _issue_date;
  END IF;

  INSERT INTO public.giro_transactions (
    giro_no, giro_type, party_type, party_id, issue_date, due_date, amount,
    giro_account_id, contra_account_id, status, notes, created_by
  )
  VALUES (
    _giro_no, _giro_type, _party_type, _party_id, _issue_date, _due_date, _amount,
    _giro_account_id, _contra_account_id, 'PENDING', _notes, v_user_id
  )
  RETURNING id INTO v_giro_id;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no, _issue_date,
    'Giro ' || _giro_type || ' ' || _giro_no || ' diterima/diterbitkan',
    'GIRO_' || _giro_type, v_giro_id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_journal_id;

  IF _giro_type = 'IN' THEN
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
    VALUES
      (v_journal_id, 1, _giro_account_id, _amount, 0, 'Giro masuk ' || _giro_no, _party_id),
      (v_journal_id, 2, _contra_account_id, 0, _amount, 'Giro masuk ' || _giro_no, _party_id);
  ELSE
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, vendor_id)
    VALUES
      (v_journal_id, 1, _contra_account_id, _amount, 0, 'Giro keluar ' || _giro_no, _party_id),
      (v_journal_id, 2, _giro_account_id, 0, _amount, 'Giro keluar ' || _giro_no, _party_id);
  END IF;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, _issue_date, debit, credit, 'GIRO_' || _giro_type, v_giro_id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  UPDATE public.giro_transactions
  SET journal_receive_id = v_journal_id, updated_at = now()
  WHERE id = v_giro_id;

  RETURN jsonb_build_object('giro_id', v_giro_id, 'journal_id', v_journal_id, 'journal_no', v_journal_no);
END;
$function$;

-- (b) CAIRKAN: PENDING -> CLEARED, post bank-side journal.
CREATE OR REPLACE FUNCTION public.clear_giro_transaction(
  _giro_id uuid,
  _bank_account_id uuid,
  _clear_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_giro record;
  v_bank_gl_account uuid;
  v_period_id uuid;
  v_period_status fiscal_period_status;
  v_journal_id uuid;
  v_journal_no text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR
          has_role(v_user_id, 'ADMIN'::user_role) OR
          has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/ADMIN/SUPER_ADMIN can clear giro transactions';
  END IF;

  SELECT * INTO v_giro FROM public.giro_transactions WHERE id = _giro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Giro transaction not found';
  END IF;
  IF v_giro.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only a PENDING giro can be cleared (current: %)', v_giro.status;
  END IF;

  SELECT gl_account_id INTO v_bank_gl_account FROM public.bank_accounts WHERE id = _bank_account_id;
  IF v_bank_gl_account IS NULL THEN
    RAISE EXCEPTION 'Selected bank account has no GL account mapped';
  END IF;

  v_period_id := public.get_or_create_fiscal_period(_clear_date);
  SELECT status INTO v_period_status FROM public.fiscal_periods WHERE id = v_period_id;
  IF v_period_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Fiscal period covering % is not open for posting', _clear_date;
  END IF;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no, _clear_date,
    'Giro ' || v_giro.giro_type || ' ' || v_giro.giro_no || ' cair',
    'GIRO_' || v_giro.giro_type || '_CLEAR', _giro_id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_journal_id;

  IF v_giro.giro_type = 'IN' THEN
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_bank_gl_account, v_giro.amount, 0, 'Giro masuk cair ' || v_giro.giro_no),
      (v_journal_id, 2, v_giro.giro_account_id, 0, v_giro.amount, 'Giro masuk cair ' || v_giro.giro_no);
  ELSE
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_giro.giro_account_id, v_giro.amount, 0, 'Giro keluar cair ' || v_giro.giro_no),
      (v_journal_id, 2, v_bank_gl_account, 0, v_giro.amount, 'Giro keluar cair ' || v_giro.giro_no);
  END IF;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, _clear_date, debit, credit, 'GIRO_' || v_giro.giro_type || '_CLEAR', _giro_id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  UPDATE public.giro_transactions
  SET status = 'CLEARED', bank_account_id = _bank_account_id, journal_clear_id = v_journal_id, updated_at = now()
  WHERE id = _giro_id;

  RETURN jsonb_build_object('journal_id', v_journal_id, 'journal_no', v_journal_no);
END;
$function$;

-- (c) TOLAK: PENDING -> BOUNCED, reverse the receive/issue journal.
CREATE OR REPLACE FUNCTION public.bounce_giro_transaction(
  _giro_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_giro record;
  v_journal_id uuid;
  v_journal_no text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/SUPER_ADMIN can bounce a giro';
  END IF;

  SELECT * INTO v_giro FROM public.giro_transactions WHERE id = _giro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Giro transaction not found';
  END IF;
  IF v_giro.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only a PENDING giro can be marked BOUNCED (current: %)', v_giro.status;
  END IF;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no, CURRENT_DATE,
    'Giro ' || v_giro.giro_type || ' ' || v_giro.giro_no || ' ditolak/bounced: ' || COALESCE(_reason, ''),
    'GIRO_' || v_giro.giro_type || '_BOUNCE', _giro_id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id, vendor_id)
  SELECT
    v_journal_id,
    line_no,
    account_id,
    credit AS debit,
    debit AS credit,
    COALESCE(description, '') || ' (bounced)',
    customer_id,
    vendor_id
  FROM public.journal_entry_lines
  WHERE journal_id = v_giro.journal_receive_id;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, CURRENT_DATE, debit, credit, 'GIRO_' || v_giro.giro_type || '_BOUNCE', _giro_id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_journal_id = v_journal_id, updated_at = now()
  WHERE id = v_giro.journal_receive_id;

  UPDATE public.giro_transactions
  SET status = 'BOUNCED',
      notes = COALESCE(v_giro.notes || ' | ', '') || 'Bounced: ' || COALESCE(_reason, ''),
      updated_at = now()
  WHERE id = _giro_id;

  RETURN jsonb_build_object('journal_id', v_journal_id, 'journal_no', v_journal_no);
END;
$function$;

-- (d) BATAL: PENDING -> CANCELLED, reverse the receive/issue journal.
CREATE OR REPLACE FUNCTION public.cancel_giro_transaction(
  _giro_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_giro record;
  v_journal_id uuid;
  v_journal_no text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR
          has_role(v_user_id, 'ADMIN'::user_role) OR
          has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/ADMIN/SUPER_ADMIN can cancel a giro';
  END IF;

  SELECT * INTO v_giro FROM public.giro_transactions WHERE id = _giro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Giro transaction not found';
  END IF;
  IF v_giro.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only a PENDING giro can be cancelled (current: %)', v_giro.status;
  END IF;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no, CURRENT_DATE,
    'Giro ' || v_giro.giro_type || ' ' || v_giro.giro_no || ' dibatalkan: ' || COALESCE(_reason, ''),
    'GIRO_' || v_giro.giro_type || '_CANCEL', _giro_id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id, vendor_id)
  SELECT
    v_journal_id,
    line_no,
    account_id,
    credit AS debit,
    debit AS credit,
    COALESCE(description, '') || ' (cancelled)',
    customer_id,
    vendor_id
  FROM public.journal_entry_lines
  WHERE journal_id = v_giro.journal_receive_id;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, CURRENT_DATE, debit, credit, 'GIRO_' || v_giro.giro_type || '_CANCEL', _giro_id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_journal_id = v_journal_id, updated_at = now()
  WHERE id = v_giro.journal_receive_id;

  UPDATE public.giro_transactions
  SET status = 'CANCELLED',
      notes = COALESCE(v_giro.notes || ' | ', '') || 'Cancelled: ' || COALESCE(_reason, ''),
      updated_at = now()
  WHERE id = _giro_id;

  RETURN jsonb_build_object('journal_id', v_journal_id, 'journal_no', v_journal_no);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_giro_transaction(text, text, uuid, text, date, date, numeric, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_giro_transaction(text, text, uuid, text, date, date, numeric, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.clear_giro_transaction(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_giro_transaction(uuid, uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.bounce_giro_transaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bounce_giro_transaction(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_giro_transaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_giro_transaction(uuid, text) TO authenticated;
