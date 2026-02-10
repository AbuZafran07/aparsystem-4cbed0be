-- Add doc_sent_date column to ar_invoices table
ALTER TABLE public.ar_invoices ADD COLUMN IF NOT EXISTS doc_sent_date date;