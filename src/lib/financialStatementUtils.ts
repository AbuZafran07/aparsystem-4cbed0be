// Pure calculation helpers for the Financial Statements page variants
// (12 Bulan / Perbandingan / Years-to-Date / Arus Kas). Reuses the exact
// same balance formula FinancialStatementsPage.tsx's "Standar" tab already
// uses (normal_balance-based debit/credit delta per account, summed per
// account_type) — these helpers only add a reusable/parameterized date
// range on top of that formula, they do not change it.
import type { Tables } from '@/integrations/supabase/types';

export type COARow = Tables<'chart_of_accounts'>;
export type GLRow = Tables<'general_ledger'>;

export interface DateRange {
  from?: string;
  to?: string;
}

export interface AccountBalance {
  account: COARow;
  balance: number;
}

/** Same delta formula as FinancialStatementsPage's existing "balances" memo, parameterized by an optional date range instead of a fixed as-of-date. */
export function computeAccountBalances(
  accounts: COARow[],
  glRows: GLRow[],
  range: DateRange = {}
): Record<string, number> {
  const totals: Record<string, number> = {};
  glRows
    .filter((r) => (!range.from || r.posting_date >= range.from) && (!range.to || r.posting_date <= range.to))
    .forEach((r) => {
      const acc = accounts.find((a) => a.id === r.account_id);
      if (!acc) return;
      const delta = acc.normal_balance === 'CREDIT' ? r.credit - r.debit : r.debit - r.credit;
      totals[acc.id] = (totals[acc.id] || 0) + delta;
    });
  return totals;
}

export function groupByType(
  accounts: COARow[],
  totals: Record<string, number>,
  type: COARow['account_type']
): AccountBalance[] {
  return accounts
    .filter((a) => a.account_type === type)
    .map((a) => ({ account: a, balance: totals[a.id] || 0 }))
    .filter((x) => x.balance !== 0);
}

export const sumBalances = (list: AccountBalance[]): number => list.reduce((s, x) => s + x.balance, 0);

export interface PLResult {
  revenue: AccountBalance[];
  expense: AccountBalance[];
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
}

/** Profit & Loss flow for a date range (REVENUE/EXPENSE only). */
export function computePL(accounts: COARow[], glRows: GLRow[], range: DateRange): PLResult {
  const totals = computeAccountBalances(accounts, glRows, range);
  const revenue = groupByType(accounts, totals, 'REVENUE');
  const expense = groupByType(accounts, totals, 'EXPENSE');
  const totalRevenue = sumBalances(revenue);
  const totalExpense = sumBalances(expense);
  return { revenue, expense, totalRevenue, totalExpense, netProfit: totalRevenue - totalExpense };
}

export interface BSResult {
  asset: AccountBalance[];
  liability: AccountBalance[];
  equity: AccountBalance[];
  totalAsset: number;
  totalLiability: number;
  totalEquity: number;
  netProfit: number;
}

/** Balance Sheet as-of a date. netProfit (cumulative since inception, matching the existing Standar tab) is folded into totalEquity exactly like the page's current calculation does. */
export function computeBS(accounts: COARow[], glRows: GLRow[], asOfDate: string): BSResult {
  const totals = computeAccountBalances(accounts, glRows, { to: asOfDate });
  const asset = groupByType(accounts, totals, 'ASSET');
  const liability = groupByType(accounts, totals, 'LIABILITY');
  const equity = groupByType(accounts, totals, 'EQUITY');
  const revenue = groupByType(accounts, totals, 'REVENUE');
  const expense = groupByType(accounts, totals, 'EXPENSE');
  const netProfit = sumBalances(revenue) - sumBalances(expense);
  return {
    asset,
    liability,
    equity,
    totalAsset: sumBalances(asset),
    totalLiability: sumBalances(liability),
    totalEquity: sumBalances(equity) + netProfit,
    netProfit,
  };
}

export function monthRange(year: number, monthIndex0: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, monthIndex0, 1)).toISOString().split('T')[0];
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const to = new Date(Date.UTC(year, monthIndex0, lastDay)).toISOString().split('T')[0];
  return { from, to };
}

export const MONTH_LABELS: { en: string; id: string }[] = [
  { en: 'Jan', id: 'Jan' }, { en: 'Feb', id: 'Feb' }, { en: 'Mar', id: 'Mar' },
  { en: 'Apr', id: 'Apr' }, { en: 'May', id: 'Mei' }, { en: 'Jun', id: 'Jun' },
  { en: 'Jul', id: 'Jul' }, { en: 'Aug', id: 'Agu' }, { en: 'Sep', id: 'Sep' },
  { en: 'Oct', id: 'Okt' }, { en: 'Nov', id: 'Nov' }, { en: 'Dec', id: 'Des' },
];

export interface MonthlyPLRow {
  account: COARow;
  values: number[];
  total: number;
}

export interface MonthlyPLResult {
  monthLabels: string[];
  revenueRows: MonthlyPLRow[];
  expenseRows: MonthlyPLRow[];
  revenueTotals: number[];
  expenseTotals: number[];
  netTotals: number[];
  grandRevenueTotal: number;
  grandExpenseTotal: number;
  grandNetTotal: number;
}

/** P&L "12 Bulan" variant: one column per calendar month of `year`, plus a running Total column (handled by the row's `.total`). */
export function computeMonthlyPL(
  accounts: COARow[],
  glRows: GLRow[],
  year: number,
  language: 'en' | 'id'
): MonthlyPLResult {
  const ranges = Array.from({ length: 12 }, (_, i) => monthRange(year, i));
  const monthlyTotals = ranges.map((r) => computeAccountBalances(accounts, glRows, r));
  const monthLabels = MONTH_LABELS.map((m) => m[language]);

  const buildRows = (type: COARow['account_type']): MonthlyPLRow[] =>
    accounts
      .filter((a) => a.account_type === type)
      .map((a) => {
        const values = monthlyTotals.map((mt) => mt[a.id] || 0);
        const total = values.reduce((s, v) => s + v, 0);
        return { account: a, values, total };
      })
      .filter((r) => r.values.some((v) => v !== 0));

  const revenueRows = buildRows('REVENUE');
  const expenseRows = buildRows('EXPENSE');

  const revenueTotals = ranges.map((_, i) => revenueRows.reduce((s, r) => s + r.values[i], 0));
  const expenseTotals = ranges.map((_, i) => expenseRows.reduce((s, r) => s + r.values[i], 0));
  const netTotals = ranges.map((_, i) => revenueTotals[i] - expenseTotals[i]);

  return {
    monthLabels,
    revenueRows,
    expenseRows,
    revenueTotals,
    expenseTotals,
    netTotals,
    grandRevenueTotal: revenueTotals.reduce((s, v) => s + v, 0),
    grandExpenseTotal: expenseTotals.reduce((s, v) => s + v, 0),
    grandNetTotal: netTotals.reduce((s, v) => s + v, 0),
  };
}

export interface MonthlyBSRow {
  account: COARow;
  values: number[];
}

export interface MonthlyBSResult {
  monthLabels: string[];
  assetRows: MonthlyBSRow[];
  liabilityRows: MonthlyBSRow[];
  equityRows: MonthlyBSRow[];
  totalAssetByMonth: number[];
  totalLiabilityByMonth: number[];
  totalEquityByMonth: number[];
}

/** Balance Sheet "12 Bulan" variant: one column per month showing the cumulative as-of-end-of-month balance. */
export function computeMonthlyBS(
  accounts: COARow[],
  glRows: GLRow[],
  year: number,
  language: 'en' | 'id'
): MonthlyBSResult {
  const monthLabels = MONTH_LABELS.map((m) => m[language]);
  const asOfDates = Array.from({ length: 12 }, (_, i) => monthRange(year, i).to);
  const bsByMonth = asOfDates.map((d) => computeBS(accounts, glRows, d));

  const buildRows = (list: (r: BSResult) => AccountBalance[]): MonthlyBSRow[] => {
    const accIds = new Set<string>();
    bsByMonth.forEach((bs) => list(bs).forEach((x) => accIds.add(x.account.id)));
    return accounts
      .filter((a) => accIds.has(a.id))
      .map((a) => ({
        account: a,
        values: bsByMonth.map((bs) => list(bs).find((x) => x.account.id === a.id)?.balance || 0),
      }));
  };

  return {
    monthLabels,
    assetRows: buildRows((bs) => bs.asset),
    liabilityRows: buildRows((bs) => bs.liability),
    equityRows: buildRows((bs) => bs.equity),
    totalAssetByMonth: bsByMonth.map((bs) => bs.totalAsset),
    totalLiabilityByMonth: bsByMonth.map((bs) => bs.totalLiability),
    totalEquityByMonth: bsByMonth.map((bs) => bs.totalEquity),
  };
}

export interface UnionRow {
  account: COARow;
  values: number[];
}

/** Merges per-column AccountBalance[] (each column independently filtered to non-zero balances, so their account sets can differ) into a single row set with one value per column, ordered by account code. Used by the "Perbandingan 2/4 Kolom" variants. */
export function unionRows(perColumn: AccountBalance[][]): UnionRow[] {
  const accMap = new Map<string, COARow>();
  perColumn.forEach((list) => list.forEach((x) => { if (!accMap.has(x.account.id)) accMap.set(x.account.id, x.account); }));
  return Array.from(accMap.values())
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((account) => ({
      account,
      values: perColumn.map((list) => list.find((x) => x.account.id === account.id)?.balance || 0),
    }));
}

export const dayBefore = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
};

export interface CashAccountSummary {
  account: COARow;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}

export function computeCashSummary(
  account: COARow,
  glRows: GLRow[],
  range: { from: string; to: string }
): CashAccountSummary {
  const opening = computeAccountBalances([account], glRows, { to: dayBefore(range.from) })[account.id] || 0;
  const periodRows = glRows.filter((r) => r.account_id === account.id && r.posting_date >= range.from && r.posting_date <= range.to);
  const totalIn = periodRows.reduce((s, r) => s + r.debit, 0);
  const totalOut = periodRows.reduce((s, r) => s + r.credit, 0);
  return {
    account,
    openingBalance: opening,
    totalIn,
    totalOut,
    closingBalance: opening + totalIn - totalOut,
  };
}

export interface CashDetailRow {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export function computeCashDetail(
  account: COARow,
  glRows: GLRow[],
  range: { from: string; to: string },
  descriptionByLineId: Record<string, string>
): CashDetailRow[] {
  let running = computeAccountBalances([account], glRows, { to: dayBefore(range.from) })[account.id] || 0;
  return glRows
    .filter((r) => r.account_id === account.id && r.posting_date >= range.from && r.posting_date <= range.to)
    .sort((a, b) => (a.posting_date < b.posting_date ? -1 : a.posting_date > b.posting_date ? 1 : 0))
    .map((r) => {
      running += r.debit - r.credit;
      return {
        id: r.id,
        date: r.posting_date,
        description: descriptionByLineId[r.journal_line_id] || r.source_type || '-',
        debit: r.debit,
        credit: r.credit,
        balance: running,
      };
    });
}
