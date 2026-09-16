-- Add NPWP master field to company_profile, customers, and vendors.
-- Purely additive: nullable text columns, no RLS changes needed (they
-- follow each table's existing policies), no other structure touched.

ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS npwp text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS npwp text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS npwp text;
