import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel, ExportColumn, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import type { Tables } from '@/integrations/supabase/types';

type Account = Tables<'chart_of_accounts'>;

interface GLRow extends Tables<'general_ledger'> {
  account_code: string;
  account_name: string;
  running_balance: number;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const sourceLink = (sourceType: string | null, sourceId: string | null) => {
  if (!sourceType || !sourceId) return null;
  if (sourceType === 'AR_INVOICE' || sourceType === 'AR_RECEIPT') return `/ar/${sourceType === 'AR_INVOICE' ? sourceId : ''}`;
  if (sourceType === 'AP_INVOICE') return `/ap/${sourceId}`;
  return null;
};

export default function GeneralLedgerPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rawRows, setRawRows] = useState<Tables<'general_ledger'>[]>([]);
  const [accountFilter, setAccountFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [{ data: accData, error: accErr }, { data: glData, error: glErr }] = await Promise.all([
        supabase.from('chart_of_accounts').select('*').order('code'),
        supabase.from('general_ledger').select('*').order('posting_date').order('created_at'),
      ]);
      if (accErr) throw accErr;
      if (glErr) throw glErr;
      setAccounts(accData || []);
      setRawRows(glData || []);
    } catch (error: any) {
      console.error(error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);

  const rows: GLRow[] = useMemo(() => {
    const byAccountRunning: Record<string, number> = {};
    return rawRows
      .filter(r => accountFilter === 'all' || r.account_id === accountFilter)
      .filter(r => !dateFrom || r.posting_date >= dateFrom)
      .filter(r => !dateTo || r.posting_date <= dateTo)
      .map((r) => {
        const acc = accountMap[r.account_id];
        const normal = acc?.normal_balance;
        const delta = normal === 'CREDIT' ? (r.credit - r.debit) : (r.debit - r.credit);
        byAccountRunning[r.account_id] = (byAccountRunning[r.account_id] || 0) + delta;
        return {
          ...r,
          account_code: acc?.code || '-',
          account_name: acc?.name || '-',
          running_balance: byAccountRunning[r.account_id],
        };
      });
  }, [rawRows, accountMap, accountFilter, dateFrom, dateTo]);

  const getExportColumns = (): ExportColumn[] => [
    { key: 'posting_date', header: language === 'en' ? 'Date' : 'Tanggal', format: formatDateForExport },
    { key: 'account_code', header: language === 'en' ? 'Account' : 'Akun' },
    { key: 'account_name', header: language === 'en' ? 'Account Name' : 'Nama Akun' },
    { key: 'source_type', header: language === 'en' ? 'Source' : 'Sumber' },
    { key: 'debit', header: 'Debit', format: formatCurrencyForExport },
    { key: 'credit', header: 'Credit', format: formatCurrencyForExport },
    { key: 'running_balance', header: language === 'en' ? 'Balance' : 'Saldo', format: formatCurrencyForExport },
  ];

  const handleExport = () => {
    exportToExcel(rows, getExportColumns(), `General_Ledger_${new Date().toISOString().split('T')[0]}`);
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{language === 'en' ? 'General Ledger' : 'Buku Besar'}</h1>
          <p className="text-muted-foreground mt-1">{language === 'en' ? 'Posted journal lines per account' : 'Baris jurnal terposting per akun'}</p>
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
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Account' : 'Akun'}</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'en' ? 'All Accounts' : 'Semua Akun'}</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'From' : 'Dari'}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'To' : 'Sampai'}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Account' : 'Akun'}</TableHead>
                <TableHead>{language === 'en' ? 'Source' : 'Sumber'}</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Balance' : 'Saldo'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No data found' : 'Data tidak ditemukan'}</TableCell></TableRow>
              ) : (
                rows.map((row) => {
                  const link = sourceLink(row.source_type, row.source_id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{new Date(row.posting_date).toLocaleDateString('id-ID')}</TableCell>
                      <TableCell>{row.account_code} - {row.account_name}</TableCell>
                      <TableCell>
                        {link ? <Link to={link} className="text-primary hover:underline">{row.source_type}</Link> : (row.source_type || '-')}
                      </TableCell>
                      <TableCell className="text-right">{row.debit > 0 ? formatCurrency(row.debit) : ''}</TableCell>
                      <TableCell className="text-right">{row.credit > 0 ? formatCurrency(row.credit) : ''}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.running_balance)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
