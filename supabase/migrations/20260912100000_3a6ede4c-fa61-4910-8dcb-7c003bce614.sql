-- Finance ERP Phase 1: Accounting schema (additive-only)
-- Adds Chart of Accounts / Fiscal Periods / Journal / General Ledger on top of
-- the existing AR/AP tables. Does NOT alter any existing table's behavior.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE public.account_type AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'normal_balance') THEN
    CREATE TYPE public.normal_balance AS ENUM ('DEBIT','CREDIT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journal_status') THEN
    CREATE TYPE public.journal_status AS ENUM ('DRAFT','POSTED','REVERSED','VOIDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_period_status') THEN
    CREATE TYPE public.fiscal_period_status AS ENUM ('OPEN','SOFT_CLOSE','HARD_CLOSE');
  END IF;
END$$;

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type public.account_type NOT NULL,
  normal_balance public.normal_balance NOT NULL,
  parent_id uuid NULL REFERENCES public.chart_of_accounts(id),
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_coa_parent ON public.chart_of_accounts(parent_id);

-- Fiscal Periods
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  period_no integer NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.fiscal_period_status NOT NULL DEFAULT 'OPEN',
  closed_by uuid NULL REFERENCES auth.users(id),
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_periods_year_no ON public.fiscal_periods(fiscal_year, period_no);

-- Accounting Rules (simple source_type -> debit/credit account lookup, not a full dimension rule engine)
CREATE TABLE IF NOT EXISTS public.accounting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL UNIQUE,
  debit_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  credit_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Journal Entries (header)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_no text NOT NULL UNIQUE,
  entry_date date NOT NULL,
  description text NULL,
  source_type text NULL,
  source_id uuid NULL,
  status public.journal_status NOT NULL DEFAULT 'DRAFT',
  posted_at timestamptz NULL,
  posted_by uuid NULL REFERENCES auth.users(id),
  reversed_journal_id uuid NULL REFERENCES public.journal_entries(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Guarantees a given AR/AP invoice or receipt/payment allocation can only ever
-- produce one auto-posted journal (idempotency for the Phase 1 triggers).
CREATE UNIQUE INDEX IF NOT EXISTS ux_journal_source ON public.journal_entries(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_journal_status_date ON public.journal_entries(status, entry_date);

-- Journal Entry Lines
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  description text NULL,
  customer_id uuid NULL REFERENCES public.customers(id),
  vendor_id uuid NULL REFERENCES public.vendors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_jel_debit_credit CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0))
);

CREATE INDEX IF NOT EXISTS ix_jel_journal ON public.journal_entry_lines(journal_id);
CREATE INDEX IF NOT EXISTS ix_jel_account ON public.journal_entry_lines(account_id);

-- General Ledger (posted, immutable - written only by the posting RPCs/triggers)
CREATE TABLE IF NOT EXISTS public.general_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_line_id uuid NOT NULL REFERENCES public.journal_entry_lines(id),
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  posting_date date NOT NULL,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  source_type text NULL,
  source_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gl_account_date ON public.general_ledger(account_id, posting_date);
CREATE INDEX IF NOT EXISTS ix_gl_source ON public.general_ledger(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gl_journal_line ON public.general_ledger(journal_line_id);

-- Extend bank_accounts (additive column only - existing usage untouched)
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS gl_account_id uuid NULL REFERENCES public.chart_of_accounts(id);

-- Row Level Security
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;

-- chart_of_accounts: FINANCE/ADMIN/SUPER_ADMIN can read & write, SUPER_ADMIN only can delete
DROP POLICY IF EXISTS "Role-based chart_of_accounts read access" ON public.chart_of_accounts;
CREATE POLICY "Role-based chart_of_accounts read access" ON public.chart_of_accounts
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based chart_of_accounts insert access" ON public.chart_of_accounts;
CREATE POLICY "Role-based chart_of_accounts insert access" ON public.chart_of_accounts
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based chart_of_accounts update access" ON public.chart_of_accounts;
CREATE POLICY "Role-based chart_of_accounts update access" ON public.chart_of_accounts
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based chart_of_accounts delete access" ON public.chart_of_accounts;
CREATE POLICY "Role-based chart_of_accounts delete access" ON public.chart_of_accounts
  FOR DELETE USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- fiscal_periods: FINANCE/ADMIN/SUPER_ADMIN read; write via table policy limited to FINANCE/ADMIN/SUPER_ADMIN
-- (status transitions themselves are additionally gated through close/reopen RPCs)
DROP POLICY IF EXISTS "Role-based fiscal_periods read access" ON public.fiscal_periods;
CREATE POLICY "Role-based fiscal_periods read access" ON public.fiscal_periods
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based fiscal_periods insert access" ON public.fiscal_periods;
CREATE POLICY "Role-based fiscal_periods insert access" ON public.fiscal_periods
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

DROP POLICY IF EXISTS "Role-based fiscal_periods update access" ON public.fiscal_periods;
CREATE POLICY "Role-based fiscal_periods update access" ON public.fiscal_periods
  FOR UPDATE USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

DROP POLICY IF EXISTS "Role-based fiscal_periods delete access" ON public.fiscal_periods;
CREATE POLICY "Role-based fiscal_periods delete access" ON public.fiscal_periods
  FOR DELETE USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- accounting_rules: FINANCE/ADMIN/SUPER_ADMIN read & write, SUPER_ADMIN only delete
DROP POLICY IF EXISTS "Role-based accounting_rules read access" ON public.accounting_rules;
CREATE POLICY "Role-based accounting_rules read access" ON public.accounting_rules
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based accounting_rules insert access" ON public.accounting_rules;
CREATE POLICY "Role-based accounting_rules insert access" ON public.accounting_rules
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based accounting_rules update access" ON public.accounting_rules;
CREATE POLICY "Role-based accounting_rules update access" ON public.accounting_rules
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based accounting_rules delete access" ON public.accounting_rules;
CREATE POLICY "Role-based accounting_rules delete access" ON public.accounting_rules
  FOR DELETE USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

-- journal_entries / journal_entry_lines / general_ledger: READ ONLY for clients.
-- All writes happen exclusively through the SECURITY DEFINER RPCs/triggers in the
-- next migrations, so posted journals stay immutable and debit=credit is always
-- enforced server-side.
DROP POLICY IF EXISTS "Role-based journal_entries read access" ON public.journal_entries;
CREATE POLICY "Role-based journal_entries read access" ON public.journal_entries
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based journal_entry_lines read access" ON public.journal_entry_lines;
CREATE POLICY "Role-based journal_entry_lines read access" ON public.journal_entry_lines
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based general_ledger read access" ON public.general_ledger;
CREATE POLICY "Role-based general_ledger read access" ON public.general_ledger
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );
