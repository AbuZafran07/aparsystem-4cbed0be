-- Finance ERP Phase 1: auto-post AR/AP events into the General Ledger.
-- Each trigger is idempotent (guarded by the ux_journal_source unique index /
-- explicit existence check) and skips silently if no accounting_rules mapping
-- is configured yet, so it never blocks the existing AR/AP workflow.
-- Known limitation (Phase 2): reverting an invoice's status after it has been
-- auto-posted does not auto-reverse the journal - use reverse_journal_entry().

-- AR invoice -> APPROVED: Dr Accounts Receivable / Cr Sales Revenue (AR_INVOICE rule)
CREATE OR REPLACE FUNCTION public.trg_auto_post_ar_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rule record;
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

    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
    VALUES
      (v_journal_id, 1, v_rule.debit_account_id, NEW.invoice_amount, 0, 'AR invoice ' || NEW.invoice_number, NEW.customer_id),
      (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.invoice_amount, 'AR invoice ' || NEW.invoice_number, NEW.customer_id);

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

DROP TRIGGER IF EXISTS trg_ar_invoice_auto_post ON public.ar_invoices;
CREATE TRIGGER trg_ar_invoice_auto_post
AFTER UPDATE ON public.ar_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_post_ar_invoice();

-- AP invoice -> APPROVED: Dr Purchase Expense / Cr Accounts Payable (AP_INVOICE rule)
CREATE OR REPLACE FUNCTION public.trg_auto_post_ap_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rule record;
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

    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, vendor_id)
    VALUES
      (v_journal_id, 1, v_rule.debit_account_id, NEW.invoice_amount, 0, 'AP invoice ' || NEW.vendor_invoice_number, NEW.vendor_id),
      (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.invoice_amount, 'AP invoice ' || NEW.vendor_invoice_number, NEW.vendor_id);

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

DROP TRIGGER IF EXISTS trg_ap_invoice_auto_post ON public.ap_invoices;
CREATE TRIGGER trg_ap_invoice_auto_post
AFTER UPDATE ON public.ap_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_post_ap_invoice();

-- AR receipt allocation (new row) -> Dr Bank (via bank_accounts.gl_account_id,
-- falls back to the AR_RECEIPT rule's default debit account) / Cr Accounts Receivable
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

  INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, customer_id)
  VALUES
    (v_journal_id, 1, COALESCE(v_bank_gl_account, v_rule.debit_account_id), NEW.amount, 0, 'AR receipt allocation', v_invoice.customer_id),
    (v_journal_id, 2, v_rule.credit_account_id, 0, NEW.amount, 'AR receipt allocation', v_invoice.customer_id);

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, COALESCE(v_receipt.receipt_date, CURRENT_DATE), debit, credit, 'AR_RECEIPT', NEW.id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ar_receipt_allocation_auto_post ON public.ar_receipt_allocations;
CREATE TRIGGER trg_ar_receipt_allocation_auto_post
AFTER INSERT ON public.ar_receipt_allocations
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_post_ar_receipt();

-- AP payment allocation (new row) -> Dr Accounts Payable / Cr Bank (via
-- bank_accounts.gl_account_id, falls back to the AP_PAYMENT rule's default credit account)
CREATE OR REPLACE FUNCTION public.trg_auto_post_ap_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rule record;
  v_payment record;
  v_invoice record;
  v_bank_gl_account uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_user_id uuid;
BEGIN
  IF NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'AP_PAYMENT' AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rule FROM public.accounting_rules WHERE source_type = 'AP_PAYMENT' AND is_active;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_payment FROM public.ap_payments WHERE id = NEW.payment_id;
  SELECT * INTO v_invoice FROM public.ap_invoices WHERE id = NEW.ap_invoice_id;
  v_user_id := COALESCE(auth.uid(), v_payment.created_by);

  SELECT gl_account_id INTO v_bank_gl_account FROM public.bank_accounts WHERE id = v_payment.bank_account_id;

  v_journal_no := public.generate_journal_no();

  INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (
    v_journal_no, COALESCE(v_payment.payment_date, CURRENT_DATE),
    'Auto-posted: AP payment for invoice ' || COALESCE(v_invoice.vendor_invoice_number, ''),
    'AP_PAYMENT', NEW.id, 'DRAFT', v_user_id
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description, vendor_id)
  VALUES
    (v_journal_id, 1, v_rule.debit_account_id, NEW.amount, 0, 'AP payment allocation', v_invoice.vendor_id),
    (v_journal_id, 2, COALESCE(v_bank_gl_account, v_rule.credit_account_id), 0, NEW.amount, 'AP payment allocation', v_invoice.vendor_id);

  INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
  SELECT id, account_id, COALESCE(v_payment.payment_date, CURRENT_DATE), debit, credit, 'AP_PAYMENT', NEW.id
  FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_journal_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ap_payment_allocation_auto_post ON public.ap_payment_allocations;
CREATE TRIGGER trg_ap_payment_allocation_auto_post
AFTER INSERT ON public.ap_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_post_ap_payment();
