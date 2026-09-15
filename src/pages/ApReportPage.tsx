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
import { Download, FileText, RefreshCw, Loader2, Search, Filter, FileSpreadsheet, CreditCard } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF, ExportColumn, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type InvoiceStatus = Database['public']['Enums']['record_status'];

interface ApInvoice {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_invoice_number: string;
  po_number: string;
  product_name: string | null;
  sp_po_date: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  status: InvoiceStatus;
}

interface Vendor {
  id: string;
  vendor_name: string;
}

interface ApAllocation {
  ap_invoice_id: string;
  amount: number;
  payment_date: string;
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

export default function ApReportPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<ApInvoice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [apAllocations, setApAllocations] = useState<ApAllocation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Kartu Hutang (vendor statement/ledger card)
  const [cardVendorId, setCardVendorId] = useState('');
  const [cardDateFrom, setCardDateFrom] = useState(firstDayOfMonth());
  const [cardDateTo, setCardDateTo] = useState(todayStr());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [
        { data: invoicesData, error: invoicesError },
        { data: vendorsData },
        { data: allocData, error: allocError },
      ] = await Promise.all([
        supabase.from('ap_invoices').select(`*, vendors (vendor_name)`).order('invoice_date', { ascending: false }),
        supabase.from('vendors').select('id, vendor_name').eq('is_active', true).order('vendor_name'),
        supabase.from('ap_payment_allocations').select('ap_invoice_id, amount, ap_payments (payment_date, reference_no)'),
      ]);

      if (invoicesError) throw invoicesError;
      if (allocError) throw allocError;

      const formattedInvoices: ApInvoice[] = (invoicesData || []).map((inv: any) => ({
        ...inv,
        vendor_name: inv.vendors?.vendor_name || 'Unknown Vendor',
      }));

