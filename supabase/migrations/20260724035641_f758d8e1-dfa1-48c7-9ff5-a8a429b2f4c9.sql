
-- profiles: drop broad "all authenticated" read; keep own+admin policy
DROP POLICY IF EXISTS "All authenticated users can read profiles" ON public.profiles;

-- budgets: replace broad SELECT with role-scoped
DROP POLICY IF EXISTS "Authenticated can view budgets" ON public.budgets;
CREATE POLICY "Authorized can view budgets" ON public.budgets
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  OR has_role(auth.uid(), 'FINANCE'::user_role)
);

-- cash_out_transactions: replace broad SELECT with role-scoped
DROP POLICY IF EXISTS "Authenticated can view cash_out" ON public.cash_out_transactions;
CREATE POLICY "Authorized can view cash_out" ON public.cash_out_transactions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  OR has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'PURCHASING'::user_role)
);

-- departments: replace broad SELECT with role-scoped
DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
CREATE POLICY "Authorized can view departments" ON public.departments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  OR has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'PURCHASING'::user_role)
);

-- payment_terms: replace broad SELECT with role-scoped (include SALES for AR views)
DROP POLICY IF EXISTS "All authenticated users can read payment_terms" ON public.payment_terms;
CREATE POLICY "Authorized can read payment_terms" ON public.payment_terms
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  OR has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'PURCHASING'::user_role)
  OR has_role(auth.uid(), 'SALES'::user_role)
);

-- company_profile: replace broad SELECT with role-scoped (all internal roles)
DROP POLICY IF EXISTS "All authenticated users can read company_profile" ON public.company_profile;
CREATE POLICY "Authorized can read company_profile" ON public.company_profile
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN'::user_role)
  OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  OR has_role(auth.uid(), 'FINANCE'::user_role)
  OR has_role(auth.uid(), 'PURCHASING'::user_role)
  OR has_role(auth.uid(), 'SALES'::user_role)
);

-- has_role: SECURITY DEFINER should NOT be callable by anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, user_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, user_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, user_role) TO service_role;

-- Storage: drop broad public listing SELECT policies on public buckets.
-- Files remain accessible via direct public URLs (public buckets),
-- but anonymous listing of bucket contents is disabled.
DROP POLICY IF EXISTS "Company logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
