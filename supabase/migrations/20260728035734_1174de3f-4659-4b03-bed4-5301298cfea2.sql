
CREATE OR REPLACE FUNCTION public.settle_payment_request(
  _request_id uuid,
  _bank_account_id uuid,
  _reference_no text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request payment_requests%ROWTYPE;
  v_invoice ap_invoices%ROWTYPE;
  v_pay_amount numeric;
  v_new_paid numeric;
  v_new_outstanding numeric;
  v_new_status record_status;
  v_payment_id uuid;
  v_new_pr_id uuid;
  v_new_pr_no text;
  v_remaining numeric;
  v_user_id uuid := auth.uid();
  v_purchasing_user uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_user_id, 'FINANCE'::user_role)
       OR public.has_role(v_user_id, 'ADMIN'::user_role)
       OR public.has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE / ADMIN / SUPER_ADMIN can settle payment requests';
  END IF;

  SELECT * INTO v_request FROM payment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;
  IF v_request.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Payment request must be APPROVED (current: %)', v_request.status;
  END IF;

  v_pay_amount := COALESCE(v_request.approved_amount, v_request.submitted_amount);
  IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid payment amount';
  END IF;

  SELECT * INTO v_invoice FROM ap_invoices WHERE id = v_request.ap_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP invoice not found'; END IF;

  IF v_pay_amount > v_invoice.outstanding_amount THEN
    v_pay_amount := v_invoice.outstanding_amount;
  END IF;

  -- Create ap_payment header
  INSERT INTO ap_payments (payment_date, bank_account_id, reference_no, total_amount, notes, created_by)
  VALUES (
    CURRENT_DATE,
    _bank_account_id,
    NULLIF(_reference_no, ''),
    v_pay_amount,
    'Auto from ' || v_request.request_no,
    v_user_id
  )
  RETURNING id INTO v_payment_id;

  -- Allocation
  INSERT INTO ap_payment_allocations (payment_id, ap_invoice_id, amount)
  VALUES (v_payment_id, v_invoice.id, v_pay_amount);

  -- Update invoice totals
  v_new_paid := COALESCE(v_invoice.paid_amount, 0) + v_pay_amount;
  v_new_outstanding := v_invoice.invoice_amount - v_new_paid;
  IF v_new_outstanding < 0 THEN v_new_outstanding := 0; END IF;
  v_new_status := CASE WHEN v_new_outstanding <= 0 THEN 'PAID'::record_status ELSE 'PARTIAL'::record_status END;

  UPDATE ap_invoices
     SET paid_amount = v_new_paid,
         outstanding_amount = v_new_outstanding,
         overdue_amount = CASE WHEN v_new_outstanding <= 0 THEN 0 ELSE overdue_amount END,
         status = v_new_status,
         paid_date = CASE WHEN v_new_outstanding <= 0 THEN CURRENT_DATE ELSE paid_date END,
         updated_at = now()
   WHERE id = v_invoice.id;

  -- Mark PR paid
  UPDATE payment_requests
     SET status = 'PAID', paid_at = now(), updated_at = now()
   WHERE id = v_request.id;

  -- Auto-create DRAFT PR for remaining outstanding
  v_remaining := v_new_outstanding;
  IF v_remaining > 0 THEN
    v_new_pr_no := public.generate_payment_request_no();
    INSERT INTO payment_requests (
      request_no, ap_invoice_id, request_date, requested_by,
      status, submitted_amount, notes
    ) VALUES (
      v_new_pr_no, v_invoice.id, CURRENT_DATE, v_request.requested_by,
      'DRAFT', v_remaining,
      'Auto-generated from ' || v_request.request_no || ' (sisa pembayaran)'
    )
    RETURNING id INTO v_new_pr_id;

    -- Notify original requester (purchasing)
    v_purchasing_user := v_request.requested_by;
    IF v_purchasing_user IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        v_purchasing_user,
        'Sisa pembayaran perlu diajukan',
        'PR baru ' || v_new_pr_no || ' dibuat otomatis untuk sisa outstanding invoice ' || v_invoice.vendor_invoice_number,
        'info',
        'payment_request',
        v_new_pr_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'new_outstanding', v_new_outstanding,
    'invoice_status', v_new_status,
    'new_pr_id', v_new_pr_id,
    'new_pr_no', v_new_pr_no
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_payment_request(uuid, uuid, text) TO authenticated;