      setInvoices(formattedInvoices);
      setVendors(vendorsData || []);
      setApAllocations((allocData || []).map((a: any) => ({
        ap_invoice_id: a.ap_invoice_id,
        amount: a.amount,
        payment_date: a.ap_payments?.payment_date || '',
        reference_no: a.ap_payments?.reference_no || null,
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
      inv.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.vendor_invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.po_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesVendor = vendorFilter === 'all' || inv.vendor_name === vendorFilter;
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;

    let matchesDate = true;
    if (dateFrom) {
      matchesDate = matchesDate && inv.invoice_date >= dateFrom;
    }
    if (dateTo) {
      matchesDate = matchesDate && inv.invoice_date <= dateTo;
    }

    return matchesSearch && matchesVendor && matchesStatus && matchesDate;
  });

  const totals = filteredInvoices.reduce((acc, inv) => ({
    invoice_amount: acc.invoice_amount + inv.invoice_amount,
    paid_amount: acc.paid_amount + inv.paid_amount,
    outstanding_amount: acc.outstanding_amount + inv.outstanding_amount,
  }), { invoice_amount: 0, paid_amount: 0, outstanding_amount: 0 });

  const getExportColumns = (): ExportColumn[] => [
    { key: 'vendor_name', header: language === 'en' ? 'Vendor Name' : 'Nama Vendor' },
    { key: 'vendor_invoice_number', header: language === 'en' ? 'Invoice Number' : 'No. Invoice' },
    { key: 'po_number', header: language === 'en' ? 'PO Number' : 'No. PO' },
    { key: 'product_name', header: language === 'en' ? 'Product' : 'Produk' },
    { key: 'invoice_date', header: language === 'en' ? 'Invoice Date' : 'Tanggal Invoice', format: formatDateForExport },
    { key: 'due_date', header: language === 'en' ? 'Due Date' : 'Jatuh Tempo', format: formatDateForExport },
    { key: 'invoice_amount', header: language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice', format: formatCurrencyForExport },
    { key: 'paid_amount', header: language === 'en' ? 'Paid Amount' : 'Jumlah Dibayar', format: formatCurrencyForExport },
    { key: 'outstanding_amount', header: language === 'en' ? 'Outstanding' : 'Sisa', format: formatCurrencyForExport },
    { key: 'status', header: 'Status' },
  ];

  const handleExport = (format: 'excel' | 'pdf') => {
    const columns = getExportColumns();
    const filename = `AP_Report_${new Date().toISOString().split('T')[0]}`;
    if (format === 'pdf') {
      exportToPDF(filteredInvoices, columns, filename, language === 'en' ? 'AP Report' : 'Laporan Hutang (AP)');
    } else {
      exportToExcel(filteredInvoices, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  // ---- Kartu Hutang computation ----
  const cardVendor = vendors.find(v => v.id === cardVendorId) || null;

  const apCard = useMemo(() => {
    if (!cardVendorId) return null;

    const vendInvoices = invoices.filter(inv => inv.vendor_id === cardVendorId && inv.status !== 'CANCELLED');
    const invoiceIds = new Set(vendInvoices.map(i => i.id));
    const vendAllocations = apAllocations.filter(a => invoiceIds.has(a.ap_invoice_id));

    const beforeInvoices = vendInvoices.filter(i => i.invoice_date < cardDateFrom);
    const periodInvoices = vendInvoices.filter(i => i.invoice_date >= cardDateFrom && i.invoice_date <= cardDateTo);
    const beforeAllocations = vendAllocations.filter(a => a.payment_date && a.payment_date < cardDateFrom);
    const periodAllocations = vendAllocations.filter(a => a.payment_date && a.payment_date >= cardDateFrom && a.payment_date <= cardDateTo);

    const saldoAwal =
      beforeInvoices.reduce((s, i) => s + i.invoice_amount, 0) -
      beforeAllocations.reduce((s, a) => s + a.amount, 0);

    const rawRows = [
      ...periodInvoices.map(i => ({
        date: i.invoice_date,
        docNo: i.vendor_invoice_number,
        description: `${language === 'en' ? 'Purchase Invoice' : 'Invoice Pembelian'} - ${i.po_number}`,
        debit: 0,
        credit: i.invoice_amount,
      })),
      ...periodAllocations.map(a => ({
        date: a.payment_date,
        docNo: a.reference_no || '-',
        description: language === 'en' ? 'Payment' : 'Pembayaran Hutang',
        debit: a.amount,
        credit: 0,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let running = saldoAwal;
    const rows: CardRow[] = rawRows.map(r => {
      running += r.credit - r.debit;
      return { ...r, balance: running };
    });

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const saldoAkhir = saldoAwal + totalCredit - totalDebit;

    return { saldoAwal, rows, totalDebit, totalCredit, saldoAkhir };
  }, [cardVendorId, cardDateFrom, cardDateTo, invoices, apAllocations, language]);

  const getCardExportColumns = (): ExportColumn[] => [
    { key: 'date', header: language === 'en' ? 'Date' : 'Tanggal', format: (v: string) => v ? formatDateForExport(v) : '' },
    { key: 'docNo', header: language === 'en' ? 'Doc No' : 'No. Dokumen' },
    { key: 'description', header: language === 'en' ? 'Description' : 'Keterangan' },
    { key: 'debit', header: 'Debit', format: formatCurrencyForExport },
    { key: 'credit', header: 'Credit', format: formatCurrencyForExport },
    { key: 'balance', header: language === 'en' ? 'Balance' : 'Saldo', format: formatCurrencyForExport },
  ];

  const handleCardExport = (format: 'excel' | 'pdf') => {
    if (!apCard || !cardVendor) return;
    const columns = getCardExportColumns();
    const exportRows: Record<string, any>[] = [
      { date: '', docNo: '', description: language === 'en' ? 'OPENING BALANCE' : 'SALDO AWAL', debit: '', credit: '', balance: apCard.saldoAwal },
      ...apCard.rows,
      { date: '', docNo: '', description: language === 'en' ? 'CLOSING BALANCE' : 'SALDO AKHIR', debit: '', credit: '', balance: apCard.saldoAkhir },
    ];
    const filename = `Kartu_Hutang_${cardVendor.vendor_name.replace(/\s+/g, '_')}_${cardDateFrom}_${cardDateTo}`;
    const title = `${language === 'en' ? 'AP Card' : 'Kartu Hutang'} - ${cardVendor.vendor_name}`;
    if (format === 'pdf') {
      exportToPDF(exportRows, columns, filename, title);
    } else {
      exportToExcel(exportRows, columns, filename);
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
            {language === 'en' ? 'AP Report' : 'Laporan Hutang (AP)'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Accounts Payable summary and vendor statement' : 'Laporan ringkasan hutang vendor dan kartu hutang'}
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
            <FileText className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Summary' : 'Ringkasan'}
          </TabsTrigger>
          <TabsTrigger value="card">
            <CreditCard className="w-4 h-4 mr-2" />
            {language === 'en' ? 'AP Card' : 'Kartu Hutang'}
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
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Paid' : 'Dibayar'}</p>
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
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All Vendors' : 'Semua Vendor'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All Vendors' : 'Semua Vendor'}</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.vendor_name}>{v.vendor_name}</SelectItem>
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
                    <TableHead>{language === 'en' ? 'Vendor' : 'Vendor'}</TableHead>
                    <TableHead>{language === 'en' ? 'Invoice No' : 'No Invoice'}</TableHead>
                    <TableHead>{language === 'en' ? 'PO Number' : 'No PO'}</TableHead>
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
                        <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                        <TableCell>{invoice.vendor_invoice_number}</TableCell>
                        <TableCell>{invoice.po_number}</TableCell>
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

        {/* ============ KARTU HUTANG (new) ============ */}
        <TabsContent value="card" className="space-y-6">
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[220px]">
                <Label>{language === 'en' ? 'Vendor' : 'Vendor'} *</Label>
                <Select value={cardVendorId} onValueChange={setCardVendorId}>
                  <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select vendor' : 'Pilih vendor'} /></SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>)}
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
                <Button variant="outline" size="sm" onClick={() => handleCardExport('excel')} disabled={!apCard}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleCardExport('pdf')} disabled={!apCard}>
                  <FileText className="w-4 h-4 mr-2" />PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {!cardVendorId ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {language === 'en' ? 'Select a vendor to view their AP card' : 'Pilih vendor untuk melihat kartu hutang'}
              </CardContent>
            </Card>
          ) : apCard && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Opening Balance' : 'Saldo Awal'}</p>
                    <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(apCard.saldoAwal)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Debit / Credit (period)' : 'Total Debit / Kredit (periode)'}</p>
                    <p className="text-xl font-bold mt-1">
                      <span className="text-success">{formatCurrency(apCard.totalDebit)}</span>
                      {' / '}
                      <span className="text-warning">{formatCurrency(apCard.totalCredit)}</span>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Closing Balance' : 'Saldo Akhir'}</p>
                    <p className="text-xl font-bold text-primary mt-1">{formatCurrency(apCard.saldoAkhir)}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{cardVendor?.vendor_name}</CardTitle>
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
                        <TableCell className="text-right">{formatCurrency(apCard.saldoAwal)}</TableCell>
                      </TableRow>
                      {apCard.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {language === 'en' ? 'No transactions in this period' : 'Tidak ada transaksi pada periode ini'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        apCard.rows.map((r, idx) => (
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
                        <TableCell className="text-right">{formatCurrency(apCard.saldoAkhir)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
