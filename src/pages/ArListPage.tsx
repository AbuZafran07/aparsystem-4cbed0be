import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, Trash2, Mail, FileText, MoreHorizontal, Loader2, Check, X, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToCSV, exportToExcel, formatCurrencyForExport, formatDateForExport, ExportColumn } from '@/lib/exportUtils';
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
  overdue_amount: number;
  overdue_days: number;
  status: InvoiceStatus;
  terms_id: string | null;
  notes: string | null;
  created_by: string;
}

interface Customer {
  id: string;
  customer_name: string;
}

interface Sales {
  id: string;
  sales_name: string;
}

interface PaymentTerms {
  id: string;
  terms_name: string;
  days: number;
}

const statusConfig: Record<InvoiceStatus, { label: { en: string; id: string }; className: string }> = {
  DRAFT: { label: { en: 'Draft', id: 'Draft' }, className: 'badge-draft' },
  SUBMITTED: { label: { en: 'Submitted', id: 'Diajukan' }, className: 'badge-submitted' },
  APPROVED: { label: { en: 'Approved', id: 'Disetujui' }, className: 'badge-approved' },
  REJECTED: { label: { en: 'Rejected', id: 'Ditolak' }, className: 'badge-rejected' },
  PARTIAL: { label: { en: 'Partial', id: 'Sebagian' }, className: 'badge-partial' },
  PAID: { label: { en: 'Paid', id: 'Lunas' }, className: 'badge-paid' },
  CANCELLED: { label: { en: 'Cancelled', id: 'Dibatalkan' }, className: 'badge-rejected' },
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

export default function ArListPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState<ArInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesList, setSalesList] = useState<Sales[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ArInvoice | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: '',
    sales_id: '',
    invoice_number: '',
    order_number: '',
    sp_po_date: '',
    invoice_date: '',
    terms_id: '',
    invoice_amount: '',
    notes: '',
  });

  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch invoices with customer and sales names
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('ar_invoices')
        .select(`
          *,
          customers (customer_name),
          sales (sales_name)
        `)
        .order('created_at', { ascending: false });

      if (invoicesError) throw invoicesError;

      const formattedInvoices: ArInvoice[] = (invoicesData || []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customers?.customer_name || 'Unknown Customer',
        sales_name: inv.sales?.sales_name || null,
      }));

      setInvoices(formattedInvoices);

      // Fetch customers for dropdown
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, customer_name')
        .eq('is_active', true)
        .order('customer_name');

      setCustomers(customersData || []);

      // Fetch sales for dropdown
      const { data: salesData } = await supabase
        .from('sales')
        .select('id, sales_name')
        .eq('is_active', true)
        .order('sales_name');

      setSalesList(salesData || []);

      // Fetch payment terms for dropdown
      const { data: termsData } = await supabase
        .from('payment_terms')
        .select('id, terms_name, days')
        .eq('is_active', true)
        .order('days');

      setPaymentTerms(termsData || []);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const calculateDueDate = (invoiceDate: string, termsId: string) => {
    const term = paymentTerms.find(t => t.id === termsId);
    if (!term || !invoiceDate) return '';

    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + term.days);
    return date.toISOString().split('T')[0];
  };

  const handleOpenCreate = () => {
    setSelectedInvoice(null);
    setFormData({
      customer_id: '',
      sales_id: '',
      invoice_number: '',
      order_number: '',
      sp_po_date: '',
      invoice_date: '',
      terms_id: '',
      invoice_amount: '',
      notes: '',
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (invoice: ArInvoice) => {
    setSelectedInvoice(invoice);
    setFormData({
      customer_id: invoice.customer_id,
      sales_id: invoice.sales_id || '',
      invoice_number: invoice.invoice_number,
      order_number: invoice.order_number,
      sp_po_date: invoice.sp_po_date,
      invoice_date: invoice.invoice_date,
      terms_id: invoice.terms_id || '',
      invoice_amount: invoice.invoice_amount.toString(),
      notes: invoice.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.customer_id || !formData.invoice_number || !formData.order_number ||
        !formData.sp_po_date || !formData.invoice_date || !formData.terms_id || !formData.invoice_amount) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Mohon isi semua field yang wajib');
      return;
    }

    try {
      setSaving(true);
      const dueDate = calculateDueDate(formData.invoice_date, formData.terms_id);
      const invoiceAmount = parseFloat(formData.invoice_amount);

      if (selectedInvoice) {
        // Update existing
        const { error } = await supabase
          .from('ar_invoices')
          .update({
            customer_id: formData.customer_id,
            sales_id: formData.sales_id || null,
            invoice_number: formData.invoice_number,
            order_number: formData.order_number,
            sp_po_date: formData.sp_po_date,
            invoice_date: formData.invoice_date,
            due_date: dueDate,
            terms_id: formData.terms_id,
            invoice_amount: invoiceAmount,
            outstanding_amount: invoiceAmount - selectedInvoice.paid_amount,
            notes: formData.notes || null,
          })
          .eq('id', selectedInvoice.id);

        if (error) throw error;
        toast.success(language === 'en' ? 'Invoice updated successfully' : 'Invoice berhasil diperbarui');
      } else {
        // Create new
        const { error } = await supabase
          .from('ar_invoices')
          .insert([{
            customer_id: formData.customer_id,
            sales_id: formData.sales_id || null,
            invoice_number: formData.invoice_number,
            order_number: formData.order_number,
            sp_po_date: formData.sp_po_date,
            invoice_date: formData.invoice_date,
            due_date: dueDate,
            terms_id: formData.terms_id,
            invoice_amount: invoiceAmount,
            outstanding_amount: invoiceAmount,
            notes: formData.notes || null,
            created_by: user?.id || '',
            status: 'DRAFT',
          }]);

        if (error) throw error;
        toast.success(language === 'en' ? 'Invoice created successfully' : 'Invoice berhasil dibuat');
      }

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast.error(error.message || (language === 'en' ? 'Failed to save invoice' : 'Gagal menyimpan invoice'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (invoice: ArInvoice) => {
    try {
      const { error } = await supabase
        .from('ar_invoices')
        .update({ status: 'SUBMITTED' })
        .eq('id', invoice.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Invoice submitted for approval' : 'Invoice diajukan untuk persetujuan');
      fetchData();
    } catch (error: any) {
      console.error('Error submitting invoice:', error);
      toast.error(language === 'en' ? 'Failed to submit invoice' : 'Gagal mengajukan invoice');
    }
  };

  const handleApprove = async (invoice: ArInvoice) => {
    try {
      const { error } = await supabase
        .from('ar_invoices')
        .update({
          status: 'APPROVED',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Invoice approved' : 'Invoice disetujui');
      fetchData();
    } catch (error: any) {
      console.error('Error approving invoice:', error);
      toast.error(language === 'en' ? 'Failed to approve invoice' : 'Gagal menyetujui invoice');
    }
  };

  const handleReject = async () => {
    if (!selectedInvoice || !rejectReason.trim()) {
      toast.error(language === 'en' ? 'Please provide rejection reason' : 'Mohon berikan alasan penolakan');
      return;
    }

    try {
      const { error } = await supabase
        .from('ar_invoices')
        .update({
          status: 'REJECTED',
          rejected_reason: rejectReason,
        })
        .eq('id', selectedInvoice.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Invoice rejected' : 'Invoice ditolak');
      setIsRejectDialogOpen(false);
      setRejectReason('');
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error rejecting invoice:', error);
      toast.error(language === 'en' ? 'Failed to reject invoice' : 'Gagal menolak invoice');
    }
  };

  const handleDelete = async () => {
    if (!selectedInvoice) return;

    try {
      const { error } = await supabase
        .from('ar_invoices')
        .delete()
        .eq('id', selectedInvoice.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Invoice deleted' : 'Invoice dihapus');
      setIsDeleteDialogOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error(language === 'en' ? 'Failed to delete invoice' : 'Gagal menghapus invoice');
    }
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.order_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canEdit = (status: InvoiceStatus) => {
    return isFinance && (status === 'DRAFT' || status === 'REJECTED');
  };

  const canSubmit = (status: InvoiceStatus) => {
    return isFinance && status === 'DRAFT';
  };

  const canApprove = (status: InvoiceStatus) => {
    return isFinance && status === 'SUBMITTED';
  };

  const canDelete = (status: InvoiceStatus) => {
    return isSuperAdmin || (isFinance && (status === 'DRAFT' || status === 'REJECTED'));
  };

  const canSendBilling = (status: InvoiceStatus, outstanding: number) => {
    return isFinance && status !== 'PAID' && outstanding > 0;
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const columns: ExportColumn[] = [
      { key: 'customer_name', header: language === 'en' ? 'Customer Name' : 'Nama Customer' },
      { key: 'sales_name', header: language === 'en' ? 'Sales' : 'Sales' },
      { key: 'invoice_number', header: language === 'en' ? 'Invoice Number' : 'No. Invoice' },
      { key: 'order_number', header: language === 'en' ? 'Order Number' : 'No. Order' },
      { key: 'invoice_date', header: language === 'en' ? 'Invoice Date' : 'Tanggal Invoice', format: formatDateForExport },
      { key: 'due_date', header: language === 'en' ? 'Due Date' : 'Jatuh Tempo', format: formatDateForExport },
      { key: 'invoice_amount', header: language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice', format: formatCurrencyForExport },
      { key: 'paid_amount', header: language === 'en' ? 'Paid Amount' : 'Jumlah Dibayar', format: formatCurrencyForExport },
      { key: 'outstanding_amount', header: language === 'en' ? 'Outstanding' : 'Sisa', format: formatCurrencyForExport },
      { key: 'overdue_days', header: language === 'en' ? 'Overdue Days' : 'Hari Terlambat' },
      { key: 'status', header: 'Status' },
    ];

    const filename = `AR_Invoices_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      exportToCSV(filteredInvoices, columns, filename);
      toast.success(language === 'en' ? 'CSV exported successfully' : 'CSV berhasil diekspor');
    } else {
      exportToExcel(filteredInvoices, columns, filename);
      toast.success(language === 'en' ? 'Excel exported successfully' : 'Excel berhasil diekspor');
    }
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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('menu.accountsReceivable')}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en'
              ? 'Manage customer invoices and receipts'
              : 'Kelola invoice dan penerimaan customer'}
          </p>
        </div>
        {isFinance && (
          <Button className="gap-2" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            {t('btn.newArInvoice')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              {t('common.filter')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  Export Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.customerName')}</TableHead>
                <TableHead>{t('table.invoiceNumber')}</TableHead>
                <TableHead>{t('table.invoiceDate')}</TableHead>
                <TableHead>{t('table.dueDate')}</TableHead>
                <TableHead className="text-right">{t('table.invoiceAmount')}</TableHead>
                <TableHead className="text-right">{t('table.outstanding')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead className="w-[100px]">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t('common.noData')}
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
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{invoice.order_number}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                    <TableCell>
                      <div>
                        <p>{formatDate(invoice.due_date)}</p>
                        {invoice.overdue_days > 0 && (
                          <p className="text-xs text-destructive">
                            {invoice.overdue_days} {language === 'en' ? 'days overdue' : 'hari terlambat'}
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2">
                            <Eye className="w-4 h-4" />
                            {t('btn.view')}
                          </DropdownMenuItem>
                          {canEdit(invoice.status) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenEdit(invoice)}>
                              <Edit className="w-4 h-4" />
                              {t('btn.edit')}
                            </DropdownMenuItem>
                          )}
                          {canSubmit(invoice.status) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleSubmit(invoice)}>
                              <Check className="w-4 h-4" />
                              {t('btn.submit')}
                            </DropdownMenuItem>
                          )}
                          {canApprove(invoice.status) && (
                            <>
                              <DropdownMenuItem className="gap-2 text-success" onClick={() => handleApprove(invoice)}>
                                <Check className="w-4 h-4" />
                                {t('btn.approve')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-destructive"
                                onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setIsRejectDialogOpen(true);
                                }}
                              >
                                <X className="w-4 h-4" />
                                {t('btn.reject')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {canSendBilling(invoice.status, invoice.outstanding_amount) && (
                            <>
                              <DropdownMenuItem className="gap-2">
                                <FileText className="w-4 h-4" />
                                {t('btn.generateBillingLetter')}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <Mail className="w-4 h-4" />
                                {t('btn.sendBillingEmail')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {isFinance && invoice.status === 'APPROVED' && invoice.outstanding_amount > 0 && (
                            <DropdownMenuItem className="gap-2">
                              <Plus className="w-4 h-4" />
                              {t('btn.recordReceipt')}
                            </DropdownMenuItem>
                          )}
                          {canDelete(invoice.status) && (
                            <DropdownMenuItem
                              className="gap-2 text-destructive"
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                              {t('btn.delete')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedInvoice
                ? (language === 'en' ? 'Edit AR Invoice' : 'Edit Invoice AR')
                : (language === 'en' ? 'New AR Invoice' : 'Invoice AR Baru')}
            </DialogTitle>
            <DialogDescription>
              {language === 'en'
                ? 'Fill in the invoice details below'
                : 'Isi detail invoice di bawah ini'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Customer' : 'Customer'} *</Label>
              <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select customer' : 'Pilih customer'} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Sales' : 'Sales'}</Label>
              <Select value={formData.sales_id} onValueChange={(v) => setFormData({ ...formData, sales_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select sales' : 'Pilih sales'} />
                </SelectTrigger>
                <SelectContent>
                  {salesList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.sales_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Invoice Number' : 'No. Invoice'} *</Label>
              <Input
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Order Number' : 'No. Order'} *</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'SP/PO Date' : 'Tanggal SP/PO'} *</Label>
              <Input
                type="date"
                value={formData.sp_po_date}
                onChange={(e) => setFormData({ ...formData, sp_po_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Invoice Date' : 'Tanggal Invoice'} *</Label>
              <Input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Payment Terms' : 'Terms Pembayaran'} *</Label>
              <Select value={formData.terms_id} onValueChange={(v) => setFormData({ ...formData, terms_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select terms' : 'Pilih terms'} />
                </SelectTrigger>
                <SelectContent>
                  {paymentTerms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.terms_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice'} *</Label>
              <Input
                type="number"
                value={formData.invoice_amount}
                onChange={(e) => setFormData({ ...formData, invoice_amount: e.target.value })}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('btn.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'en' ? 'Delete Invoice?' : 'Hapus Invoice?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en'
                ? 'This action cannot be undone. This will permanently delete the invoice.'
                : 'Tindakan ini tidak dapat dibatalkan. Invoice akan dihapus secara permanen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('btn.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('btn.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Reject Invoice' : 'Tolak Invoice'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en'
                ? 'Please provide a reason for rejection'
                : 'Mohon berikan alasan penolakan'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{language === 'en' ? 'Rejection Reason' : 'Alasan Penolakan'} *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder={language === 'en' ? 'Enter rejection reason...' : 'Masukkan alasan penolakan...'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              {t('btn.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
