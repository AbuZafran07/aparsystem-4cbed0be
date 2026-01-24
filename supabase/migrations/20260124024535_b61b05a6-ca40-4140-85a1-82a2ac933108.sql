-- Add bank account fields to vendors table
ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account_no TEXT;