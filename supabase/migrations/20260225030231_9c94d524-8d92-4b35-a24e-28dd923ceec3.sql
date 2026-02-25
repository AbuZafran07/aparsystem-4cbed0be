
-- Add submitted_amount and approved_amount columns to payment_requests
ALTER TABLE public.payment_requests 
ADD COLUMN submitted_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN approved_amount numeric DEFAULT NULL;
