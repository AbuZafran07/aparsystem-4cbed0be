import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Download, Printer } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';
import {
  computePL, computeBS, computeMonthlyPL, computeMonthlyBS,
  unionRows, computeCashSummary, computeCashDetail, monthRange,
} from '@/lib/financialStatementUtils';
import { ReportSectionTable } from '@/components/reports/ReportSectionTable';
import {
  generateFinancialReportHTML, printFinancialReport, downloadFinancialReportPDF,
  type FinancialReportData, type ReportTableSection,
} from '@/lib/financialReportPrintUtils';

type Account = Tables<'chart_of_accounts'>;
type BankAccount = Tables<'bank_accounts'>;
type JournalLine = Tables<'journal_entry_lines'>;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

type PLVariant = 'standard' | 'monthly12' | 'compare2' | 'compare4' | 'ytd';
type BSVariant = 'standard' | 'monthly12' | 'compare2' | 'compare4';

const todayStr = () => new Date().toISOString().split('T')[0];
const addMonths = (dateStr: string, delta: number) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().split('T')[0];
};
const toYearMonth = (dateStr: string) => dateStr.slice(0, 7);
const yearMonthToRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return monthRange(y, (m || 1) - 1);
};

// Compact single-row summary (Net Profit / balance check) spanning N columns,
// used by the non-Standard variants alongside ReportSectionTable.
function SummaryRow({
  label, columnHeaders, values, showDiffColumn,
}: { label: string; columnHeaders: string[]; values: number[]; showDiffColumn?: boolean }) {
  const diff = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-6 justify-between">
          <span className="font-bold text-base">{label}</span>
          <div className="flex flex-wrap gap-6">
            {columnHeaders.map((h, i) => (
              <div key={i} className="text-right">
                <div className="text-xs text-muted-foreground whitespace-nowrap">{h}</div>
                <div className={cn('font-bold', values[i] >= 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(values[i] || 0)}</div>
              </div>
            ))}
            {showDiffColumn && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Selisih</div>
                <div className="font-bold">{formatCurrency(diff)}</div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancialStatementsPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [glRows, setGlRows] = useState<Tables<'general_ledger'>[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [journalLines, setJournalLines] = useState<JournalLine[]>([]);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [asOfDate, setAsOfDate] = useState(todayStr());

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: accData, error: accErr },
        { data: glData, error: glErr },
        { data: bankData },
        { data: jlData },
        { data: profileData },
      ] = await Promise.all([
        supabase.from('chart_of_accounts').select('*').order('code'),
        supabase.from('general_ledger').select('*'),
        supabase.from('bank_accounts').select('*'),
        supabase.from('journal_entry_lines').select('id, description'),
        supabase.from('company_profile').select('*').limit(1).maybeSingle(),
      ]);
      if (accErr) throw accErr;
      if (glErr) throw glErr;
      setAccounts(accData || []);
      setGlRows(glData || []);
      setBankAccounts(bankData || []);
      setJournalLines((jlData as any) || []);
      setCompanyProfile(profileData);
    } catch (error: any) {
      console.error(error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  // ---- Existing "Standar" calculation — UNCHANGED from before this feature ----
  const balances = useMemo(() => {
    const totals: Record<string, number> = {};
    glRows
      .filter(r => r.posting_date <= asOfDate)
      .forEach(r => {
        const acc = accounts.find(a => a.id === r.account_id);
        if (!acc) return;
        const delta = acc.normal_balance === 'CREDIT' ? (r.credit - r.debit) : (r.debit - r.credit);
        totals[acc.id] = (totals[acc.id] || 0) + delta;
      });

    const byType = (type: Account['account_type']) =>
      accounts
        .filter(a => a.account_type === type)
        .map(a => ({ account: a, balance: totals[a.id] || 0 }))
        .filter(x => x.balance !== 0);

    return {
      revenue: byType('REVENUE'),
      expense: byType('EXPENSE'),
      asset: byType('ASSET'),
      liability: byType('LIABILITY'),
      equity: byType('EQUITY'),
    };
  }, [accounts, glRows, asOfDate]);

  const totalRevenue = balances.revenue.reduce((s, x) => s + x.balance, 0);
  const totalExpense = balances.expense.reduce((s, x) => s + x.balance, 0);
  const netProfit = totalRevenue - totalExpense;

  const totalAsset = balances.asset.reduce((s, x) => s + x.balance, 0);
  const totalLiability = balances.liability.reduce((s, x) => s + x.balance, 0);
  const totalEquityBase = balances.equity.reduce((s, x) => s + x.balance, 0);
  const totalEquity = totalEquityBase + netProfit;
  // ---- end unchanged block ----

  // ---- Variant selectors ----
  const [plVariant, setPlVariant] = useState<PLVariant>('standard');
  const [bsVariant, setBsVariant] = useState<BSVariant>('standard');

  const [plYear, setPlYear] = useState(new Date().getFullYear());
  const [bsYear, setBsYear] = useState(new Date().getFullYear());

  const [plCompare2, setPlCompare2] = useState<string[]>(() => [toYearMonth(addMonths(todayStr(), -1)), toYearMonth(todayStr())]);
  const [plCompare4, setPlCompare4] = useState<string[]>(() => [-3, -2, -1, 0].map(n => toYearMonth(addMonths(todayStr(), n))));

  const [bsCompare2, setBsCompare2] = useState<string[]>(() => [addMonths(todayStr(), -1), todayStr()]);
  const [bsCompare4, setBsCompare4] = useState<string[]>(() => [-3, -2, -1, 0].map(n => addMonths(todayStr(), n)));

  const [ytdYear, setYtdYear] = useState(new Date().getFullYear());
  const [ytdToDate, setYtdToDate] = useState(todayStr());

  // ---- Variant computations (parameterized reuse of the same base formula) ----
  const monthlyPL = useMemo(() => computeMonthlyPL(accounts, glRows, plYear, language), [accounts, glRows, plYear, language]);
  const monthlyBS = useMemo(() => computeMonthlyBS(accounts, glRows, bsYear, language), [accounts, glRows, bsYear, language]);

  const plCompare2Results = useMemo(
    () => plCompare2.map(ym => ({ label: ym, ...computePL(accounts, glRows, yearMonthToRange(ym)) })),
    [accounts, glRows, plCompare2]
  );
  const plCompare4Results = useMemo(
    () => plCompare4.map(ym => ({ label: ym, ...computePL(accounts, glRows, yearMonthToRange(ym)) })),
    [accounts, glRows, plCompare4]
  );
  const bsCompare2Results = useMemo(
    () => bsCompare2.map(d => ({ label: d, ...computeBS(accounts, glRows, d) })),
    [accounts, glRows, bsCompare2]
  );
  const bsCompare4Results = useMemo(
    () => bsCompare4.map(d => ({ label: d, ...computeBS(accounts, glRows, d) })),
    [accounts, glRows, bsCompare4]
  );

  const ytdResult = useMemo(
    () => computePL(accounts, glRows, { from: `${ytdYear}-01-01`, to: ytdToDate }),
    [accounts, glRows, ytdYear, ytdToDate]
  );

  // ---- Arus Kas (Cash Flow) ----
  const cashAccountsFromBank = useMemo(() => {
    const seen = new Set<string>();
    return bankAccounts
      .filter(b => b.gl_account_id)
      .map(b => accounts.find(a => a.id === b.gl_account_id))
      .filter((a): a is Account => !!a)
      .filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }, [bankAccounts, accounts]);

  const assetAccounts = useMemo(() => accounts.filter(a => a.account_type === 'ASSET'), [accounts]);
  const [manualCashAccountIds, setManualCashAccountIds] = useState<string[]>([]);
  const usingManualCashSelection = cashAccountsFromBank.length === 0;
  const cashAccounts = usingManualCashSelection
    ? assetAccounts.filter(a => manualCashAccountIds.includes(a.id))
    : cashAccountsFromBank;

  const [cashFrom, setCashFrom] = useState(() => monthRange(new Date().getFullYear(), new Date().getMonth()).from);
  const [cashTo, setCashTo] = useState(todayStr());
  const [cashDetailAccountId, setCashDetailAccountId] = useState<string>('');

  useEffect(() => {
    if ((!cashDetailAccountId || !cashAccounts.some(a => a.id === cashDetailAccountId)) && cashAccounts.length > 0) {
      setCashDetailAccountId(cashAccounts[0].id);
    }
  }, [cashAccounts, cashDetailAccountId]);

  const descriptionByLineId = useMemo(
    () => Object.fromEntries(journalLines.map(l => [l.id, l.description || ''])),
    [journalLines]
  );

  const cashSummaries = useMemo(
    () => cashAccounts.map(a => computeCashSummary(a, glRows, { from: cashFrom, to: cashTo })),
    [cashAccounts, glRows, cashFrom, cashTo]
  );
  const cashGrandTotal = useMemo(() => ({
    openingBalance: cashSummaries.reduce((s, x) => s + x.openingBalance, 0),
    totalIn: cashSummaries.reduce((s, x) => s + x.totalIn, 0),
    totalOut: cashSummaries.reduce((s, x) => s + x.totalOut, 0),
    closingBalance: cashSummaries.reduce((s, x) => s + x.closingBalance, 0),
  }), [cashSummaries]);

  const cashDetailAccount = cashAccounts.find(a => a.id === cashDetailAccountId) || null;
  const cashDetailRows = useMemo(
    () => (cashDetailAccount ? computeCashDetail(cashDetailAccount, glRows, { from: cashFrom, to: cashTo }, descriptionByLineId) : []),
    [cashDetailAccount, glRows, cashFrom, cashTo, descriptionByLineId]
  );

  const toggleManualCashAccount = (id: string) => {
    setManualCashAccountIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // ---- Print / PDF (optional, reuses downloadPdfFromHtml + sanitizePrintableHtml) ----
  const companyName = companyProfile?.company_name || 'PT. Kemika Karya Pratama';
  const t = (en: string, id: string) => (language === 'en' ? en : id);

  const emitReport = (mode: 'print' | 'download', data: FinancialReportData) => {
    const html = generateFinancialReportHTML(data);
    if (mode === 'print') {
      printFinancialReport(html);
    } else {
      downloadFinancialReportPDF(html, `${data.reportTitle}_${data.periodLabel}`);
    }
  };

  const accCell = (a: Account) => `${a.code} - ${a.name}`;

  const buildPLSections = (): ReportTableSection[] => {
    const accountLabel = t('Account', 'Akun');
    if (plVariant === 'standard') {
      return [
        { title: t('Revenue', 'Pendapatan'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
          rows: balances.revenue.map(x => ({ label: accCell(x.account), values: [x.balance] })),
          totalRow: { label: t('Total Revenue', 'Total Pendapatan'), values: [totalRevenue] } },
        { title: t('Expense', 'Beban'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
          rows: balances.expense.map(x => ({ label: accCell(x.account), values: [x.balance] })),
          totalRow: { label: t('Total Expense', 'Total Beban'), values: [totalExpense] } },
        { title: t('Net Profit', 'Laba Bersih'), columnLabels: ['', t('Amount', 'Jumlah')], rows: [],
          totalRow: { label: t('Net Profit', 'Laba Bersih'), values: [netProfit] } },
      ];
    }
    if (plVariant === 'monthly12') {
      const cols = [...monthlyPL.monthLabels, t('Total', 'Total')];
      return [
        { title: t('Revenue', 'Pendapatan'), columnLabels: [accountLabel, ...cols],
          rows: monthlyPL.revenueRows.map(r => ({ label: accCell(r.account), values: [...r.values, r.total] })),
          totalRow: { label: t('Total Revenue', 'Total Pendapatan'), values: [...monthlyPL.revenueTotals, monthlyPL.grandRevenueTotal] } },
        { title: t('Expense', 'Beban'), columnLabels: [accountLabel, ...cols],
          rows: monthlyPL.expenseRows.map(r => ({ label: accCell(r.account), values: [...r.values, r.total] })),
          totalRow: { label: t('Total Expense', 'Total Beban'), values: [...monthlyPL.expenseTotals, monthlyPL.grandExpenseTotal] } },
        { title: t('Net Profit', 'Laba Bersih'), columnLabels: ['', ...cols], rows: [],
          totalRow: { label: t('Net Profit', 'Laba Bersih'), values: [...monthlyPL.netTotals, monthlyPL.grandNetTotal] } },
      ];
    }
    if (plVariant === 'compare2' || plVariant === 'compare4') {
      const results = plVariant === 'compare2' ? plCompare2Results : plCompare4Results;
      const cols = results.map(r => r.label);
      const revRows = unionRows(results.map(r => r.revenue));
      const expRows = unionRows(results.map(r => r.expense));
      return [
        { title: t('Revenue', 'Pendapatan'), columnLabels: [accountLabel, ...cols],
          rows: revRows.map(r => ({ label: accCell(r.account), values: r.values })),
          totalRow: { label: t('Total Revenue', 'Total Pendapatan'), values: results.map(r => r.totalRevenue) } },
        { title: t('Expense', 'Beban'), columnLabels: [accountLabel, ...cols],
          rows: expRows.map(r => ({ label: accCell(r.account), values: r.values })),
          totalRow: { label: t('Total Expense', 'Total Beban'), values: results.map(r => r.totalExpense) } },
        { title: t('Net Profit', 'Laba Bersih'), columnLabels: ['', ...cols], rows: [],
          totalRow: { label: t('Net Profit', 'Laba Bersih'), values: results.map(r => r.netProfit) } },
      ];
    }
    // ytd
    return [
      { title: t('Revenue', 'Pendapatan'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
        rows: ytdResult.revenue.map(x => ({ label: accCell(x.account), values: [x.balance] })),
        totalRow: { label: t('Total Revenue', 'Total Pendapatan'), values: [ytdResult.totalRevenue] } },
      { title: t('Expense', 'Beban'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
        rows: ytdResult.expense.map(x => ({ label: accCell(x.account), values: [x.balance] })),
        totalRow: { label: t('Total Expense', 'Total Beban'), values: [ytdResult.totalExpense] } },
      { title: t('Net Profit', 'Laba Bersih'), columnLabels: ['', t('Amount', 'Jumlah')], rows: [],
        totalRow: { label: t('Net Profit', 'Laba Bersih'), values: [ytdResult.netProfit] } },
    ];
  };

  const getPlPeriodLabel = () => {
    if (plVariant === 'standard') return `${t('As of', 'Per')} ${asOfDate}`;
    if (plVariant === 'monthly12') return `${t('Year', 'Tahun')} ${plYear}`;
    if (plVariant === 'ytd') return `${ytdYear}-01-01 s/d ${ytdToDate}`;
    return (plVariant === 'compare2' ? plCompare2Results : plCompare4Results).map(r => r.label).join(' vs ');
  };

  const buildBSSections = (): ReportTableSection[] => {
    const accountLabel = t('Account', 'Akun');
    if (bsVariant === 'standard') {
      return [
        { title: t('Assets', 'Aset'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
          rows: balances.asset.map(x => ({ label: accCell(x.account), values: [x.balance] })),
          totalRow: { label: t('Total Assets', 'Total Aset'), values: [totalAsset] } },
        { title: t('Liabilities', 'Liabilitas'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
          rows: balances.liability.map(x => ({ label: accCell(x.account), values: [x.balance] })),
          totalRow: { label: t('Total Liabilities', 'Total Liabilitas'), values: [totalLiability] } },
        { title: t('Equity', 'Ekuitas'), columnLabels: [accountLabel, t('Amount', 'Jumlah')],
          rows: [...balances.equity.map(x => ({ label: accCell(x.account), values: [x.balance] })),
                 { label: t('Current period net profit', 'Laba periode berjalan'), values: [netProfit] }],
          totalRow: { label: t('Total Equity', 'Total Ekuitas'), values: [totalEquity] } },
      ];
    }
    if (bsVariant === 'monthly12') {
      const cols = monthlyBS.monthLabels;
      return [
        { title: t('Assets', 'Aset'), columnLabels: [accountLabel, ...cols],
          rows: monthlyBS.assetRows.map(r => ({ label: accCell(r.account), values: r.values })),
          totalRow: { label: t('Total Assets', 'Total Aset'), values: monthlyBS.totalAssetByMonth } },
        { title: t('Liabilities', 'Liabilitas'), columnLabels: [accountLabel, ...cols],
          rows: monthlyBS.liabilityRows.map(r => ({ label: accCell(r.account), values: r.values })),
          totalRow: { label: t('Total Liabilities', 'Total Liabilitas'), values: monthlyBS.totalLiabilityByMonth } },
        { title: t('Equity', 'Ekuitas'), columnLabels: [accountLabel, ...cols],
          rows: monthlyBS.equityRows.map(r => ({ label: accCell(r.account), values: r.values })),
          totalRow: { label: t('Total Equity', 'Total Ekuitas'), values: monthlyBS.totalEquityByMonth } },
      ];
    }
    // compare2 / compare4
    const results = bsVariant === 'compare2' ? bsCompare2Results : bsCompare4Results;
    const cols = results.map(r => r.label);
    const assetRows = unionRows(results.map(r => r.asset));
    const liabRows = unionRows(results.map(r => r.liability));
    const equityRows = unionRows(results.map(r => r.equity));
    return [
      { title: t('Assets', 'Aset'), columnLabels: [accountLabel, ...cols],
        rows: assetRows.map(r => ({ label: accCell(r.account), values: r.values })),
        totalRow: { label: t('Total Assets', 'Total Aset'), values: results.map(r => r.totalAsset) } },
      { title: t('Liabilities', 'Liabilitas'), columnLabels: [accountLabel, ...cols],
        rows: liabRows.map(r => ({ label: accCell(r.account), values: r.values })),
        totalRow: { label: t('Total Liabilities', 'Total Liabilitas'), values: results.map(r => r.totalLiability) } },
      { title: t('Equity', 'Ekuitas'), columnLabels: [accountLabel, ...cols],
        rows: equityRows.map(r => ({ label: accCell(r.account), values: r.values })),
        totalRow: { label: t('Total Equity', 'Total Ekuitas'), values: results.map(r => r.totalEquity) } },
    ];
  };

  const getBsPeriodLabel = () => {
    if (bsVariant === 'standard') return `${t('As of', 'Per')} ${asOfDate}`;
    if (bsVariant === 'monthly12') return `${t('Year', 'Tahun')} ${bsYear}`;
    return (bsVariant === 'compare2' ? bsCompare2Results : bsCompare4Results).map(r => r.label).join(' vs ');
  };

  const buildCashSections = (): ReportTableSection[] => {
    const accountLabel = t('Account', 'Akun');
    const summarySection: ReportTableSection = {
      title: t('Summary', 'Rangkuman'),
      columnLabels: [accountLabel, t('Opening', 'Saldo Awal'), t('Cash In', 'Masuk'), t('Cash Out', 'Keluar'), t('Closing', 'Saldo Akhir')],
      rows: cashSummaries.map(s => ({
        label: accCell(s.account),
        values: [s.openingBalance, s.totalIn, s.totalOut, s.closingBalance],
      })),
      totalRow: { label: t('Grand Total', 'Total Keseluruhan'), values: [cashGrandTotal.openingBalance, cashGrandTotal.totalIn, cashGrandTotal.totalOut, cashGrandTotal.closingBalance] },
    };
    const detailSection: ReportTableSection | null = cashDetailAccount ? {
      title: `${t('Detail', 'Rincian')} - ${accCell(cashDetailAccount)}`,
      columnLabels: [t('Date / Description', 'Tanggal / Keterangan'), t('In', 'Masuk'), t('Out', 'Keluar'), t('Balance', 'Saldo')],
      rows: cashDetailRows.map(r => ({ label: `${r.date} - ${r.description}`, values: [r.debit, r.credit, r.balance] })),
    } : null;
    return detailSection ? [summarySection, detailSection] : [summarySection];
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const plVariantOptions: { value: PLVariant; label: string }[] = [
    { value: 'standard', label: t('Standard', 'Standar') },
    { value: 'monthly12', label: `12 ${t('Months', 'Bulan')}` },
    { value: 'compare2', label: t('2-Column Comparison', 'Perbandingan 2 Kolom') },
    { value: 'compare4', label: t('4-Column Comparison', 'Perbandingan 4 Kolom') },
    { value: 'ytd', label: 'Years to Date' },
  ];
  const bsVariantOptions: { value: BSVariant; label: string }[] = [
    { value: 'standard', label: t('Standard', 'Standar') },
    { value: 'monthly12', label: `12 ${t('Months', 'Bulan')}` },
    { value: 'compare2', label: t('2-Column Comparison', 'Perbandingan 2 Kolom') },
    { value: 'compare4', label: t('4-Column Comparison', 'Perbandingan 4 Kolom') },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('Financial Statements', 'Laporan Keuangan')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('P&L, Balance Sheet and Cash Flow variants, derived from posted General Ledger', 'Varian Laba Rugi, Neraca, dan Arus Kas, diturunkan dari General Ledger terposting')}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
      </div>

      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl">{t('Profit & Loss', 'Laba Rugi')}</TabsTrigger>
          <TabsTrigger value="bs">{t('Balance Sheet', 'Neraca')}</TabsTrigger>
          <TabsTrigger value="cashflow">{t('Cash Flow', 'Arus Kas')}</TabsTrigger>
        </TabsList>

        {/* ============ LABA RUGI ============ */}
        <TabsContent value="pl" className="space-y-4">
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>{t('Variant', 'Varian')}</Label>
                <Select value={plVariant} onValueChange={(v) => setPlVariant(v as PLVariant)}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plVariantOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {plVariant === 'standard' && (
                <div className="space-y-2">
                  <Label>{t('As of Date', 'Per Tanggal')}</Label>
                  <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="max-w-xs" />
                </div>
              )}
              {plVariant === 'monthly12' && (
                <div className="space-y-2">
                  <Label>{t('Year', 'Tahun')}</Label>
                  <Input type="number" value={plYear} onChange={(e) => setPlYear(Number(e.target.value) || plYear)} className="max-w-[120px]" />
                </div>
              )}
              {plVariant === 'compare2' && plCompare2.map((ym, i) => (
                <div className="space-y-2" key={i}>
                  <Label>{t(`Period ${i + 1}`, `Periode ${i + 1}`)}</Label>
                  <Input type="month" value={ym} onChange={(e) => setPlCompare2(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} className="max-w-[160px]" />
                </div>
              ))}
              {plVariant === 'compare4' && plCompare4.map((ym, i) => (
                <div className="space-y-2" key={i}>
                  <Label>{t(`Period ${i + 1}`, `Periode ${i + 1}`)}</Label>
                  <Input type="month" value={ym} onChange={(e) => setPlCompare4(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} className="max-w-[160px]" />
                </div>
              ))}
              {plVariant === 'ytd' && (
                <>
                  <div className="space-y-2">
                    <Label>{t('Fiscal Year', 'Tahun Buku')}</Label>
                    <Input type="number" value={ytdYear} onChange={(e) => setYtdYear(Number(e.target.value) || ytdYear)} className="max-w-[120px]" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('Through', 'Sampai')}</Label>
                    <Input type="date" value={ytdToDate} onChange={(e) => setYtdToDate(e.target.value)} className="max-w-xs" />
                  </div>
                </>
              )}

              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => emitReport('print', { reportTitle: t('Profit & Loss', 'Laba Rugi'), periodLabel: getPlPeriodLabel(), companyName, sections: buildPLSections() })}>
                  <Printer className="w-4 h-4 mr-2" />{t('Print', 'Cetak')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => emitReport('download', { reportTitle: t('Profit & Loss', 'Laba Rugi'), periodLabel: getPlPeriodLabel(), companyName, sections: buildPLSections() })}>
                  <Download className="w-4 h-4 mr-2" />PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {plVariant === 'standard' && (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">{t('Revenue', 'Pendapatan')}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {balances.revenue.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{accCell(x.account)}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{t('Total Revenue', 'Total Pendapatan')}</span>
                    <span>{formatCurrency(totalRevenue)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">{t('Expense', 'Beban')}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {balances.expense.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{accCell(x.account)}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{t('Total Expense', 'Total Beban')}</span>
                    <span>{formatCurrency(totalExpense)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex justify-between text-lg font-bold">
                  <span>{t('Net Profit', 'Laba Bersih')}</span>
                  <span className={netProfit >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(netProfit)}</span>
                </CardContent>
              </Card>
            </>
          )}

          {plVariant === 'monthly12' && (
            <div className="space-y-4">
              <ReportSectionTable
                title={t('Revenue', 'Pendapatan')} accountLabel={t('Account', 'Akun')}
                columnHeaders={[...monthlyPL.monthLabels, t('Total', 'Total')]}
                rows={monthlyPL.revenueRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: [...r.values, r.total] }))}
                totalLabel={t('Total Revenue', 'Total Pendapatan')}
                totalValues={[...monthlyPL.revenueTotals, monthlyPL.grandRevenueTotal]}
                formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')}
              />
              <ReportSectionTable
                title={t('Expense', 'Beban')} accountLabel={t('Account', 'Akun')}
                columnHeaders={[...monthlyPL.monthLabels, t('Total', 'Total')]}
                rows={monthlyPL.expenseRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: [...r.values, r.total] }))}
                totalLabel={t('Total Expense', 'Total Beban')}
                totalValues={[...monthlyPL.expenseTotals, monthlyPL.grandExpenseTotal]}
                formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')}
              />
              <SummaryRow label={t('Net Profit', 'Laba Bersih')} columnHeaders={[...monthlyPL.monthLabels, t('Total', 'Total')]} values={[...monthlyPL.netTotals, monthlyPL.grandNetTotal]} />
            </div>
          )}

          {(plVariant === 'compare2' || plVariant === 'compare4') && (() => {
            const results = plVariant === 'compare2' ? plCompare2Results : plCompare4Results;
            const cols = results.map(r => r.label);
            const revRows = unionRows(results.map(r => r.revenue));
            const expRows = unionRows(results.map(r => r.expense));
            const showDiff = plVariant === 'compare2';
            return (
              <div className="space-y-4">
                <ReportSectionTable
                  title={t('Revenue', 'Pendapatan')} accountLabel={t('Account', 'Akun')} columnHeaders={cols}
                  rows={revRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                  totalLabel={t('Total Revenue', 'Total Pendapatan')} totalValues={results.map(r => r.totalRevenue)}
                  formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')} showDiffColumn={showDiff}
                />
                <ReportSectionTable
                  title={t('Expense', 'Beban')} accountLabel={t('Account', 'Akun')} columnHeaders={cols}
                  rows={expRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                  totalLabel={t('Total Expense', 'Total Beban')} totalValues={results.map(r => r.totalExpense)}
                  formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')} showDiffColumn={showDiff}
                />
                <SummaryRow label={t('Net Profit', 'Laba Bersih')} columnHeaders={cols} values={results.map(r => r.netProfit)} showDiffColumn={showDiff} />
              </div>
            );
          })()}

          {plVariant === 'ytd' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">{t('Revenue', 'Pendapatan')}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {ytdResult.revenue.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{accCell(x.account)}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{t('Total Revenue', 'Total Pendapatan')}</span>
                    <span>{formatCurrency(ytdResult.totalRevenue)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">{t('Expense', 'Beban')}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {ytdResult.expense.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{accCell(x.account)}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{t('Total Expense', 'Total Beban')}</span>
                    <span>{formatCurrency(ytdResult.totalExpense)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex justify-between text-lg font-bold">
                  <span>{t('Net Profit', 'Laba Bersih')}</span>
                  <span className={ytdResult.netProfit >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(ytdResult.netProfit)}</span>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ============ NERACA ============ */}
        <TabsContent value="bs" className="space-y-4">
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>{t('Variant', 'Varian')}</Label>
                <Select value={bsVariant} onValueChange={(v) => setBsVariant(v as BSVariant)}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {bsVariantOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {bsVariant === 'standard' && (
                <div className="space-y-2">
                  <Label>{t('As of Date', 'Per Tanggal')}</Label>
                  <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="max-w-xs" />
                </div>
              )}
              {bsVariant === 'monthly12' && (
                <div className="space-y-2">
                  <Label>{t('Year', 'Tahun')}</Label>
                  <Input type="number" value={bsYear} onChange={(e) => setBsYear(Number(e.target.value) || bsYear)} className="max-w-[120px]" />
                </div>
              )}
              {bsVariant === 'compare2' && bsCompare2.map((d, i) => (
                <div className="space-y-2" key={i}>
                  <Label>{t(`Period ${i + 1}`, `Periode ${i + 1}`)}</Label>
                  <Input type="date" value={d} onChange={(e) => setBsCompare2(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} className="max-w-xs" />
                </div>
              ))}
              {bsVariant === 'compare4' && bsCompare4.map((d, i) => (
                <div className="space-y-2" key={i}>
                  <Label>{t(`Period ${i + 1}`, `Periode ${i + 1}`)}</Label>
                  <Input type="date" value={d} onChange={(e) => setBsCompare4(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} className="max-w-xs" />
                </div>
              ))}

              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => emitReport('print', { reportTitle: t('Balance Sheet', 'Neraca'), periodLabel: getBsPeriodLabel(), companyName, sections: buildBSSections() })}>
                  <Printer className="w-4 h-4 mr-2" />{t('Print', 'Cetak')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => emitReport('download', { reportTitle: t('Balance Sheet', 'Neraca'), periodLabel: getBsPeriodLabel(), companyName, sections: buildBSSections() })}>
                  <Download className="w-4 h-4 mr-2" />PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {bsVariant === 'standard' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">{t('Assets', 'Aset')}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {balances.asset.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{accCell(x.account)}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{t('Total Assets', 'Total Aset')}</span>
                    <span>{formatCurrency(totalAsset)}</span>
                  </div>
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">{t('Liabilities', 'Liabilitas')}</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {balances.liability.map(x => (
                      <div key={x.account.id} className="flex justify-between text-sm">
                        <span>{accCell(x.account)}</span>
                        <span>{formatCurrency(x.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium pt-2 border-t">
                      <span>{t('Total Liabilities', 'Total Liabilitas')}</span>
                      <span>{formatCurrency(totalLiability)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">{t('Equity', 'Ekuitas')}</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {balances.equity.map(x => (
                      <div key={x.account.id} className="flex justify-between text-sm">
                        <span>{accCell(x.account)}</span>
                        <span>{formatCurrency(x.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm">
                      <span>{t('Current period net profit', 'Laba periode berjalan')}</span>
                      <span>{formatCurrency(netProfit)}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-2 border-t">
                      <span>{t('Total Equity', 'Total Ekuitas')}</span>
                      <span>{formatCurrency(totalEquity)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 flex justify-between font-bold">
                    <span>{t('Liabilities + Equity', 'Liabilitas + Ekuitas')}</span>
                    <span>{formatCurrency(totalLiability + totalEquity)}</span>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {bsVariant === 'monthly12' && (
            <div className="space-y-4">
              <ReportSectionTable
                title={t('Assets', 'Aset')} accountLabel={t('Account', 'Akun')} columnHeaders={monthlyBS.monthLabels}
                rows={monthlyBS.assetRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                totalLabel={t('Total Assets', 'Total Aset')} totalValues={monthlyBS.totalAssetByMonth}
                formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')}
              />
              <ReportSectionTable
                title={t('Liabilities', 'Liabilitas')} accountLabel={t('Account', 'Akun')} columnHeaders={monthlyBS.monthLabels}
                rows={monthlyBS.liabilityRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                totalLabel={t('Total Liabilities', 'Total Liabilitas')} totalValues={monthlyBS.totalLiabilityByMonth}
                formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')}
              />
              <ReportSectionTable
                title={t('Equity', 'Ekuitas')} accountLabel={t('Account', 'Akun')} columnHeaders={monthlyBS.monthLabels}
                rows={monthlyBS.equityRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                totalLabel={t('Total Equity', 'Total Ekuitas')} totalValues={monthlyBS.totalEquityByMonth}
                formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')}
              />
            </div>
          )}

          {(bsVariant === 'compare2' || bsVariant === 'compare4') && (() => {
            const results = bsVariant === 'compare2' ? bsCompare2Results : bsCompare4Results;
            const cols = results.map(r => r.label);
            const assetRows = unionRows(results.map(r => r.asset));
            const liabRows = unionRows(results.map(r => r.liability));
            const equityRows = unionRows(results.map(r => r.equity));
            const showDiff = bsVariant === 'compare2';
            return (
              <div className="space-y-4">
                <ReportSectionTable
                  title={t('Assets', 'Aset')} accountLabel={t('Account', 'Akun')} columnHeaders={cols}
                  rows={assetRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                  totalLabel={t('Total Assets', 'Total Aset')} totalValues={results.map(r => r.totalAsset)}
                  formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')} showDiffColumn={showDiff}
                />
                <ReportSectionTable
                  title={t('Liabilities', 'Liabilitas')} accountLabel={t('Account', 'Akun')} columnHeaders={cols}
                  rows={liabRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                  totalLabel={t('Total Liabilities', 'Total Liabilitas')} totalValues={results.map(r => r.totalLiability)}
                  formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')} showDiffColumn={showDiff}
                />
                <ReportSectionTable
                  title={t('Equity', 'Ekuitas')} accountLabel={t('Account', 'Akun')} columnHeaders={cols}
                  rows={equityRows.map(r => ({ key: r.account.id, label: accCell(r.account), values: r.values }))}
                  totalLabel={t('Total Equity', 'Total Ekuitas')} totalValues={results.map(r => r.totalEquity)}
                  formatCurrency={formatCurrency} emptyLabel={t('No data', 'Tidak ada data')} showDiffColumn={showDiff}
                />
              </div>
            );
          })()}
        </TabsContent>

        {/* ============ ARUS KAS ============ */}
        <TabsContent value="cashflow" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>{t('From', 'Dari Tanggal')}</Label>
                  <Input type="date" value={cashFrom} onChange={(e) => setCashFrom(e.target.value)} className="max-w-xs" />
                </div>
                <div className="space-y-2">
                  <Label>{t('To', 'Sampai Tanggal')}</Label>
                  <Input type="date" value={cashTo} onChange={(e) => setCashTo(e.target.value)} className="max-w-xs" />
                </div>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => emitReport('print', { reportTitle: t('Cash Flow', 'Arus Kas'), periodLabel: `${cashFrom} s/d ${cashTo}`, companyName, sections: buildCashSections() })}>
                    <Printer className="w-4 h-4 mr-2" />{t('Print', 'Cetak')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => emitReport('download', { reportTitle: t('Cash Flow', 'Arus Kas'), periodLabel: `${cashFrom} s/d ${cashTo}`, companyName, sections: buildCashSections() })}>
                    <Download className="w-4 h-4 mr-2" />PDF
                  </Button>
                </div>
              </div>

              {usingManualCashSelection && (
                <div className="space-y-2">
                  <Label>{t('No bank account is linked to a GL account yet — pick Asset account(s) to treat as Cash/Bank', 'Belum ada rekening bank yang tertaut ke akun GL — pilih akun Aset yang dianggap Kas/Bank')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {assetAccounts.map(a => (
                      <Badge
                        key={a.id}
                        variant={manualCashAccountIds.includes(a.id) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleManualCashAccount(a.id)}
                      >
                        {accCell(a)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <ReportSectionTable
            title={t('Summary per Cash/Bank Account', 'Rangkuman per Akun Kas/Bank')}
            accountLabel={t('Account', 'Akun')}
            columnHeaders={[t('Opening Balance', 'Saldo Awal'), t('Cash In', 'Total Masuk'), t('Cash Out', 'Total Keluar'), t('Closing Balance', 'Saldo Akhir')]}
            rows={cashSummaries.map(s => ({ key: s.account.id, label: accCell(s.account), values: [s.openingBalance, s.totalIn, s.totalOut, s.closingBalance] }))}
            totalLabel={t('Grand Total', 'Total Keseluruhan')}
            totalValues={[cashGrandTotal.openingBalance, cashGrandTotal.totalIn, cashGrandTotal.totalOut, cashGrandTotal.closingBalance]}
            formatCurrency={formatCurrency}
            emptyLabel={t('No Cash/Bank account selected', 'Belum ada akun Kas/Bank yang dipilih')}
          />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">{t('Detail', 'Rincian Transaksi')}</CardTitle>
                {cashAccounts.length > 0 && (
                  <Select value={cashDetailAccountId} onValueChange={setCashDetailAccountId}>
                    <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cashAccounts.map(a => <SelectItem key={a.id} value={a.id}>{accCell(a)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">{t('Date', 'Tanggal')}</th>
                      <th className="text-left p-3">{t('Description', 'Keterangan')}</th>
                      <th className="text-right p-3">{t('In (Debit)', 'Masuk (Debit)')}</th>
                      <th className="text-right p-3">{t('Out (Credit)', 'Keluar (Kredit)')}</th>
                      <th className="text-right p-3">{t('Running Balance', 'Saldo Berjalan')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashDetailRows.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">{t('No transactions in this period', 'Tidak ada transaksi pada periode ini')}</td></tr>
                    ) : cashDetailRows.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 whitespace-nowrap">{r.date}</td>
                        <td className="p-3">{r.description}</td>
                        <td className="p-3 text-right whitespace-nowrap">{r.debit > 0 ? formatCurrency(r.debit) : ''}</td>
                        <td className="p-3 text-right whitespace-nowrap">{r.credit > 0 ? formatCurrency(r.credit) : ''}</td>
                        <td className="p-3 text-right whitespace-nowrap font-medium">{formatCurrency(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
