DROP POLICY IF EXISTS "Role-based bank_accounts read access" ON public.bank_accounts;
CREATE POLICY "Role-based bank_accounts read access" ON public.bank_accounts
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'PURCHASING'::user_role)
  OR has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);