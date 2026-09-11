import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel, ExportColumn, formatCurrencyForExport } from '@/lib/exportUtils';
import type { Tables } from '@/integrations/supabase/types';

type Account = Tables<'chart_of_accounts'>;

interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function TrialBalancePage() {
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

  const rows: TrialBalanceRow[] = useMemo(() => {
    const totals: Record<string, { debit: number; credit: number }> = {};
    glRows
      .filter(r => r.posting_date <= asOfDate)
      .forEach(r => {
        if (!totals[r.account_id]) totals[r.account_id] = { debit: 0, credit: 0 };
        totals[r.account_id].debit += r.debit;
        totals[r.account_id].credit += r.credit;
      });

    return accounts
      .map(a => {
        const t = totals[a.id] || { debit: 0, credit: 0 };
        // Present each account's net balance on its normal-balance side, like a classic trial balance.
        const net = t.debit - t.credit;
        const debit = a.normal_balance === 'DEBIT' ? Math.max(net, 0) : Math.max(-net, 0);
        const credit = a.normal_balance === 'CREDIT' ? Math.max(-net, 0) : Math.max(net, 0);
        return { account_id: a.id, code: a.code, name: a.name, account_type: a.account_type, debit, credit };
      })
      .filter(r => r.debit !== 0 || r.credit !== 0);
  }, [accounts, glRows, asOfDate]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 1;

  const getExportColumns = (): ExportColumn[] => [
    { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
    { key: 'name', header: language === 'en' ? 'Account' : 'Akun' },
    { key: 'debit', header: 'Debit', format: formatCurrencyForExport },
    { key: 'credit', header: 'Credit', format: formatCurrencyForExport },
  ];

  const handleExport = () => {
    exportToExcel(rows, getExportColumns(), `Trial_Balance_${asOfDate}`);
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{language === 'en' ? 'Trial Balance' : 'Neraca Saldo'}</h1>
          <p className="text-muted-foreground mt-1">{language === 'en' ? 'Account balances as of a given date' : 'Saldo akun per tanggal tertentu'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Download className="w-4 h-4 mr-2" />{language === 'en' ? 'Export' : 'Ekspor'}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-center gap-4">
          <Label>{language === 'en' ? 'As of Date' : 'Per Tanggal'}</Label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="max-w-xs" />
          <Badge variant={balanced ? 'default' : 'destructive'} className="ml-auto">
            {balanced ? (language === 'en' ? 'Balanced' : 'Balance') : (language === 'en' ? 'NOT balanced' : 'TIDAK balance')}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Code' : 'Kode'}</TableHead>
                <TableHead>{language === 'en' ? 'Account' : 'Akun'}</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No data found' : 'Data tidak ditemukan'}</TableCell></TableRow>
              ) : (
                <>
                  {rows.map((row) => (
                    <TableRow key={row.account_id}>
                      <TableCell className="font-mono">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{row.debit > 0 ? formatCurrency(row.debit) : ''}</TableCell>
                      <TableCell className="text-right">{row.credit > 0 ? formatCurrency(row.credit) : ''}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>{language === 'en' ? 'Total' : 'Total'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalDebit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalCredit)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
