import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Download, Receipt, RefreshCw, Loader2, Search, FileText, FileSpreadsheet } from 'lucide-react';
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
  customer_name: string;
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
}

interface Customer {
  id: string;
  customer_name: string;
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

export default function ArReportPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<ArInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: invoicesData, error: invoicesError } = await supabase
        .from('ar_invoices')
        .select(`*, customers (customer_name), sales (sales_name)`)
        .order('invoice_date', { ascending: false });

      if (invoicesError) throw invoicesError;

      const formattedInvoices: ArInvoice[] = (invoicesData || []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customers?.customer_name || 'Unknown Customer',
        sales_name: inv.sales?.sales_name || null,
      }));

      setInvoices(formattedInvoices);

      const { data: customersData } = await supabase
        .from('customers')
        .select('id, customer_name')
        .eq('is_active', true)
        .order('customer_name');

      setCustomers(customersData || []);

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
            {language === 'en' ? 'Accounts Receivable summary report' : 'Laporan ringkasan piutang customer'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
    </div>
  );
}
