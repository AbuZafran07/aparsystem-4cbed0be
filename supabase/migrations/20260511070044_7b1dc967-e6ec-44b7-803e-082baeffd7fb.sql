
-- Departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#2D6A4F',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budgets per department per year
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, year)
);

-- Cash out transactions (Audit)
CREATE TABLE public.cash_out_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  keterangan TEXT NOT NULL,
  nominal BIGINT NOT NULL DEFAULT 0,
  bulan TEXT NOT NULL,
  tahun INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'normal',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_out_dept ON public.cash_out_transactions(department_id);
CREATE INDEX idx_cash_out_tahun ON public.cash_out_transactions(tahun);
CREATE INDEX idx_budgets_year ON public.budgets(year);

-- Updated_at triggers
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_budgets_updated BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cashout_updated BEFORE UPDATE ON public.cash_out_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_out_transactions ENABLE ROW LEVEL SECURITY;

-- Helper: any authenticated internal user can read; only ADMIN/SUPER_ADMIN/FINANCE can write
-- Departments
CREATE POLICY "Authenticated can view departments"
  ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN'::user_role) OR public.has_role(auth.uid(), 'SUPER_ADMIN'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'::user_role) OR public.has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- Budgets
CREATE POLICY "Authenticated can view budgets"
  ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage budgets"
  ON public.budgets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN'::user_role) OR public.has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR public.has_role(auth.uid(), 'FINANCE'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'::user_role) OR public.has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR public.has_role(auth.uid(), 'FINANCE'::user_role));

-- Cash out
CREATE POLICY "Authenticated can view cash_out"
  ON public.cash_out_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users manage cash_out"
  ON public.cash_out_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN'::user_role) OR public.has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR public.has_role(auth.uid(), 'FINANCE'::user_role) OR public.has_role(auth.uid(), 'PURCHASING'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'::user_role) OR public.has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR public.has_role(auth.uid(), 'FINANCE'::user_role) OR public.has_role(auth.uid(), 'PURCHASING'::user_role));
