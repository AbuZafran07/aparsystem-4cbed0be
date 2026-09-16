-- Kas & Bank (core cash/bank module) with auto-posting to the General Ledger.
-- Additive only: new table, new RPC, new auto-post trigger. Does NOT touch
-- cash_out_transactions/AuditCashoutPage (separate audit module), AR/AP
-- tables/triggers, wms-sync, or the existing create_journal_entry/
-- post_journal_entry RPCs.

CREATE TABLE IF NOT EXISTS public.cash_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_no text NOT NULL UNIQUE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('CASH_IN', 'CASH_OUT', 'TRANSFER')),
  transaction_date date NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id),
  counter_bank_account_id uuid REFERENCES public.bank_accounts(id),
  contra_account_id uuid REFERENCES public.chart_of_accounts(id),
  amount numeric NOT NULL DEFAULT 0,
  description text,
  reference_no text,
  status record_status NOT NULL DEFAULT 'DRAFT',
  journal_id uuid REFERENCES public.journal_entries(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cash_bank_transfer_counter CHECK (transaction_type <> 'TRANSFER' OR counter_bank_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cash_bank_transactions_type ON public.cash_bank_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_cash_bank_transactions_status ON public.cash_bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_cash_bank_transactions_date ON public.cash_bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_cash_bank_transactions_bank_account ON public.cash_bank_transactions(bank_account_id);

ALTER TABLE public.cash_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based cash_bank_transactions read access" ON public.cash_bank_transactions;
CREATE POLICY "Role-based cash_bank_transactions read access" ON public.cash_bank_transactions
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based cash_bank_transactions insert access" ON public.cash_bank_transactions;
CREATE POLICY "Role-based cash_bank_transactions insert access" ON public.cash_bank_transactions
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based cash_bank_transactions update access" ON public.cash_bank_transactions;
CREATE POLICY "Role-based cash_bank_transactions update access" ON public.cash_bank_transactions
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP TRIGGER IF EXISTS update_cash_bank_transactions_updated_at ON public.cash_bank_transactions;
CREATE TRIGGER update_cash_bank_transactions_updated_at
BEFORE UPDATE ON public.cash_bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Transaction number generator, mirrors generate_journal_no()'s scheme/shape
-- (KB-YYYYMM-####) and role check.
CREATE OR REPLACE FUNCTION public.generate_cash_bank_no()
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
    RAISE EXCEPTION 'Unauthorized: Only FINANCE/ADMIN/SUPER_ADMIN can generate cash/bank transaction numbers';
  END IF;

  current_prefix := 'KB-' || to_char(CURRENT_DATE, 'YYYYMM') || '-';

  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(transaction_no, '^KB-\d{6}-', ''), '')::INTEGER),
    0
  )
  INTO last_number
  FROM public.cash_bank_transactions
  WHERE transaction_no LIKE current_prefix || '%';

  new_number := current_prefix || LPAD((last_number + 1)::TEXT, 4, '0');
  RETURN new_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_cash_bank_no() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_cash_bank_no() TO authenticated;

-- Auto-posting trigger. Follows the same pattern as trg_auto_post_ar_invoice:
-- idempotency check on (source_type, source_id), then a direct insert into
-- journal_entries/journal_entry_lines/general_ledger under SECURITY DEFINER
-- (same journal numbering scheme as generate_journal_no()) rather than
-- calling the create_journal_entry/post_journal_entry RPCs. This matters
-- here specifically because post_journal_entry() enforces maker-checker
-- (creator cannot also post) — since this trigger fires from the same
-- transaction as the user's own APPROVE action, calling that RPC would
-- deadlock non-SUPER_ADMIN FINANCE/ADMIN users approving their own entry.
-- Auto-posting a business event is not a manual journal entry, so the
-- maker-checker rule (meant for hand-written journals) does not apply here,
-- exactly as it already does not apply to the existing AR/AP auto-post
-- triggers.
CREATE OR REPLACE FUNCTION public.trg_auto_post_cash_bank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bank_gl uuid;
  v_counter_gl uuid;
  v_debit_account uuid;
  v_credit_account uuid;
  v_period_id uuid;
  v_period_status fiscal_period_status;
  v_journal_id uuid;
  v_journal_no text;
  v_prefix text;
  v_last_number integer;
  v_user_id uuid := COALESCE(auth.uid(), NEW.created_by);
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'CASH_BANK' AND source_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
      RAISE NOTICE 'cash_bank_transactions %: amount is zero/blank, skipping auto-post', NEW.id;
      RETURN NEW;
    END IF;

    SELECT gl_account_id INTO v_bank_gl FROM public.bank_accounts WHERE id = NEW.bank_account_id;

    IF NEW.transaction_type = 'TRANSFER' THEN
      SELECT gl_account_id INTO v_counter_gl FROM public.bank_accounts WHERE id = NEW.counter_bank_account_id;
      IF v_bank_gl IS NULL OR v_counter_gl IS NULL THEN
        RAISE NOTICE 'cash_bank_transactions %: source/destination bank has no GL account mapped, skipping auto-post (can be posted later once mapped)', NEW.id;
        RETURN NEW;
      END IF;
      v_debit_account := v_counter_gl;
      v_credit_account := v_bank_gl;
    ELSIF NEW.transaction_type = 'CASH_IN' THEN
      IF v_bank_gl IS NULL OR NEW.contra_account_id IS NULL THEN
        RAISE NOTICE 'cash_bank_transactions %: bank GL account or contra account not set, skipping auto-post (can be posted later once completed)', NEW.id;
        RETURN NEW;
      END IF;
      v_debit_account := v_bank_gl;
      v_credit_account := NEW.contra_account_id;
    ELSIF NEW.transaction_type = 'CASH_OUT' THEN
      IF v_bank_gl IS NULL OR NEW.contra_account_id IS NULL THEN
        RAISE NOTICE 'cash_bank_transactions %: bank GL account or contra account not set, skipping auto-post (can be posted later once completed)', NEW.id;
        RETURN NEW;
      END IF;
      v_debit_account := NEW.contra_account_id;
      v_credit_account := v_bank_gl;
    ELSE
      RETURN NEW;
    END IF;

    v_period_id := public.get_or_create_fiscal_period(NEW.transaction_date);
    SELECT status INTO v_period_status FROM public.fiscal_periods WHERE id = v_period_id;
    IF v_period_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Fiscal period covering % is not open for posting', NEW.transaction_date;
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
      COALESCE('Auto-posted: ' || NEW.description, 'Auto-posted: ' || NEW.transaction_type || ' ' || NEW.transaction_no),
      'CASH_BANK',
      NEW.id,
      'DRAFT',
      v_user_id
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_account, NEW.amount, 0, NEW.transaction_no),
      (v_journal_id, 2, v_credit_account, 0, NEW.amount, NEW.transaction_no);

    INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
    SELECT id, account_id, NEW.transaction_date, debit, credit, 'CASH_BANK', NEW.id
    FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

    UPDATE public.journal_entries
    SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
    WHERE id = v_journal_id;

    UPDATE public.cash_bank_transactions SET journal_id = v_journal_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cash_bank_auto_post ON public.cash_bank_transactions;
CREATE TRIGGER trg_cash_bank_auto_post
AFTER UPDATE ON public.cash_bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_post_cash_bank();
