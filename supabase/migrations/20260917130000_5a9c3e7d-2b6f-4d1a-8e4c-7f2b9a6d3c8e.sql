-- Bank Reconciliation. Additive only: two new tables. Reads general_ledger
-- and bank_accounts but never writes to them -- reconciliation only marks
-- which GL entries have been "cleared" in a separate reference table.
-- Does NOT touch general_ledger, cash_bank_transactions, posting, or any
-- other module.

-- ============================================================
-- LANGKAH 1: bank_reconciliations (header)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id),
  statement_date date NOT NULL,
  statement_ending_balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECONCILED')),
  difference numeric,
  notes text,
  created_by uuid NOT NULL,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_bank_account ON public.bank_reconciliations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_status ON public.bank_reconciliations(status);

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based bank_reconciliations read access" ON public.bank_reconciliations;
CREATE POLICY "Role-based bank_reconciliations read access" ON public.bank_reconciliations
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based bank_reconciliations insert access" ON public.bank_reconciliations;
CREATE POLICY "Role-based bank_reconciliations insert access" ON public.bank_reconciliations
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based bank_reconciliations update access" ON public.bank_reconciliations;
CREATE POLICY "Role-based bank_reconciliations update access" ON public.bank_reconciliations
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================================
-- LANGKAH 2: bank_reconciliation_cleared (reference to cleared GL entries)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_cleared (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
  gl_entry_id uuid NOT NULL REFERENCES public.general_ledger(id),
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_id, gl_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_cleared_gl_entry ON public.bank_reconciliation_cleared(gl_entry_id);

ALTER TABLE public.bank_reconciliation_cleared ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based bank_reconciliation_cleared read access" ON public.bank_reconciliation_cleared;
CREATE POLICY "Role-based bank_reconciliation_cleared read access" ON public.bank_reconciliation_cleared
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based bank_reconciliation_cleared insert access" ON public.bank_reconciliation_cleared;
CREATE POLICY "Role-based bank_reconciliation_cleared insert access" ON public.bank_reconciliation_cleared
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );
