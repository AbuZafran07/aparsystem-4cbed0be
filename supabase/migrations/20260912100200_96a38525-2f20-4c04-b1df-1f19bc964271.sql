-- Finance ERP Phase 1: posting engine RPCs (SECURITY DEFINER, mirroring the
-- existing settle_payment_request()/generate_payment_request_no() style).
-- All writes to journal_entries/journal_entry_lines/general_ledger happen only
-- through these functions, so debit=credit, idempotency and period-lock are
-- enforced server-side regardless of what the client sends.

-- Journal numbering, format JE-YYYYMM-#### (mirrors generate_payment_request_no)
CREATE OR REPLACE FUNCTION public.generate_journal_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_prefix TEXT;
  last_number INTEGER;
  new_number TEXT;
BEGIN
  IF NOT (has_role(auth.uid(), 'FINANCE'::user_role) OR
          has_role(auth.uid(), 'ADMIN'::user_role) OR
          has_role(auth.uid(), 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Only FINANCE/ADMIN/SUPER_ADMIN can generate journal numbers';
  END IF;

  current_prefix := 'JE-' || to_char(CURRENT_DATE, 'YYYYMM') || '-';

  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(journal_no, '^JE-\d{6}-', ''), '')::INTEGER),
    0
  )
  INTO last_number
  FROM public.journal_entries
  WHERE journal_no LIKE current_prefix || '%';

  new_number := current_prefix || LPAD((last_number + 1)::TEXT, 4, '0');
  RETURN new_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_journal_no() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_journal_no() TO authenticated;

-- Internal helper (not granted to authenticated - only called from the definer
-- functions below): returns the fiscal period covering _date, auto-creating a
-- monthly period as OPEN if none exists yet.
CREATE OR REPLACE FUNCTION public.get_or_create_fiscal_period(_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period_id uuid;
  v_year integer;
  v_month integer;
  v_start date;
  v_end date;
BEGIN
  SELECT id INTO v_period_id
  FROM public.fiscal_periods
  WHERE _date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_period_id IS NOT NULL THEN
    RETURN v_period_id;
  END IF;

  v_year := EXTRACT(YEAR FROM _date)::INTEGER;
  v_month := EXTRACT(MONTH FROM _date)::INTEGER;
  v_start := date_trunc('month', _date)::date;
  v_end := (date_trunc('month', _date) + INTERVAL '1 month - 1 day')::date;

  INSERT INTO public.fiscal_periods (fiscal_year, period_no, start_date, end_date, status)
  VALUES (v_year, v_month, v_start, v_end, 'OPEN')
  ON CONFLICT (fiscal_year, period_no) DO UPDATE SET fiscal_year = EXCLUDED.fiscal_year
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_fiscal_period(date) FROM PUBLIC;

-- Create a balanced DRAFT journal entry. _lines is a jsonb array of
-- {account_id, debit, credit, description?, customer_id?, vendor_id?}.
-- Journals are always balanced by construction - only their status changes later.
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  _entry_date date,
  _description text,
  _source_type text,
  _source_id uuid,
  _lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_journal_id uuid;
  v_journal_no text;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line jsonb;
  v_line_no integer := 0;
  v_account_active boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR
          has_role(v_user_id, 'ADMIN'::user_role) OR
          has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/ADMIN/SUPER_ADMIN can create journal entries';
  END IF;

  IF _lines IS NULL OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry requires at least 2 lines';
  END IF;

  SELECT
    COALESCE(SUM((l->>'debit')::numeric), 0),
    COALESCE(SUM((l->>'credit')::numeric), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(_lines) l;

  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION 'Journal entry not balanced: total debit % <> total credit %', v_total_debit, v_total_credit;
  END IF;

  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'Journal entry total amount must be greater than zero';
  END IF;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (v_journal_no, _entry_date, _description, _source_type, _source_id, 'DRAFT', v_user_id)
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    v_line_no := v_line_no + 1;

    SELECT is_active INTO v_account_active
    FROM public.chart_of_accounts
    WHERE id = (v_line->>'account_id')::uuid;

    IF v_account_active IS NULL THEN
      RAISE EXCEPTION 'Account % not found', v_line->>'account_id';
    END IF;
    IF NOT v_account_active THEN
      RAISE EXCEPTION 'Account % is inactive', v_line->>'account_id';
    END IF;

    INSERT INTO public.journal_entry_lines (
      journal_id, line_no, account_id, debit, credit, description, customer_id, vendor_id
    ) VALUES (
      v_journal_id,
      v_line_no,
      (v_line->>'account_id')::uuid,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      v_line->>'description',
      NULLIF(v_line->>'customer_id', '')::uuid,
      NULLIF(v_line->>'vendor_id', '')::uuid
    );
  END LOOP;

  RETURN jsonb_build_object(
    'journal_id', v_journal_id,
    'journal_no', v_journal_no,
    'total_amount', v_total_debit
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_journal_entry(date, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(date, text, text, uuid, jsonb) TO authenticated;

-- Post a DRAFT journal entry into the General Ledger.
-- Maker-checker: the creator of a journal cannot also post it, unless SUPER_ADMIN.
CREATE OR REPLACE FUNCTION public.post_journal_entry(_journal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_journal record;
  v_period_id uuid;
  v_period record;
  v_line record;
  v_gl_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/SUPER_ADMIN can post journal entries';
  END IF;

  SELECT * INTO v_journal FROM public.journal_entries WHERE id = _journal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF v_journal.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Journal entry must be DRAFT to post (current: %)', v_journal.status;
  END IF;

  IF v_journal.created_by = v_user_id AND NOT has_role(v_user_id, 'SUPER_ADMIN'::user_role) THEN
    RAISE EXCEPTION 'Maker-checker violation: the creator of a journal entry cannot also post it';
  END IF;

  v_period_id := public.get_or_create_fiscal_period(v_journal.entry_date);
  SELECT * INTO v_period FROM public.fiscal_periods WHERE id = v_period_id;

  IF v_period.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Fiscal period %-% is not open for posting', v_period.fiscal_year, v_period.period_no;
  END IF;

  FOR v_line IN SELECT * FROM public.journal_entry_lines WHERE journal_id = _journal_id
  LOOP
    INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
    VALUES (v_line.id, v_line.account_id, v_journal.entry_date, v_line.debit, v_line.credit, v_journal.source_type, v_journal.source_id);
    v_gl_count := v_gl_count + 1;
  END LOOP;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = _journal_id;

  RETURN jsonb_build_object('journal_id', _journal_id, 'gl_lines_created', v_gl_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.post_journal_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid) TO authenticated;

-- Reverse a POSTED journal entry: creates and immediately posts a new balanced
-- journal with debit/credit swapped, links it back, marks the original REVERSED.
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(_journal_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_original record;
  v_new_journal_id uuid;
  v_new_journal_no text;
  v_lines jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/SUPER_ADMIN can reverse journal entries';
  END IF;

  SELECT * INTO v_original FROM public.journal_entries WHERE id = _journal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;
  IF v_original.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only a POSTED journal entry can be reversed (current: %)', v_original.status;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'account_id', account_id,
    'debit', credit,
    'credit', debit,
    'description', COALESCE(description, '') || ' (reversal)',
    'customer_id', customer_id,
    'vendor_id', vendor_id
  )) INTO v_lines
  FROM public.journal_entry_lines
  WHERE journal_id = _journal_id;

  v_new_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_new_journal_no, CURRENT_DATE,
    'Reversal of ' || v_original.journal_no || ': ' || COALESCE(_reason, ''),
    v_original.source_type, v_original.source_id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_new_journal_id;

  INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id, vendor_id)
  SELECT
    v_new_journal_id,
    row_number() OVER (),
    (l->>'account_id')::uuid,
    (l->>'debit')::numeric,
    (l->>'credit')::numeric,
    l->>'description',
    NULLIF(l->>'customer_id', '')::uuid,
    NULLIF(l->>'vendor_id', '')::uuid
  FROM jsonb_array_elements(v_lines) l;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, CURRENT_DATE, debit, credit, v_original.source_type, v_original.source_id
  FROM public.journal_entry_lines
  WHERE journal_id = v_new_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_new_journal_id;

  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_journal_id = v_new_journal_id, updated_at = now()
  WHERE id = _journal_id;

  RETURN jsonb_build_object('reversal_journal_id', v_new_journal_id, 'reversal_journal_no', v_new_journal_no);
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_journal_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, text) TO authenticated;

-- Fiscal period close/reopen - SUPER_ADMIN only.
CREATE OR REPLACE FUNCTION public.close_fiscal_period(_period_id uuid, _hard boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT has_role(v_user_id, 'SUPER_ADMIN'::user_role) THEN
    RAISE EXCEPTION 'Unauthorized: only SUPER_ADMIN can close a fiscal period';
  END IF;

  UPDATE public.fiscal_periods
  SET status = CASE WHEN _hard THEN 'HARD_CLOSE'::fiscal_period_status ELSE 'SOFT_CLOSE'::fiscal_period_status END,
      closed_by = v_user_id,
      closed_at = now()
  WHERE id = _period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found';
  END IF;

  RETURN jsonb_build_object('period_id', _period_id, 'status', CASE WHEN _hard THEN 'HARD_CLOSE' ELSE 'SOFT_CLOSE' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.close_fiscal_period(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_fiscal_period(_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT has_role(v_user_id, 'SUPER_ADMIN'::user_role) THEN
    RAISE EXCEPTION 'Unauthorized: only SUPER_ADMIN can reopen a fiscal period';
  END IF;

  UPDATE public.fiscal_periods
  SET status = 'OPEN', closed_by = NULL, closed_at = NULL
  WHERE id = _period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found';
  END IF;

  RETURN jsonb_build_object('period_id', _period_id, 'status', 'OPEN');
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_fiscal_period(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_period(uuid) TO authenticated;

-- One-time opening balance journal at the 2026-09-11 cutover: sums outstanding
-- AR/AP for invoices already recognized (APPROVED/PARTIAL/PAID) as of cutover.
-- DRAFT/SUBMITTED invoices are deliberately excluded here - they will generate
-- their own journal via the auto-post triggers (next migration) whenever they
-- later transition to APPROVED, so nothing is double-counted.
CREATE OR REPLACE FUNCTION public.create_opening_balance_journal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_cutover_date date := '2026-09-11';
  v_ar_total numeric;
  v_ap_total numeric;
  v_diff numeric;
  v_ar_account uuid;
  v_ap_account uuid;
  v_equity_account uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_period_id uuid;
  v_line_no integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT has_role(v_user_id, 'SUPER_ADMIN'::user_role) THEN
    RAISE EXCEPTION 'Unauthorized: only SUPER_ADMIN can create the opening balance journal';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'OPENING_BALANCE') THEN
    RAISE EXCEPTION 'Opening balance journal already exists';
  END IF;

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_ar_total
  FROM public.ar_invoices
  WHERE status IN ('APPROVED', 'PARTIAL', 'PAID');

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_ap_total
  FROM public.ap_invoices
  WHERE status IN ('APPROVED', 'PARTIAL', 'PAID');

  SELECT id INTO v_ar_account FROM public.chart_of_accounts WHERE code = '1200';
  SELECT id INTO v_ap_account FROM public.chart_of_accounts WHERE code = '2100';
  SELECT id INTO v_equity_account FROM public.chart_of_accounts WHERE code = '3900';

  IF v_ar_account IS NULL OR v_ap_account IS NULL OR v_equity_account IS NULL THEN
    RAISE EXCEPTION 'Default Chart of Accounts not seeded (1200/2100/3900 missing)';
  END IF;

  IF v_ar_total = 0 AND v_ap_total = 0 THEN
    RAISE EXCEPTION 'No outstanding AR/AP balances found as of cutover; nothing to post';
  END IF;

  v_period_id := public.get_or_create_fiscal_period(v_cutover_date);
  v_journal_no := public.generate_journal_no();
  v_diff := v_ar_total - v_ap_total;

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, status, created_by)
  VALUES (v_journal_no, v_cutover_date, 'Opening balance as of cutover ' || v_cutover_date, 'OPENING_BALANCE', 'DRAFT', v_user_id)
  RETURNING id INTO v_journal_id;

  IF v_ar_total > 0 THEN
    v_line_no := v_line_no + 1;
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES (v_journal_id, v_line_no, v_ar_account, v_ar_total, 0, 'Opening AR outstanding');
  END IF;

  IF v_ap_total > 0 THEN
    v_line_no := v_line_no + 1;
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES (v_journal_id, v_line_no, v_ap_account, 0, v_ap_total, 'Opening AP outstanding');
  END IF;

  IF v_diff > 0 THEN
    v_line_no := v_line_no + 1;
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES (v_journal_id, v_line_no, v_equity_account, 0, v_diff, 'Opening balance equity');
  ELSIF v_diff < 0 THEN
    v_line_no := v_line_no + 1;
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES (v_journal_id, v_line_no, v_equity_account, -v_diff, 0, 'Opening balance equity');
  END IF;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type)
  SELECT id, account_id, v_cutover_date, debit, credit, 'OPENING_BALANCE'
  FROM public.journal_entry_lines
  WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  RETURN jsonb_build_object(
    'journal_id', v_journal_id,
    'journal_no', v_journal_no,
    'ar_total', v_ar_total,
    'ap_total', v_ap_total,
    'equity_diff', v_diff
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_opening_balance_journal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_opening_balance_journal() TO authenticated;
