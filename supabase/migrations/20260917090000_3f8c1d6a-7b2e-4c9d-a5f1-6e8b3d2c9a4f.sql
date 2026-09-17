-- Fixed Asset module with automatic monthly depreciation posting.
-- Additive only: two new tables, one new RPC, three new seed COA accounts.
-- Does NOT touch AR/AP, existing posting triggers, wms-sync, Kas & Bank,
-- or any other module.

-- ============================================================
-- LANGKAH 1: fixed_assets
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  acquisition_date date NOT NULL,
  acquisition_cost numeric NOT NULL DEFAULT 0,
  salvage_value numeric NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL,
  depreciation_method text NOT NULL DEFAULT 'STRAIGHT_LINE',
  accumulated_depreciation numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED')),
  asset_account_id uuid REFERENCES public.chart_of_accounts(id),
  accum_deprec_account_id uuid REFERENCES public.chart_of_accounts(id),
  deprec_expense_account_id uuid REFERENCES public.chart_of_accounts(id),
  department_id uuid REFERENCES public.departments(id),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON public.fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON public.fixed_assets(category);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based fixed_assets read access" ON public.fixed_assets;
CREATE POLICY "Role-based fixed_assets read access" ON public.fixed_assets
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based fixed_assets insert access" ON public.fixed_assets;
CREATE POLICY "Role-based fixed_assets insert access" ON public.fixed_assets
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based fixed_assets update access" ON public.fixed_assets;
CREATE POLICY "Role-based fixed_assets update access" ON public.fixed_assets
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Role-based fixed_assets delete access" ON public.fixed_assets;
CREATE POLICY "Role-based fixed_assets delete access" ON public.fixed_assets
  FOR DELETE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

DROP TRIGGER IF EXISTS update_fixed_assets_updated_at ON public.fixed_assets;
CREATE TRIGGER update_fixed_assets_updated_at
BEFORE UPDATE ON public.fixed_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LANGKAH 2: depreciation_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount numeric NOT NULL DEFAULT 0,
  posted boolean NOT NULL DEFAULT false,
  journal_id uuid REFERENCES public.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixed_asset_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset ON public.depreciation_entries(fixed_asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_period ON public.depreciation_entries(period_year, period_month);

ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-based depreciation_entries read access" ON public.depreciation_entries;
CREATE POLICY "Role-based depreciation_entries read access" ON public.depreciation_entries
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );
-- Intentionally no INSERT/UPDATE policy: rows are written only by the
-- run_monthly_depreciation() SECURITY DEFINER RPC below, matching the
-- existing journal_entries/general_ledger convention (no direct client
-- writes to auto-posted ledger data).

