-- PPh (customer-withheld tax) on AR receipt allocations. Additive,
-- backward-compatible: three NULLABLE columns on ar_receipt_allocations,
-- and trg_auto_post_ar_receipt is modified ONLY to add a 3rd journal line
-- when PPh is present. When pph_amount is empty/0 (the existing behavior
-- for every allocation recorded before this migration and for any new
-- one that leaves it blank), the trigger posts exactly the same 2 lines
-- as before, unchanged. AR is always credited the full `amount` -- the
-- receivable never changes because of PPh, only how the debit side of
-- the journal is split between bank and the PPh asset account.
-- Does not touch AP, or any other module.

-- ============================================================
-- LANGKAH 1: nullable columns
-- ============================================================
ALTER TABLE public.ar_receipt_allocations
  ADD COLUMN IF NOT EXISTS pph_amount numeric,
  ADD COLUMN IF NOT EXISTS pph_type text,
  ADD COLUMN IF NOT EXISTS pph_account_id uuid REFERENCES public.chart_of_accounts(id);

-- Convenience seed: a default "PPh Dibayar Dimuka" (prepaid tax, ASSET)
-- account so the picker in the UI has something to select out of the box.
-- Not required by the schema (pph_account_id stays a free FK pick), purely
-- additive -- Finance can still add/rename via Chart of Accounts.
INSERT INTO public.chart_of_accounts (code, name, account_type, normal_balance, is_control_account, is_active)
SELECT '1450', 'PPh Dibayar Dimuka', 'ASSET', 'DEBIT', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = '1450');

-- ============================================================
-- LANGKAH 2: trg_auto_post_ar_receipt -- add the PPh line only when present
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_post_ar_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rule record;
  v_receipt record;
  v_invoice record;
  v_bank_gl_account uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_user_id uuid;
  v_pph_amount numeric := COALESCE(NEW.pph_amount, 0);
BEGIN
  IF NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'AR_RECEIPT' AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rule FROM public.accounting_rules WHERE source_type = 'AR_RECEIPT' AND is_active;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_receipt FROM public.ar_receipts WHERE id = NEW.receipt_id;
  SELECT * INTO v_invoice FROM public.ar_invoices WHERE id = NEW.ar_invoice_id;
  v_user_id := COALESCE(auth.uid(), v_receipt.created_by);

  SELECT gl_account_id INTO v_bank_gl_account FROM public.bank_accounts WHERE id = v_receipt.bank_account_id;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no, COALESCE(v_receipt.receipt_date, CURRENT_DATE),
    'Auto-posted: AR receipt for invoice ' || COALESCE(v_invoice.invoice_number, ''),
    'AR_RECEIPT', NEW.id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_journal_id;

  IF v_pph_amount > 0 AND NEW.pph_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
    VALUES
      (v_journal_id, 1, COALESCE(v_bank_gl_account, v_rule.debit_account_id), NEW.amount - v_pph_amount, 0,
        'AR receipt allocation', v_invoice.customer_id),
      (v_journal_id, 2, NEW.pph_account_id, v_pph_amount, 0,
        'AR receipt allocation - PPh dipotong pelanggan' || COALESCE(' (' || NEW.pph_type || ')', ''), v_invoice.customer_id),
      (v_journal_id, 3, v_rule.credit_account_id, 0, NEW.amount,
        'AR receipt allocation', v_invoice.customer_id);
  ELSE
    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
    VALUES
      (v_journal_id, 1, COALESCE(v_bank_gl_account, v_rule.debit_account_id), NEW.amount, 0, 'AR receipt allocation', v_invoice.customer_id),
      (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.amount, 'AR receipt allocation', v_invoice.customer_id);
  END IF;

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, COALESCE(v_receipt.receipt_date, CURRENT_DATE), debit, credit, 'AR_RECEIPT', NEW.id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  RETURN NEW;
END;
$function$;
