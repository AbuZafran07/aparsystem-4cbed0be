import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Account = Tables<'chart_of_accounts'>;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function FinancialStatementsPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [glRows, setGlRows] = useState<Tables<'general_ledger'>[]>([]);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [{ data: accData, error: accErr }, { data: glData, error: glErr }] = await Promise.all([
        supabase.from('chart_of_accounts').select('*').order('code'),
        supabase.from('general_ledger').select('*'),
      ]);
      if (accErr) throw accErr;
      if (glErr) throw glErr;
      setAccounts(accData || []);
      setGlRows(glData || []);
    } catch (error: any) {
      console.error(error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{language === 'en' ? 'Financial Statements' : 'Laporan Keuangan'}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Basic P&L and Balance Sheet, derived from posted General Ledger' : 'P&L dan Neraca dasar, diturunkan dari General Ledger terposting'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-center gap-4">
          <Label>{language === 'en' ? 'As of Date' : 'Per Tanggal'}</Label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="max-w-xs" />
        </CardContent>
      </Card>

      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl">{language === 'en' ? 'Profit & Loss' : 'Laba Rugi'}</TabsTrigger>
          <TabsTrigger value="bs">{language === 'en' ? 'Balance Sheet' : 'Neraca'}</TabsTrigger>
        </TabsList>

        <TabsContent value="pl">
          <Card>
            <CardHeader><CardTitle className="text-base">{language === 'en' ? 'Revenue' : 'Pendapatan'}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {balances.revenue.map(x => (
                <div key={x.account.id} className="flex justify-between text-sm">
                  <span>{x.account.code} - {x.account.name}</span>
                  <span>{formatCurrency(x.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>{language === 'en' ? 'Total Revenue' : 'Total Pendapatan'}</span>
                <span>{formatCurrency(totalRevenue)}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">{language === 'en' ? 'Expense' : 'Beban'}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {balances.expense.map(x => (
                <div key={x.account.id} className="flex justify-between text-sm">
                  <span>{x.account.code} - {x.account.name}</span>
                  <span>{formatCurrency(x.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>{language === 'en' ? 'Total Expense' : 'Total Beban'}</span>
                <span>{formatCurrency(totalExpense)}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardContent className="pt-6 flex justify-between text-lg font-bold">
              <span>{language === 'en' ? 'Net Profit' : 'Laba Bersih'}</span>
              <span className={netProfit >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(netProfit)}</span>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{language === 'en' ? 'Assets' : 'Aset'}</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {balances.asset.map(x => (
                  <div key={x.account.id} className="flex justify-between text-sm">
                    <span>{x.account.code} - {x.account.name}</span>
                    <span>{formatCurrency(x.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>{language === 'en' ? 'Total Assets' : 'Total Aset'}</span>
                  <span>{formatCurrency(totalAsset)}</span>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">{language === 'en' ? 'Liabilities' : 'Liabilitas'}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {balances.liability.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{x.account.code} - {x.account.name}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{language === 'en' ? 'Total Liabilities' : 'Total Liabilitas'}</span>
                    <span>{formatCurrency(totalLiability)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">{language === 'en' ? 'Equity' : 'Ekuitas'}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {balances.equity.map(x => (
                    <div key={x.account.id} className="flex justify-between text-sm">
                      <span>{x.account.code} - {x.account.name}</span>
                      <span>{formatCurrency(x.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm">
                    <span>{language === 'en' ? 'Current period net profit' : 'Laba periode berjalan'}</span>
                    <span>{formatCurrency(netProfit)}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>{language === 'en' ? 'Total Equity' : 'Total Ekuitas'}</span>
                    <span>{formatCurrency(totalEquity)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex justify-between font-bold">
                  <span>{language === 'en' ? 'Liabilities + Equity' : 'Liabilitas + Ekuitas'}</span>
                  <span>{formatCurrency(totalLiability + totalEquity)}</span>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
