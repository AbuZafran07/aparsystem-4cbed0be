
-- Add wms_so_number column to ar_invoices for SalesPulse matching key
ALTER TABLE public.ar_invoices ADD COLUMN IF NOT EXISTS wms_so_number text;
CREATE INDEX IF NOT EXISTS idx_ar_invoices_wms_so_number ON public.ar_invoices(wms_so_number);

-- Backfill: assume existing order_number was originally SO from WMS for invoices that haven't been overridden by customer PO
-- We do NOT auto-backfill here — WMS resync will populate this field going forward.

-- SalesPulse webhook log table
CREATE TABLE IF NOT EXISTS public.salespulse_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_invoice_id uuid,
  event_type text NOT NULL,
  so_number text,
  invoice_number text,
  request_payload jsonb NOT NULL,
  response_status integer,
  response_body jsonb,
  ok boolean NOT NULL DEFAULT false,
  error_message text,
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_salespulse_webhook_log_invoice ON public.salespulse_webhook_log(ar_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_salespulse_webhook_log_so ON public.salespulse_webhook_log(so_number, event_type, created_at DESC);

ALTER TABLE public.salespulse_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admins can read webhook logs"
ON public.salespulse_webhook_log
FOR SELECT
USING (
  has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);

CREATE POLICY "System can insert webhook logs"
ON public.salespulse_webhook_log
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Super Admin can delete webhook logs"
ON public.salespulse_webhook_log
FOR DELETE
USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- Track which invoices have already been notified as overdue (idempotency for cron)
CREATE TABLE IF NOT EXISTS public.salespulse_overdue_notified (
  ar_invoice_id uuid PRIMARY KEY,
  notified_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.salespulse_overdue_notified ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read overdue notified"
ON public.salespulse_overdue_notified
FOR SELECT
USING (
  has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);

CREATE POLICY "System can insert overdue notified"
ON public.salespulse_overdue_notified
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Super Admin can delete overdue notified"
ON public.salespulse_overdue_notified
FOR DELETE
USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- Enable extensions for cron-based overdue detection
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
