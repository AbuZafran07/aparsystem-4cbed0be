
-- Add array column for multi-invoice billing letters
ALTER TABLE public.billing_letters 
ADD COLUMN ar_invoice_ids uuid[] DEFAULT NULL;

-- Add customer_id for quick lookup on multi-invoice letters
ALTER TABLE public.billing_letters 
ADD COLUMN customer_id uuid REFERENCES public.customers(id) DEFAULT NULL;

-- Add total_amount for the combined outstanding
ALTER TABLE public.billing_letters 
ADD COLUMN total_outstanding numeric DEFAULT 0;
