-- AR invoices
DROP POLICY IF EXISTS "Role-based ar_invoices read access" ON public.ar_invoices;
CREATE POLICY "Role-based ar_invoices read access" ON public.ar_invoices FOR SELECT TO authenticated
USING (has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- AR receipts
DROP POLICY IF EXISTS "Role-based ar_receipts read access" ON public.ar_receipts;
CREATE POLICY "Role-based ar_receipts read access" ON public.ar_receipts FOR SELECT TO authenticated
USING (has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- AR receipt allocations
DROP POLICY IF EXISTS "Role-based ar_receipt_allocations read access" ON public.ar_receipt_allocations;
CREATE POLICY "Role-based ar_receipt_allocations read access" ON public.ar_receipt_allocations FOR SELECT TO authenticated
USING (has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- Billing letters
DROP POLICY IF EXISTS "Role-based billing_letters read access" ON public.billing_letters;
CREATE POLICY "Role-based billing_letters read access" ON public.billing_letters FOR SELECT TO authenticated
USING (has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- Billing email logs
DROP POLICY IF EXISTS "Role-based billing_email_logs read access" ON public.billing_email_logs;
CREATE POLICY "Role-based billing_email_logs read access" ON public.billing_email_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- Bank accounts (read only)
DROP POLICY IF EXISTS "Role-based bank_accounts read access" ON public.bank_accounts;
CREATE POLICY "Role-based bank_accounts read access" ON public.bank_accounts FOR SELECT TO authenticated
USING (has_role(auth.uid(),'PURCHASING'::user_role) OR has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- Customers
DROP POLICY IF EXISTS "Role-based customers read access" ON public.customers;
CREATE POLICY "Role-based customers read access" ON public.customers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'PURCHASING'::user_role) OR has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- Sales master
DROP POLICY IF EXISTS "Role-based sales read access" ON public.sales;
CREATE POLICY "Role-based sales read access" ON public.sales FOR SELECT TO authenticated
USING (has_role(auth.uid(),'PURCHASING'::user_role) OR has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));

-- Payment terms
DROP POLICY IF EXISTS "Role-based payment_terms read access" ON public.payment_terms;
CREATE POLICY "Role-based payment_terms read access" ON public.payment_terms FOR SELECT TO authenticated
USING (has_role(auth.uid(),'PURCHASING'::user_role) OR has_role(auth.uid(),'FINANCE'::user_role) OR has_role(auth.uid(),'ADMIN'::user_role) OR has_role(auth.uid(),'SUPER_ADMIN'::user_role) OR has_role(auth.uid(),'SALES'::user_role));
