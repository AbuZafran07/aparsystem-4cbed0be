import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, TrendingUp, TrendingDown, DollarSign, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight, FileText, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF, ExportColumn, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';

interface CashflowEntry {
  id: string;
  date: string;
  type: 'inflow' | 'outflow';
  description: string;
  amount: number;
  reference: string;
  bank_account: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatShortCurrency = (amount: number) => {
  if (amount >= 1000000000) return `Rp ${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `Rp ${(amount / 1000000).toFixed(0)}M`;
  return `Rp ${(amount / 1000).toFixed(0)}K`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('id-ID');
};

export default function CashflowPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'details'>('summary');
  const [entries, setEntries] = useState<CashflowEntry[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().split('T')[0].slice(0, 7) + '-01';
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch AR receipts (cash inflows)
      const { data: receiptsData, error: receiptsError } = await supabase
        .from('ar_receipts')
        .select(`*, bank_accounts (bank_name, account_no)`)
        .gte('receipt_date', dateFrom)
        .lte('receipt_date', dateTo)
        .order('receipt_date', { ascending: false });

      if (receiptsError) throw receiptsError;

      // Fetch AP payments (cash outflows)
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('ap_payments')
        .select(`*, bank_accounts (bank_name, account_no)`)
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Combine and format entries
      const allEntries: CashflowEntry[] = [
        ...(receiptsData || []).map((r: any) => ({
          id: r.id,
          date: r.receipt_date,
          type: 'inflow' as const,
          description: language === 'en' ? 'Customer Receipt' : 'Penerimaan Customer',
          amount: r.total_amount,
          reference: r.reference_no || '-',
          bank_account: r.bank_accounts ? `${r.bank_accounts.bank_name} - ${r.bank_accounts.account_no}` : '-',
        })),
        ...(paymentsData || []).map((p: any) => ({
          id: p.id,
          date: p.payment_date,
          type: 'outflow' as const,
          description: language === 'en' ? 'Vendor Payment' : 'Pembayaran Vendor',
          amount: p.total_amount,
          reference: p.reference_no || '-',
          bank_account: p.bank_accounts ? `${p.bank_accounts.bank_name} - ${p.bank_accounts.account_no}` : '-',
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setEntries(allEntries);

      // Calculate monthly summary
      const monthlyMap = new Map<string, { inflow: number; outflow: number }>();
      
      allEntries.forEach(entry => {
        const month = entry.date.slice(0, 7);
        const current = monthlyMap.get(month) || { inflow: 0, outflow: 0 };
        if (entry.type === 'inflow') {
          current.inflow += entry.amount;
        } else {
          current.outflow += entry.amount;
        }
        monthlyMap.set(month, current);
      });

      const sortedMonths = Array.from(monthlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, data]) => ({
          month: new Date(month + '-01').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
          inflow: data.inflow,
          outflow: data.outflow,
          net: data.inflow - data.outflow,
        }));

      setMonthlyData(sortedMonths);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const totals = entries.reduce((acc, entry) => {
    if (entry.type === 'inflow') {
      acc.inflow += entry.amount;
    } else {
      acc.outflow += entry.amount;
    }
    return acc;
  }, { inflow: 0, outflow: 0 });

  const handleExport = (format: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { key: 'date', header: language === 'en' ? 'Date' : 'Tanggal', format: formatDateForExport },
      { key: 'type', header: language === 'en' ? 'Type' : 'Tipe', format: (v) => v === 'inflow' ? 'Inflow' : 'Outflow' },
      { key: 'description', header: language === 'en' ? 'Description' : 'Deskripsi' },
      { key: 'amount', header: language === 'en' ? 'Amount' : 'Jumlah', format: formatCurrencyForExport },
      { key: 'reference', header: language === 'en' ? 'Reference' : 'Referensi' },
      { key: 'bank_account', header: language === 'en' ? 'Bank Account' : 'Rekening Bank' },
    ];

    const filename = `Cashflow_Report_${new Date().toISOString().split('T')[0]}`;
    if (format === 'pdf') {
      exportToPDF(entries, columns, filename, language === 'en' ? 'Cashflow Report' : 'Laporan Arus Kas');
    } else {
      exportToExcel(entries, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Cashflow Report' : 'Laporan Arus Kas'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Cash inflow and outflow analysis' : 'Analisis arus kas masuk dan keluar'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Export Excel' : 'Ekspor Excel'}
          </Button>
        </div>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'From' : 'Dari'}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'To' : 'Sampai'}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Inflow' : 'Total Masuk'}</p>
                <p className="text-2xl font-bold text-success mt-1">{formatCurrency(totals.inflow)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <ArrowUpRight className="w-6 h-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Outflow' : 'Total Keluar'}</p>
                <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(totals.outflow)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <ArrowDownRight className="w-6 h-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Net Cashflow' : 'Arus Kas Bersih'}</p>
                <p className={`text-2xl font-bold mt-1 ${totals.inflow - totals.outflow >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(totals.inflow - totals.outflow)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'summary' | 'details')}>
        <TabsList>
          <TabsTrigger value="summary">{language === 'en' ? 'Summary Chart' : 'Grafik Ringkasan'}</TabsTrigger>
          <TabsTrigger value="details">{language === 'en' ? 'Transaction Details' : 'Detail Transaksi'}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 mt-6">
          {/* Monthly Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {language === 'en' ? 'Monthly Cashflow' : 'Arus Kas Bulanan'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                    <YAxis tickFormatter={(v) => formatShortCurrency(v)} className="text-xs fill-muted-foreground" />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), '']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="inflow" 
                      name={language === 'en' ? 'Inflow' : 'Masuk'} 
                      fill="hsl(142, 71%, 45%)" 
                      radius={[4, 4, 0, 0]} 
                    />
                    <Bar 
                      dataKey="outflow" 
                      name={language === 'en' ? 'Outflow' : 'Keluar'} 
                      fill="hsl(0, 84%, 60%)" 
                      radius={[4, 4, 0, 0]} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Net Cashflow Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {language === 'en' ? 'Net Cashflow Trend' : 'Tren Arus Kas Bersih'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                    <YAxis tickFormatter={(v) => formatShortCurrency(v)} className="text-xs fill-muted-foreground" />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), language === 'en' ? 'Net' : 'Bersih']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="net" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                    <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                    <TableHead>{language === 'en' ? 'Description' : 'Deskripsi'}</TableHead>
                    <TableHead>{language === 'en' ? 'Reference' : 'Referensi'}</TableHead>
                    <TableHead>{language === 'en' ? 'Bank Account' : 'Rekening'}</TableHead>
                    <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {language === 'en' ? 'No transactions found' : 'Tidak ada transaksi'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 ${entry.type === 'inflow' ? 'text-success' : 'text-destructive'}`}>
                            {entry.type === 'inflow' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {entry.type === 'inflow' ? 'Inflow' : 'Outflow'}
                          </span>
                        </TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell>{entry.reference}</TableCell>
                        <TableCell>{entry.bank_account}</TableCell>
                        <TableCell className={`text-right font-medium ${entry.type === 'inflow' ? 'text-success' : 'text-destructive'}`}>
                          {entry.type === 'inflow' ? '+' : '-'}{formatCurrency(entry.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
