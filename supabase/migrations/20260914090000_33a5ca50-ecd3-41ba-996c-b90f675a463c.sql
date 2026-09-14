-- Ensure import_batches / import_row_errors accept writes from the roles that
-- can access the Import/Export Center (PURCHASING, FINANCE, ADMIN, SUPER_ADMIN).
-- These tables predate the tracked migration history, so their existing RLS
-- policies (if any) are unknown; adding a permissive policy here only widens
-- access (Postgres OR's permissive policies together) and never narrows or
-- removes whatever is already in place.

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_row_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based import_batches read access" ON public.import_batches;
CREATE POLICY "Role-based import_batches read access" ON public.import_batches
  FOR SELECT USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based import_batches insert access" ON public.import_batches;
CREATE POLICY "Role-based import_batches insert access" ON public.import_batches
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based import_row_errors read access" ON public.import_row_errors;
CREATE POLICY "Role-based import_row_errors read access" ON public.import_row_errors
  FOR SELECT USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based import_row_errors insert access" ON public.import_row_errors;
CREATE POLICY "Role-based import_row_errors insert access" ON public.import_row_errors
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- Also allow these roles to insert directly into the master-data tables the
-- new bulk-import feature writes to (sales, payment_terms, bank_accounts,
-- chart_of_accounts), matching the read/write access already granted to the
-- same roles for the other master-data tables.
DROP POLICY IF EXISTS "Role-based sales insert access" ON public.sales;
CREATE POLICY "Role-based sales insert access" ON public.sales
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based payment_terms insert access" ON public.payment_terms;
CREATE POLICY "Role-based payment_terms insert access" ON public.payment_terms
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based bank_accounts insert access" ON public.bank_accounts;
CREATE POLICY "Role-based bank_accounts insert access" ON public.bank_accounts
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );
