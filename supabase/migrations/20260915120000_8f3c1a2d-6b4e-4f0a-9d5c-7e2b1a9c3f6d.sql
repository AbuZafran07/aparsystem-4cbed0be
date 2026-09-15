-- Additive feature: line items for AR (sales) invoices, used to render a
-- proper "Cetak Invoice Penjualan" printable document. This table is purely
-- additive: it does NOT alter ar_invoices, its columns, or any existing AR
-- business logic. Rows here are optional detail for an invoice; when an
-- invoice has none, the print feature falls back to a single summary line
-- built from ar_invoices.invoice_amount.

CREATE TABLE IF NOT EXISTS public.ar_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_invoice_id uuid NOT NULL REFERENCES public.ar_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  quantity numeric,
  unit text,
  unit_price numeric,
  amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ar_invoice_items_invoice_id ON public.ar_invoice_items(ar_invoice_id);

ALTER TABLE public.ar_invoice_items ENABLE ROW LEVEL SECURITY;

-- Mirrors the existing "Role-based ar_invoices <verb> access" policies on
-- ar_invoices exactly (SALES also has read access there), so anyone who can
-- see an AR invoice can see its line items, and only Finance/Admin/Super
-- Admin can maintain them.
DROP POLICY IF EXISTS "Role-based ar_invoice_items read access" ON public.ar_invoice_items;
CREATE POLICY "Role-based ar_invoice_items read access" ON public.ar_invoice_items
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR
    has_role(auth.uid(), 'SALES'::user_role)
  );

DROP POLICY IF EXISTS "Role-based ar_invoice_items insert access" ON public.ar_invoice_items;
CREATE POLICY "Role-based ar_invoice_items insert access" ON public.ar_invoice_items
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based ar_invoice_items update access" ON public.ar_invoice_items;
CREATE POLICY "Role-based ar_invoice_items update access" ON public.ar_invoice_items
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based ar_invoice_items delete access" ON public.ar_invoice_items;
CREATE POLICY "Role-based ar_invoice_items delete access" ON public.ar_invoice_items
  FOR DELETE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );
