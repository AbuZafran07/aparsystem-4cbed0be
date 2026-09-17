import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Wallet, Scale } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import KpiCard from '@/components/dashboard/KpiCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { computePL, computeBS, computeMonthlyPL, computeAccountBalances } from '@/lib/financialStatementUtils';

type COARow = Tables<'chart_of_accounts'>;
type GLRow = Tables<'general_ledger'>;
type BankAccount = Tables<'bank_accounts'>;

type PeriodMode = 'month' | 'year';

const formatCurrency = (amount: number, compact = false) => {
  if (compact) {
    if (Math.abs(amount) >= 1000000000) return `Rp ${(amount / 1000000000).toFixed(1)}B`;
    if (Math.abs(amount) >= 1000000) return `Rp ${(amount / 1000000).toFixed(1)}Jt`;
    if (Math.abs(amount) >= 1000) return `Rp ${(amount / 1000).toFixed(0)}K`;
    return `Rp ${amount.toFixed(0)}`;
  }
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatFullCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const todayStr = () => new Date().toISOString().split('T')[0];

export default function FinancialOverview() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<COARow[]>([]);
  const [glRows, setGlRows] = useState<GLRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: accData, error: accErr },
        { data: glData, error: glErr },
        { data: bankData },
      ] = await Promise.all([
        supabase.from('chart_of_accounts').select('*').order('code'),
        supabase.from('general_ledger').select('*'),
        supabase.from('bank_accounts').select('*').eq('is_active', true),
      ]);
      if (accErr) throw accErr;
      if (glErr) throw glErr;
      setAccounts(accData || []);
      setGlRows(glData || []);
      setBankAccounts(bankData || []);
    } catch (error) {
      console.error('Error loading financial overview:', error);
      toast.error(language === 'en' ? 'Failed to load financial data' : 'Gagal memuat data keuangan');
    } finally {
      setLoading(false);
    }
  };

  const today = todayStr();
  const currentYear = new Date().getFullYear();

  const periodRange = useMemo(() => {
    if (periodMode === 'year') return { from: `${currentYear}-01-01`, to: today };
    const start = new Date();
    start.setDate(1);
    return { from: start.toISOString().split('T')[0], to: today };
  }, [periodMode, today, currentYear]);

  const pl = useMemo(() => computePL(accounts, glRows, periodRange), [accounts, glRows, periodRange]);
  const bs = useMemo(() => computeBS(accounts, glRows, today), [accounts, glRows, today]);
  const monthlyPL = useMemo(() => computeMonthlyPL(accounts, glRows, currentYear, language), [accounts, glRows, currentYear, language]);

  // No formal COGS flag exists on chart_of_accounts; detect it by the
  // Phase 4 seeded code (5200) or a matching name so HPP/Laba Kotor only
  // appear when such an account genuinely exists ("bila akun ada").
  const hasCogs = useMemo(
    () => accounts.some(a => a.account_type === 'EXPENSE' && (a.code === '5200' || /cogs|harga pokok/i.test(a.name))),
    [accounts]
  );
  const cogsAmount = useMemo(
    () => hasCogs ? pl.expense.filter(x => x.account.code === '5200' || /cogs|harga pokok/i.test(x.account.name)).reduce((s, x) => s + x.balance, 0) : 0,
    [pl.expense, hasCogs]
  );
  const grossProfit = pl.totalRevenue - cogsAmount;

  const cashBalance = useMemo(() => {
    const glAccountIds = bankAccounts.map(b => b.gl_account_id).filter((id): id is string => !!id);
    if (glAccountIds.length === 0) return 0;
    const totals = computeAccountBalances(accounts, glRows, { to: today });
    return glAccountIds.reduce((s, id) => s + (totals[id] || 0), 0);
  }, [bankAccounts, accounts, glRows, today]);

  const grossMarginPct = hasCogs && pl.totalRevenue > 0 ? (grossProfit / pl.totalRevenue) * 100 : null;
  const netMarginPct = pl.totalRevenue > 0 ? (pl.netProfit / pl.totalRevenue) * 100 : null;

  const chartData = monthlyPL.monthLabels.map((label, i) => ({
    month: label,
    pendapatan: monthlyPL.revenueTotals[i],
    beban: monthlyPL.expenseTotals[i],
    laba: monthlyPL.netTotals[i],
  }));

  const chartSeriesLabel = (key: string) => {
    if (key === 'pendapatan') return language === 'en' ? 'Revenue' : 'Pendapatan';
    if (key === 'beban') return language === 'en' ? 'Expense' : 'Beban';
    return language === 'en' ? 'Net Profit' : 'Laba Bersih';
  };

  const periodLabel = periodMode === 'year'
    ? (language === 'en' ? 'Year to Date' : 'Tahun Berjalan')
    : (language === 'en' ? 'This Month' : 'Bulan Ini');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {language === 'en'
            ? 'All figures are derived from the posted General Ledger.'
            : 'Seluruh angka diturunkan dari General Ledger yang sudah terposting.'}
        </p>
        <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{language === 'en' ? 'This Month' : 'Bulan Ini'}</SelectItem>
            <SelectItem value="year">{language === 'en' ? 'Year to Date' : 'Tahun Berjalan'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* P&L KPIs (period-scoped) */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          {language === 'en' ? `Profit & Loss — ${periodLabel}` : `Laba Rugi — ${periodLabel}`}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title={language === 'en' ? 'Revenue' : 'Pendapatan'}
            value={formatCurrency(pl.totalRevenue)}
            icon={TrendingUp}
            variant="green"
          />
          {hasCogs && (
            <KpiCard
              title="HPP (COGS)"
              value={formatCurrency(cogsAmount)}
              icon={TrendingDown}
              variant="yellow"
            />
          )}
          {hasCogs && (
            <KpiCard
              title={language === 'en' ? 'Gross Profit' : 'Laba Kotor'}
              value={formatCurrency(grossProfit)}
              icon={DollarSign}
              variant="blue"
            />
          )}
          <KpiCard
            title={language === 'en' ? 'Total Expense' : 'Total Beban'}
            value={formatCurrency(pl.totalExpense)}
            icon={TrendingDown}
            variant="red"
          />
          <KpiCard
            title={language === 'en' ? 'Net Profit' : 'Laba Bersih'}
            value={formatCurrency(pl.netProfit)}
            icon={DollarSign}
            variant={pl.netProfit >= 0 ? 'green' : 'red'}
          />
        </div>
      </div>

      {/* Balance Sheet + Cash KPIs (as-of today) */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          {language === 'en' ? `Balance Sheet — As of ${today}` : `Neraca — Per ${today}`}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title={language === 'en' ? 'Total Assets' : 'Total Aset'}
            value={formatCurrency(bs.totalAsset)}
            icon={Scale}
            variant="blue"
          />
          <KpiCard
            title={language === 'en' ? 'Total Liabilities' : 'Total Liabilitas'}
            value={formatCurrency(bs.totalLiability)}
            icon={Scale}
            variant="yellow"
          />
          <KpiCard
            title={language === 'en' ? 'Equity' : 'Ekuitas'}
            value={formatCurrency(bs.totalEquity)}
            icon={Scale}
            variant="purple"
          />
          <KpiCard
            title={language === 'en' ? 'Cash & Bank Balance' : 'Saldo Kas & Bank'}
            value={formatCurrency(cashBalance)}
            icon={Wallet}
            variant="green"
          />
        </div>
      </div>

      {/* 12-Month P&L Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {language === 'en' ? `Profit & Loss — 12 Months (${currentYear})` : `Laba Rugi 12 Bulan (${currentYear})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={(v) => formatCurrency(v, true)} className="text-xs fill-muted-foreground" />
                <Tooltip
                  formatter={(value: number, name: string) => [formatFullCurrency(value), chartSeriesLabel(name)]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend formatter={(value) => chartSeriesLabel(value)} />
                <Bar dataKey="pendapatan" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="beban" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="laba" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ratio Analysis */}
      {(grossMarginPct !== null || netMarginPct !== null) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            {language === 'en' ? 'Ratio Analysis' : 'Analisa Rasio'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grossMarginPct !== null && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Gross Margin' : 'Margin Kotor'}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{grossMarginPct.toFixed(1)}%</p>
                </CardContent>
              </Card>
            )}
            {netMarginPct !== null && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Net Margin' : 'Margin Bersih'}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{netMarginPct.toFixed(1)}%</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
