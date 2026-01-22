-- Create payment_requests table to track all payment request documents
CREATE TABLE public.payment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_no TEXT NOT NULL UNIQUE,
  ap_invoice_id UUID NOT NULL REFERENCES public.ap_invoices(id) ON DELETE CASCADE,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED')),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_payment_requests_ap_invoice ON public.payment_requests(ap_invoice_id);
CREATE INDEX idx_payment_requests_request_date ON public.payment_requests(request_date);
CREATE INDEX idx_payment_requests_status ON public.payment_requests(status);

-- Enable RLS
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Purchasing and Finance can read payment requests"
ON public.payment_requests
FOR SELECT
USING (
  has_role(auth.uid(), 'PURCHASING'::user_role) OR 
  has_role(auth.uid(), 'FINANCE'::user_role) OR 
  has_role(auth.uid(), 'ADMIN'::user_role) OR 
  has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);

CREATE POLICY "Purchasing can create payment requests"
ON public.payment_requests
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'PURCHASING'::user_role) OR 
  has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);

CREATE POLICY "Finance can update payment requests"
ON public.payment_requests
FOR UPDATE
USING (
  has_role(auth.uid(), 'FINANCE'::user_role) OR 
  has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);

CREATE POLICY "Super Admin can delete payment requests"
ON public.payment_requests
FOR DELETE
USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- Function to generate next payment request number
CREATE OR REPLACE FUNCTION public.generate_payment_request_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_prefix TEXT;
  last_number INTEGER;
  new_number TEXT;
BEGIN
  -- Format: PR-YYYYMM-XXXX
  current_prefix := 'PR-' || to_char(CURRENT_DATE, 'YYYYMM') || '-';
  
  -- Get the last number for current month
  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(request_no, '^PR-\d{6}-', ''),
        ''
      )::INTEGER
    ),
    0
  )
  INTO last_number
  FROM public.payment_requests
  WHERE request_no LIKE current_prefix || '%';
  
  -- Generate new number
  new_number := current_prefix || LPAD((last_number + 1)::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();