-- Tax engine (PPN) with automatic tax-split posting. Additive and
-- backward-compatible: new tax_codes table, new NULLABLE columns on
-- ar_invoices/ap_invoices (existing invoices with no tax code behave
-- exactly as before), and the existing AR/AP auto-post triggers are only
-- extended to add a 3rd journal line when tax is present -- the no-tax path
-- is byte-for-byte the same 2-line posting as before.

-- ============================================================
-- LANGKAH 1: tax_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tax_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  tax_type text NOT NULL CHECK (tax_type IN ('OUTPUT', 'INPUT')),
  rate numeric NOT NULL,
  gl_account_id uuid REFERENCES public.chart_of_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based tax_codes read access" ON public.tax_codes;
CREATE POLICY "Role-based tax_codes read access" ON public.tax_codes
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based tax_codes insert access" ON public.tax_codes;
CREATE POLICY "Role-based tax_codes insert access" ON public.tax_codes
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based tax_codes update access" ON public.tax_codes;
CREATE POLICY "Role-based tax_codes update access" ON public.tax_codes
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based tax_codes delete access" ON public.tax_codes;
CREATE POLICY "Role-based tax_codes delete access" ON public.tax_codes
  FOR DELETE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

INSERT INTO public.tax_codes (code, name, tax_type, rate)
VALUES
  ('PPN-OUT', 'PPN Keluaran 11%', 'OUTPUT', 11),
  ('PPN-IN', 'PPN Masukan 11%', 'INPUT', 11)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- LANGKAH 2: nullable tax columns on ar_invoices / ap_invoices
-- ============================================================
ALTER TABLE public.ar_invoices
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id),
  ADD COLUMN IF NOT EXISTS dpp_amount numeric,
  ADD COLUMN IF NOT EXISTS tax_amount numeric;

ALTER TABLE public.ap_invoices
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id),
  ADD COLUMN IF NOT EXISTS dpp_amount numeric,
  ADD COLUMN IF NOT EXISTS tax_amount numeric;

-- ============================================================
-- LANGKAH 3: BEFORE INSERT/UPDATE — compute DPP/PPN (inclusive) from
-- invoice_amount whenever a tax_code_id is set; NULL both out when it
-- isn't. invoice_amount itself is never touched.
-- ============================================================
CREATE OR REPLACE FUNCTION public.calc_invoice_tax()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric;
BEGIN
  IF NEW.tax_code_id IS NOT NULL THEN
    SELECT rate INTO v_rate FROM public.tax_codes WHERE id = NEW.tax_code_id;
    IF v_rate IS NULL THEN
      NEW.tax_amount := NULL;
      NEW.dpp_amount := NULL;
    ELSE
      NEW.tax_amount := ROUND(NEW.invoice_amount * v_rate / (100 + v_rate), 2);
      NEW.dpp_amount := NEW.invoice_amount - NEW.tax_amount;
    END IF;
  ELSE
    NEW.tax_amount := NULL;
    NEW.dpp_amount := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_calc_ar_invoice_tax ON public.ar_invoices;
CREATE TRIGGER trg_calc_ar_invoice_tax
BEFORE INSERT OR UPDATE ON public.ar_invoices
FOR EACH ROW EXECUTE FUNCTION public.calc_invoice_tax();

DROP TRIGGER IF EXISTS trg_calc_ap_invoice_tax ON public.ap_invoices;
CREATE TRIGGER trg_calc_ap_invoice_tax
BEFORE INSERT OR UPDATE ON public.ap_invoices
FOR EACH ROW EXECUTE FUNCTION public.calc_invoice_tax();