-- Seed the Chart of Accounts entries needed for depreciation postings.
-- New codes only (1500/1590/5400); nothing else touched. Admin can
-- repoint these per-asset via the Fixed Assets register form.
INSERT INTO public.chart_of_accounts (code, name, account_type, normal_balance, is_control_account, is_active)
VALUES
  ('1500', 'Aset Tetap', 'ASSET', 'DEBIT', false, true),
  ('1590', 'Akumulasi Penyusutan', 'ASSET', 'CREDIT', false, true),
  ('5400', 'Beban Penyusutan', 'EXPENSE', 'DEBIT', false, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- LANGKAH 3: run_monthly_depreciation(_year, _month)
-- Follows the same direct-insert pattern as the existing auto-post
-- triggers (own journal numbering, direct journal_entries/
-- journal_entry_lines/general_ledger inserts, immediate POSTED status)
-- rather than calling create_journal_entry/post_journal_entry, since
-- this RPC is itself the "maker" and "poster" in one call — going
-- through post_journal_entry's maker-checker check would block every
-- FINANCE/ADMIN user (only SUPER_ADMIN could ever run it).
--
-- Journal source_id is the depreciation_entries row's own id, NOT the
-- fixed_asset's id: journal_entries has a UNIQUE(source_type, source_id)
-- index (ux_journal_source, from Phase 1) that allows only one journal
-- per source ever, which is correct for a one-time event like an AR/AP
-- invoice approval but would block every month after the first for the
-- same asset if source_id were the asset id. Using the depreciation
-- entry's id (fresh per period, enforced unique by
-- depreciation_entries' own (fixed_asset_id, period_year, period_month)
-- constraint) keeps every existing invoice's posting behavior
-- untouched while giving each month's depreciation journal its own
-- traceable source.
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(_year integer, _month integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_asset record;
  v_period_id uuid;
  v_period_status fiscal_period_status;
  v_period_date date;
  v_remaining numeric;
  v_monthly numeric;
  v_deprec_entry_id uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_prefix text;
  v_last_number integer;
  v_posted_count integer := 0;
  v_skipped_count integer := 0;
  v_total_amount numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'FINANCE'::user_role) OR
          has_role(v_user_id, 'ADMIN'::user_role) OR
          has_role(v_user_id, 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: only FINANCE/ADMIN/SUPER_ADMIN can run depreciation';
  END IF;

  IF _month < 1 OR _month > 12 THEN
    RAISE EXCEPTION 'Invalid month %', _month;
  END IF;

  v_period_date := (date_trunc('month', make_date(_year, _month, 1)) + INTERVAL '1 month - 1 day')::date;

  v_period_id := public.get_or_create_fiscal_period(v_period_date);
  SELECT status INTO v_period_status FROM public.fiscal_periods WHERE id = v_period_id;
  IF v_period_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Fiscal period covering %-% is not open for posting', _year, _month;
  END IF;

  FOR v_asset IN
    SELECT fa.* FROM public.fixed_assets fa
    WHERE fa.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM public.depreciation_entries de
        WHERE de.fixed_asset_id = fa.id AND de.period_year = _year AND de.period_month = _month
      )
    FOR UPDATE
  LOOP
    v_remaining := (v_asset.acquisition_cost - v_asset.salvage_value) - v_asset.accumulated_depreciation;

    IF v_remaining <= 0 THEN
      UPDATE public.fixed_assets SET status = 'FULLY_DEPRECIATED', updated_at = now() WHERE id = v_asset.id;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_asset.useful_life_months IS NULL OR v_asset.useful_life_months <= 0 THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_asset.asset_account_id IS NULL OR v_asset.accum_deprec_account_id IS NULL OR v_asset.deprec_expense_account_id IS NULL THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_monthly := ROUND((v_asset.acquisition_cost - v_asset.salvage_value) / v_asset.useful_life_months, 2);
    IF v_monthly > v_remaining THEN
      v_monthly := v_remaining;
    END IF;

    IF v_monthly <= 0 THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Create the depreciation_entries row first (its id becomes the
    -- journal's source_id -- see note above on ux_journal_source).
    INSERT INTO public.depreciation_entries (fixed_asset_id, period_year, period_month, amount, posted)
    VALUES (v_asset.id, _year, _month, v_monthly, false)
    RETURNING id INTO v_deprec_entry_id;

    v_prefix := 'JE-' || to_char(CURRENT_DATE, 'YYYYMM') || '-';
    SELECT COALESCE(MAX(NULLIF(regexp_replace(journal_no, '^JE-\d{6}-', ''), '')::integer), 0)
    INTO v_last_number
    FROM public.journal_entries
    WHERE journal_no LIKE v_prefix || '%';
    v_journal_no := v_prefix || LPAD((v_last_number + 1)::text, 4, '0');

    INSERT INTO public.journal_entries (journal_no, entry_date, description, source_type, source_id, status, created_by)
    VALUES (
      v_journal_no,
      v_period_date,
      'Auto-posted: Depreciation ' || v_asset.asset_code || ' - ' || v_asset.name || ' (' || _year || '-' || LPAD(_month::text, 2, '0') || ')',
      'FIXED_ASSET_DEPRECIATION',
      v_deprec_entry_id,
      'DRAFT',
      v_user_id
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_entry_lines (journal_id, line_no, account_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_asset.deprec_expense_account_id, v_monthly, 0, v_asset.asset_code || ' - ' || v_asset.name),
      (v_journal_id, 2, v_asset.accum_deprec_account_id, 0, v_monthly, v_asset.asset_code || ' - ' || v_asset.name);

    INSERT INTO public.general_ledger (journal_line_id, account_id, posting_date, debit, credit, source_type, source_id)
    SELECT id, account_id, v_period_date, debit, credit, 'FIXED_ASSET_DEPRECIATION', v_deprec_entry_id
    FROM public.journal_entry_lines WHERE journal_id = v_journal_id;

    UPDATE public.journal_entries
    SET status = 'POSTED', posted_at = now(), posted_by = v_user_id, updated_at = now()
    WHERE id = v_journal_id;

    UPDATE public.depreciation_entries
    SET journal_id = v_journal_id, posted = true
    WHERE id = v_deprec_entry_id;

    UPDATE public.fixed_assets
    SET accumulated_depreciation = accumulated_depreciation + v_monthly,
        status = CASE WHEN accumulated_depreciation + v_monthly >= (acquisition_cost - salvage_value) THEN 'FULLY_DEPRECIATED' ELSE status END,
        updated_at = now()
    WHERE id = v_asset.id;

    v_posted_count := v_posted_count + 1;
    v_total_amount := v_total_amount + v_monthly;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted_count, 'skipped', v_skipped_count, 'total_amount', v_total_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_monthly_depreciation(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_monthly_depreciation(integer, integer) TO authenticated;
