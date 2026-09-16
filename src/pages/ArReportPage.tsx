import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Receipt, RefreshCw, Loader2, Search, FileText, FileSpreadsheet, CreditCard, Percent } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF, ExportColumn, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type InvoiceStatus = Database['public']['Enums']['record_status'];

interface ArInvoice {
  id: string;
  customer_id: string;
  customer_name: string;
  sales_id: string | null;
  sales_name: string | null;
  invoice_number: string;
  order_number: string;
  sp_po_date: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  status: InvoiceStatus;
  tax_code_id: string | null;
  dpp_amount: number | null;
  tax_amount: number | null;
}

interface Customer {
  id: string;
  customer_name: string;
}

interface Sales {
  id: string;
  sales_name: string;
}

interface TaxCode {
  id: string;
  code: string;
  name: string;
}

interface ArAllocation {
  ar_invoice_id: string;
  amount: number;
  receipt_date: string;
  reference_no: string | null;
}

interface CardRow {
  date: string;
  docNo: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

const statusConfig: Record<InvoiceStatus, { label: { en: string; id: string }; className: string }> = {
  DRAFT: { label: { en: 'Draft', id: 'Draft' }, className: 'badge-draft' },
  SUBMITTED: { label: { en: 'Submitted', id: 'Diajukan' }, className: 'badge-submitted' },
  APPROVED: { label: { en: 'Approved', id: 'Disetujui' }, className: 'badge-approved' },
  REJECTED: { label: { en: 'Rejected', id: 'Ditolak' }, className: 'badge-rejected' },
  PARTIAL: { label: { en: 'Partial', id: 'Sebagian' }, className: 'badge-partial' },
  PAID: { label: { en: 'Paid', id: 'Lunas' }, className: 'badge-paid' },
  CANCELLED: { label: { en: 'Cancelled', id: 'Dibatalkan' }, className: 'badge-rejected' },
  REVISION_REQUESTED: { label: { en: 'Revision Requested', id: 'Minta Revisi' }, className: 'badge-submitted' },
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('id-ID');
};

const firstDayOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};
const todayStr = () => new Date().toISOString().split('T')[0];

export default function ArReportPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<ArInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesList, setSalesList] = useState<Sales[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [arAllocations, setArAllocations] = useState<ArAllocation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Kartu Piutang (customer statement/ledger card)
  const [cardCustomerId, setCardCustomerId] = useState('');
  const [cardSalesId, setCardSalesId] = useState('all');
  const [cardDateFrom, setCardDateFrom] = useState(firstDayOfMonth());
  const [cardDateTo, setCardDateTo] = useState(todayStr());

  // PPN Keluaran (output VAT report)
  const [ppnDateFrom, setPpnDateFrom] = useState(firstDayOfMonth());
  const [ppnDateTo, setPpnDateTo] = useState(todayStr());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [
        { data: invoicesData, error: invoicesError },
        { data: customersData },
        { data: salesData },
        { data: taxData },
        { data: allocData, error: allocError },
      ] = await Promise.all([
        supabase.from('ar_invoices').select(`*, customers (customer_name), sales (sales_name)`).order('invoice_date', { ascending: false }),
        supabase.from('customers').select('id, customer_name').eq('is_active', true).order('customer_name'),
        supabase.from('sales').select('id, sales_name').eq('is_active', true).order('sales_name'),
        supabase.from('tax_codes').select('id, code, name'),
        supabase.from('ar_receipt_allocations').select('ar_invoice_id, amount, ar_receipts (receipt_date, reference_no)'),
      ]);

      if (invoicesError) throw invoicesError;
      if (allocError) throw allocError;

      const formattedInvoices: ArInvoice[] = (invoicesData || []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customers?.customer_name || 'Unknown Customer',
        sales_name: inv.sales?.sales_name || null,
      }));

      setInvoices(formattedInvoices);
      setCustomers(customersData || []);
      setSalesList(salesData || []);
      setTaxCodes(taxData || []);
      setArAllocations((allocData || []).map((a: any) => ({
        ar_invoice_id: a.ar_invoice_id,
        amount: a.amount,
        receipt_date: a.ar_receipts?.receipt_date || '',
        reference_no: a.ar_receipts?.reference_no || null,
      })));

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.order_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCustomer = customerFilter === 'all' || inv.customer_name === customerFilter;
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;

    let matchesDate = true;
    if (dateFrom) {
      matchesDate = matchesDate && inv.invoice_date >= dateFrom;
    }
    if (dateTo) {
      matchesDate = matchesDate && inv.invoice_date <= dateTo;
    }

    return matchesSearch && matchesCustomer && matchesStatus && matchesDate;
  });

  const totals = filteredInvoices.reduce((acc, inv) => ({
    invoice_amount: acc.invoice_amount + inv.invoice_amount,
    paid_amount: acc.paid_amount + inv.paid_amount,
    outstanding_amount: acc.outstanding_amount + inv.outstanding_amount,
  }), { invoice_amount: 0, paid_amount: 0, outstanding_amount: 0 });

  const getExportColumns = (): ExportColumn[] => [
    { key: 'customer_name', header: language === 'en' ? 'Customer Name' : 'Nama Customer' },
    { key: 'sales_name', header: language === 'en' ? 'Sales' : 'Sales' },
    { key: 'invoice_number', header: language === 'en' ? 'Invoice Number' : 'No. Invoice' },
    { key: 'order_number', header: language === 'en' ? 'Order Number' : 'No. Order' },
    { key: 'invoice_date', header: language === 'en' ? 'Invoice Date' : 'Tanggal Invoice', format: formatDateForExport },
    { key: 'due_date', header: language === 'en' ? 'Due Date' : 'Jatuh Tempo', format: formatDateForExport },
    { key: 'invoice_amount', header: language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice', format: formatCurrencyForExport },
    { key: 'paid_amount', header: language === 'en' ? 'Paid Amount' : 'Jumlah Dibayar', format: formatCurrencyForExport },
    { key: 'outstanding_amount', header: language === 'en' ? 'Outstanding' : 'Sisa', format: formatCurrencyForExport },
    { key: 'status', header: 'Status' },
  ];

  const handleExport = (format: 'excel' | 'pdf') => {
    const columns = getExportColumns();
    const filename = `AR_Report_${new Date().toISOString().split('T')[0]}`;
    if (format === 'pdf') {
      exportToPDF(filteredInvoices, columns, filename, language === 'en' ? 'AR Report' : 'Laporan Piutang (AR)');
    } else {
      exportToExcel(filteredInvoices, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  // ---- Kartu Piutang computation ----
  const cardCustomer = customers.find(c => c.id === cardCustomerId) || null;

  const arCard = useMemo(() => {
    if (!cardCustomerId) return null;

    const custInvoices = invoices.filter(inv =>
      inv.customer_id === cardCustomerId &&
      inv.status !== 'CANCELLED' &&
      (cardSalesId === 'all' || inv.sales_id === cardSalesId)
    );
    const invoiceIds = new Set(custInvoices.map(i => i.id));
    const custAllocations = arAllocations.filter(a => invoiceIds.has(a.ar_invoice_id));

    const beforeInvoices = custInvoices.filter(i => i.invoice_date < cardDateFrom);
    const periodInvoices = custInvoices.filter(i => i.invoice_date >= cardDateFrom && i.invoice_date <= cardDateTo);
    const beforeAllocations = custAllocations.filter(a => a.receipt_date && a.receipt_date < cardDateFrom);
    const periodAllocations = custAllocations.filter(a => a.receipt_date && a.receipt_date >= cardDateFrom && a.receipt_date <= cardDateTo);

    const saldoAwal =
      beforeInvoices.reduce((s, i) => s + i.invoice_amount, 0) -
      beforeAllocations.reduce((s, a) => s + a.amount, 0);

    const rawRows = [
      ...periodInvoices.map(i => ({
        date: i.invoice_date,
        docNo: i.invoice_number,
        description: `${language === 'en' ? 'Invoice' : 'Invoice'} - ${i.order_number}`,
        debit: i.invoice_amount,
        credit: 0,
      })),
      ...periodAllocations.map(a => ({
        date: a.receipt_date,
        docNo: a.reference_no || '-',
        description: language === 'en' ? 'Receipt' : 'Penerimaan Piutang',
        debit: 0,
        credit: a.amount,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let running = saldoAwal;
    const rows: CardRow[] = rawRows.map(r => {
      running += r.debit - r.credit;
      return { ...r, balance: running };
    });

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const saldoAkhir = saldoAwal + totalDebit - totalCredit;

    return { saldoAwal, rows, totalDebit, totalCredit, saldoAkhir };
  }, [cardCustomerId, cardSalesId, cardDateFrom, cardDateTo, invoices, arAllocations, language]);

  const getCardExportColumns = (): ExportColumn[] => [
    { key: 'date', header: language === 'en' ? 'Date' : 'Tanggal', format: (v: string) => v ? formatDateForExport(v) : '' },
    { key: 'docNo', header: language === 'en' ? 'Doc No' : 'No. Dokumen' },
    { key: 'description', header: language === 'en' ? 'Description' : 'Keterangan' },
    { key: 'debit', header: 'Debit', format: formatCurrencyForExport },
    { key: 'credit', header: 'Credit', format: formatCurrencyForExport },
    { key: 'balance', header: language === 'en' ? 'Balance' : 'Saldo', format: formatCurrencyForExport },
  ];

  const handleCardExport = (format: 'excel' | 'pdf') => {
    if (!arCard || !cardCustomer) return;
    const columns = getCardExportColumns();
    const exportRows: Record<string, any>[] = [
      { date: '', docNo: '', description: language === 'en' ? 'OPENING BALANCE' : 'SALDO AWAL', debit: '', credit: '', balance: arCard.saldoAwal },
      ...arCard.rows,
      { date: '', docNo: '', description: language === 'en' ? 'CLOSING BALANCE' : 'SALDO AKHIR', debit: '', credit: '', balance: arCard.saldoAkhir },
    ];
    const filename = `Kartu_Piutang_${cardCustomer.customer_name.replace(/\s+/g, '_')}_${cardDateFrom}_${cardDateTo}`;
    const title = `${language === 'en' ? 'AR Card' : 'Kartu Piutang'} - ${cardCustomer.customer_name}`;
    if (format === 'pdf') {
      exportToPDF(exportRows, columns, filename, title);
    } else {
      exportToExcel(exportRows, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  // ---- PPN Keluaran (output VAT) ----
  const taxCodeLabel = (id: string | null) => {
    if (!id) return '-';
    const tc = taxCodes.find(t => t.id === id);
    return tc ? `${tc.code} - ${tc.name}` : '-';
  };

  const ppnRows = useMemo(() => {
    return invoices
      .filter(inv => inv.tax_code_id && (inv.tax_amount || 0) > 0 && inv.invoice_date >= ppnDateFrom && inv.invoice_date <= ppnDateTo)
      .map(inv => ({
        date: inv.invoice_date,
        invoiceNumber: inv.invoice_number,
        customerName: inv.customer_name,
        npwp: '', // customers has no NPWP field yet; left blank per spec
        taxCode: taxCodeLabel(inv.tax_code_id),
        dpp: inv.dpp_amount || 0,
        tax: inv.tax_amount || 0,
        total: inv.invoice_amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [invoices, taxCodes, ppnDateFrom, ppnDateTo]);

  const ppnTotals = ppnRows.reduce((acc, r) => ({
    dpp: acc.dpp + r.dpp,
    tax: acc.tax + r.tax,
    total: acc.total + r.total,
  }), { dpp: 0, tax: 0, total: 0 });

  const getPpnExportColumns = (): ExportColumn[] => [
    { key: 'date', header: language === 'en' ? 'Date' : 'Tanggal', format: formatDateForExport },
    { key: 'invoiceNumber', header: language === 'en' ? 'Invoice No' : 'No. Invoice' },
    { key: 'customerName', header: language === 'en' ? 'Customer' : 'Pelanggan' },
    { key: 'npwp', header: 'NPWP' },
    { key: 'taxCode', header: language === 'en' ? 'Tax Code' : 'Kode Pajak' },
    { key: 'dpp', header: 'DPP', format: formatCurrencyForExport },
    { key: 'tax', header: 'PPN', format: formatCurrencyForExport },
    { key: 'total', header: 'Total', format: formatCurrencyForExport },
  ];

  const handlePpnExport = (format: 'excel' | 'pdf') => {
    const columns = getPpnExportColumns();
    const filename = `PPN_Keluaran_${ppnDateFrom}_${ppnDateTo}`;
    const title = language === 'en' ? 'Output VAT Report (PPN Keluaran)' : 'Laporan PPN Keluaran';
    if (format === 'pdf') {
      exportToPDF(ppnRows, columns, filename, title);
    } else {
      exportToExcel(ppnRows, columns, filename);
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
            {language === 'en' ? 'AR Report' : 'Laporan Piutang (AR)'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Accounts Receivable summary and customer statement' : 'Laporan ringkasan piutang customer dan kartu piutang'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">
            <Receipt className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Summary' : 'Ringkasan'}
          </TabsTrigger>
          <TabsTrigger value="card">
            <CreditCard className="w-4 h-4 mr-2" />
            {language === 'en' ? 'AR Card' : 'Kartu Piutang'}
          </TabsTrigger>
          <TabsTrigger value="ppn">
            <Percent className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Output VAT' : 'PPN Keluaran'}
          </TabsTrigger>
        </TabsList>

        {/* ============ RINGKASAN (existing, unchanged) ============ */}
        <TabsContent value="summary" className="space-y-6">
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Export' : 'Ekspor'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  <FileText className="w-4 h-4 mr-2" />
                  Export PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Invoices' : 'Total Invoice'}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{filteredInvoices.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Amount' : 'Total Nilai'}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totals.invoice_amount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Received' : 'Diterima'}</p>
                <p className="text-2xl font-bold text-success mt-1">{formatCurrency(totals.paid_amount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Outstanding' : 'Sisa'}</p>
                <p className="text-2xl font-bold text-warning mt-1">{formatCurrency(totals.outstanding_amount)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'en' ? 'Search...' : 'Cari...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All Customers' : 'Semua Customer'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All Customers' : 'Semua Customer'}</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.customer_name}>{c.customer_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All Status' : 'Semua Status'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label[language]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder={language === 'en' ? 'From Date' : 'Dari Tanggal'}
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder={language === 'en' ? 'To Date' : 'Sampai Tanggal'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'en' ? 'Customer' : 'Customer'}</TableHead>
                    <TableHead>{language === 'en' ? 'Invoice No' : 'No Invoice'}</TableHead>
                    <TableHead>{language === 'en' ? 'Order No' : 'No Order'}</TableHead>
                    <TableHead>{language === 'en' ? 'Invoice Date' : 'Tgl Invoice'}</TableHead>
                    <TableHead>{language === 'en' ? 'Due Date' : 'Jatuh Tempo'}</TableHead>
                    <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                    <TableHead className="text-right">{language === 'en' ? 'Outstanding' : 'Sisa'}</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {language === 'en' ? 'No data found' : 'Data tidak ditemukan'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{invoice.customer_name}</p>
                            {invoice.sales_name && (
                              <p className="text-xs text-muted-foreground">{invoice.sales_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.order_number}</TableCell>
                        <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                        <TableCell>
                          <div>
                            <p>{formatDate(invoice.due_date)}</p>
                            {invoice.overdue_days > 0 && (
                              <p className="text-xs text-destructive">
                                {invoice.overdue_days} {language === 'en' ? 'days late' : 'hari terlambat'}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(invoice.invoice_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(invoice.outstanding_amount > 0 && 'text-warning font-medium')}>
                            {formatCurrency(invoice.outstanding_amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs', statusConfig[invoice.status]?.className)}>
                            {statusConfig[invoice.status]?.label[language] || invoice.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ KARTU PIUTANG (new) ============ */}
        <TabsContent value="card" className="space-y-6">
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[220px]">
                <Label>{language === 'en' ? 'Customer' : 'Customer'} *</Label>
                <Select value={cardCustomerId} onValueChange={setCardCustomerId}>
                  <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select customer' : 'Pilih customer'} /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-[200px]">
                <Label>{language === 'en' ? 'Salesman (optional)' : 'Salesman (Opsional)'}</Label>
                <Select value={cardSalesId} onValueChange={setCardSalesId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All Salesmen' : 'Semua Sales'}</SelectItem>
                    {salesList.map(s => <SelectItem key={s.id} value={s.id}>{s.sales_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'From Date' : 'Dari Tanggal'}</Label>
                <Input type="date" value={cardDateFrom} onChange={(e) => setCardDateFrom(e.target.value)} className="max-w-xs" />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'To Date' : 'Sampai Tanggal'}</Label>
                <Input type="date" value={cardDateTo} onChange={(e) => setCardDateTo(e.target.value)} className="max-w-xs" />
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCardExport('excel')} disabled={!arCard}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleCardExport('pdf')} disabled={!arCard}>
                  <FileText className="w-4 h-4 mr-2" />PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {!cardCustomerId ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {language === 'en' ? 'Select a customer to view their AR card' : 'Pilih customer untuk melihat kartu piutang'}
              </CardContent>
            </Card>
          ) : arCard && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Opening Balance' : 'Saldo Awal'}</p>
                    <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(arCard.saldoAwal)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Debit / Credit (period)' : 'Total Debit / Kredit (periode)'}</p>
                    <p className="text-xl font-bold mt-1">
                      <span className="text-success">{formatCurrency(arCard.totalDebit)}</span>
                      {' / '}
                      <span className="text-warning">{formatCurrency(arCard.totalCredit)}</span>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Closing Balance' : 'Saldo Akhir'}</p>
                    <p className="text-xl font-bold text-primary mt-1">{formatCurrency(arCard.saldoAkhir)}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{cardCustomer?.customer_name}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                        <TableHead>{language === 'en' ? 'Doc No' : 'No. Dokumen'}</TableHead>
                        <TableHead>{language === 'en' ? 'Description' : 'Keterangan'}</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Kredit</TableHead>
                        <TableHead className="text-right">{language === 'en' ? 'Balance' : 'Saldo'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={5}>{language === 'en' ? 'Opening Balance' : 'Saldo Awal'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(arCard.saldoAwal)}</TableCell>
                      </TableRow>
                      {arCard.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {language === 'en' ? 'No transactions in this period' : 'Tidak ada transaksi pada periode ini'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        arCard.rows.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                            <TableCell>{r.docNo}</TableCell>
                            <TableCell>{r.description}</TableCell>
                            <TableCell className="text-right">{r.debit > 0 ? formatCurrency(r.debit) : ''}</TableCell>
                            <TableCell className="text-right">{r.credit > 0 ? formatCurrency(r.credit) : ''}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(r.balance)}</TableCell>
                          </TableRow>
                        ))
                      )}
                      <TableRow className="font-bold border-t-2">
                        <TableCell colSpan={5}>{language === 'en' ? 'Closing Balance' : 'Saldo Akhir'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(arCard.saldoAkhir)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ============ PPN KELUARAN (new) ============ */}
        <TabsContent value="ppn" className="space-y-6">
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'From Date' : 'Dari Tanggal'}</Label>
                <Input type="date" value={ppnDateFrom} onChange={(e) => setPpnDateFrom(e.target.value)} className="max-w-xs" />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'To Date' : 'Sampai Tanggal'}</Label>
                <Input type="date" value={ppnDateTo} onChange={(e) => setPpnDateTo(e.target.value)} className="max-w-xs" />
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePpnExport('excel')} disabled={ppnRows.length === 0}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePpnExport('pdf')} disabled={ppnRows.length === 0}>
                  <FileText className="w-4 h-4 mr-2" />PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total DPP</p>
                <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(ppnTotals.dpp)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total PPN</p>
                <p className="text-xl font-bold text-primary mt-1">{formatCurrency(ppnTotals.tax)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(ppnTotals.total)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                    <TableHead>{language === 'en' ? 'Invoice No' : 'No. Invoice'}</TableHead>
                    <TableHead>{language === 'en' ? 'Customer' : 'Pelanggan'}</TableHead>
                    <TableHead>NPWP</TableHead>
                    <TableHead>{language === 'en' ? 'Tax Code' : 'Kode Pajak'}</TableHead>
                    <TableHead className="text-right">DPP</TableHead>
                    <TableHead className="text-right">PPN</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ppnRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {language === 'en' ? 'No data found' : 'Data tidak ditemukan'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {ppnRows.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                          <TableCell>{r.invoiceNumber}</TableCell>
                          <TableCell>{r.customerName}</TableCell>
                          <TableCell>{r.npwp || '-'}</TableCell>
                          <TableCell>{r.taxCode}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.dpp)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.tax)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold border-t-2">
                        <TableCell colSpan={5}>Total</TableCell>
                        <TableCell className="text-right">{formatCurrency(ppnTotals.dpp)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ppnTotals.tax)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ppnTotals.total)}</TableCell>
                      </TableRow>
                    </>
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