-- ============================================================
-- LANGKAH 4: modify the existing auto-post triggers to split tax when
-- present. Everything outside the new IF branch (idempotency check,
-- accounting_rules lookup, journal_entries header, general_ledger fan-out,
-- posting) is unchanged from the original trigger.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_post_ar_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_tax_gl uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_user_id uuid := COALESCE(auth.uid(), NEW.approved_by, NEW.created_by);
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') AND NEW.invoice_amount > 0 THEN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'AR_INVOICE' AND source_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_rule FROM public.accounting_rules WHERE source_type = 'AR_INVOICE' AND is_active;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_journal_no := public.generate_journal_no();

    INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
    VALUES (v_journal_no, CURRENT_DATE, 'Auto-posted: AR invoice ' || NEW.invoice_number, 'AR_INVOICE', NEW.id, 'DRAFT', v_user_id)
    RETURNING id INTO v_journal_id;

    IF NEW.tax_amount IS NOT NULL AND NEW.tax_amount > 0 THEN
      IF NEW.tax_code_id IS NOT NULL THEN
        SELECT gl_account_id INTO v_tax_gl FROM public.tax_codes WHERE id = NEW.tax_code_id;
      END IF;

      IF v_tax_gl IS NULL THEN
        RAISE EXCEPTION 'Tax code for AR invoice % has no GL account mapped yet. Set it in Master Pajak before approving.', NEW.invoice_number;
      END IF;

      INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
      VALUES
        (v_journal_id, 1, v_rule.debit_account_id, NEW.invoice_amount, 0, 'AR invoice ' || NEW.invoice_number, NEW.customer_id),
        (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.dpp_amount, 'AR invoice ' || NEW.invoice_number || ' (DPP)', NEW.customer_id),
        (v_journal_id, 3, v_tax_gl, 0, NEW.tax_amount, 'AR invoice ' || NEW.invoice_number || ' (PPN Keluaran)', NEW.customer_id);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
      VALUES
        (v_journal_id, 1, v_rule.debit_account_id, NEW.invoice_amount, 0, 'AR invoice ' || NEW.invoice_number, NEW.customer_id),
        (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.invoice_amount, 'AR invoice ' || NEW.invoice_number, NEW.customer_id);
    END IF;

    INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
    SELECT id, account_id, CURRENT_DATE, debit, credit, 'AR_INVOICE', NEW.id
    FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

    UPDATE public.journal_entries
    SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
    WHERE id = v_journal_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_auto_post_ap_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_tax_gl uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_user_id uuid := COALESCE(auth.uid(), NEW.approved_by, NEW.created_by);
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') AND NEW.invoice_amount > 0 THEN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'AP_INVOICE' AND source_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_rule FROM public.accounting_rules WHERE source_type = 'AP_INVOICE' AND is_active;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_journal_no := public.generate_journal_no();

    INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
    VALUES (v_journal_no, CURRENT_DATE, 'Auto-posted: AP invoice ' || NEW.vendor_invoice_number, 'AP_INVOICE', NEW.id, 'DRAFT', v_user_id)
    RETURNING id INTO v_journal_id;

    IF NEW.tax_amount IS NOT NULL AND NEW.tax_amount > 0 THEN
      IF NEW.tax_code_id IS NOT NULL THEN
        SELECT gl_account_id INTO v_tax_gl FROM public.tax_codes WHERE id = NEW.tax_code_id;
      END IF;

      IF v_tax_gl IS NULL THEN
        RAISE EXCEPTION 'Tax code for AP invoice % has no GL account mapped yet. Set it in Master Pajak before approving.', NEW.vendor_invoice_number;
      END IF;

      INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, vendor_id)
      VALUES
        (v_journal_id, 1, v_rule.debit_account_id, NEW.dpp_amount, 0, 'AP invoice ' || NEW.vendor_invoice_number || ' (DPP)', NEW.vendor_id),
        (v_journal_id, 2, v_tax_gl, NEW.tax_amount, 0, 'AP invoice ' || NEW.vendor_invoice_number || ' (PPN Masukan)', NEW.vendor_id),
        (v_journal_id, 3, v_rule.credit_account_id, 0, NEW.invoice_amount, 'AP invoice ' || NEW.vendor_invoice_number, NEW.vendor_id);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, vendor_id)
      VALUES
        (v_journal_id, 1, v_rule.debit_account_id, NEW.invoice_amount, 0, 'AP invoice ' || NEW.vendor_invoice_number, NEW.vendor_id),
        (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.invoice_amount, 'AP invoice ' || NEW.vendor_invoice_number, NEW.vendor_id);
    END IF;

    INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
    SELECT id, account_id, CURRENT_DATE, debit, credit, 'AP_INVOICE', NEW.id
    FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

    UPDATE public.journal_entries
    SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
    WHERE id = v_journal_id;
  END IF;

  RETURN NEW;
END;
$function$;
