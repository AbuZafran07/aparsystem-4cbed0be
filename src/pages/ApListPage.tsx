import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Filter, Eye, Edit, Trash2, Check, X, MoreHorizontal, Loader2, Download, Upload, CreditCard, FileDown } from 'lucide-react';
import { exportToCSV, exportToExcel, formatCurrencyForExport, formatDateForExport, ExportColumn } from '@/lib/exportUtils';
import { parseExcelFile, validateAndMapApData, generateApTemplate, ImportError } from '@/lib/importUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Database } from '@/integrations/supabase/types';

interface BankAccount {
  id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
}

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
  overdue_amount: number;
  overdue_days: number;
  status: InvoiceStatus;
  terms_id: string | null;
  notes: string | null;
  created_by: string;
}

interface Vendor {
  id: string;
  vendor_name: string;
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

export default function ApListPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState<ApInvoice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ApInvoice | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    vendor_id: '',
    vendor_invoice_number: '',
    po_number: '',
    product_name: '',
    sp_po_date: '',
    invoice_date: '',
    terms_id: '',
    invoice_amount: '',
    notes: '',
  });

  const [paymentData, setPaymentData] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    bank_account_id: '',
    reference_no: '',
    notes: '',
  });

  const isPurchasing = user?.role === 'PURCHASING' || user?.role === 'SUPER_ADMIN';
  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch invoices with vendor names
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('ap_invoices')
        .select(`
          *,
          vendors (vendor_name)
        `)
        .order('created_at', { ascending: false });

      if (invoicesError) throw invoicesError;

      const formattedInvoices: ApInvoice[] = (invoicesData || []).map((inv: any) => ({
        ...inv,
        vendor_name: inv.vendors?.vendor_name || 'Unknown Vendor',
      }));

      setInvoices(formattedInvoices);

      // Fetch vendors for dropdown
      const { data: vendorsData } = await supabase
        .from('vendors')
        .select('id, vendor_name')
        .eq('is_active', true)
        .order('vendor_name');

      setVendors(vendorsData || []);

      // Fetch payment terms for dropdown
      const { data: termsData } = await supabase
        .from('payment_terms')
        .select('id, terms_name, days')
        .eq('is_active', true)
        .order('days');

      setPaymentTerms(termsData || []);

      // Fetch bank accounts for payment
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_no, account_name')
        .eq('is_active', true)
        .order('bank_name');

      setBankAccounts(bankData || []);

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
      vendor_id: '',
      vendor_invoice_number: '',
      po_number: '',
      product_name: '',
      sp_po_date: '',
      invoice_date: '',
      terms_id: '',
      invoice_amount: '',
      notes: '',
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (invoice: ApInvoice) => {
    setSelectedInvoice(invoice);
    setFormData({
      vendor_id: invoice.vendor_id,
      vendor_invoice_number: invoice.vendor_invoice_number,
      po_number: invoice.po_number,
      product_name: invoice.product_name || '',
      sp_po_date: invoice.sp_po_date,
      invoice_date: invoice.invoice_date,
      terms_id: invoice.terms_id || '',
      invoice_amount: invoice.invoice_amount.toString(),
      notes: invoice.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.vendor_id || !formData.vendor_invoice_number || !formData.po_number || 
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
          .from('ap_invoices')
          .update({
            vendor_id: formData.vendor_id,
            vendor_invoice_number: formData.vendor_invoice_number,
            po_number: formData.po_number,
            product_name: formData.product_name || null,
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
          .from('ap_invoices')
          .insert([{
            vendor_id: formData.vendor_id,
            vendor_invoice_number: formData.vendor_invoice_number,
            po_number: formData.po_number,
            product_name: formData.product_name || null,
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

  const handleSubmit = async (invoice: ApInvoice) => {
    try {
      const { error } = await supabase
        .from('ap_invoices')
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

  const handleApprove = async (invoice: ApInvoice) => {
    try {
      const { error } = await supabase
        .from('ap_invoices')
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
        .from('ap_invoices')
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
        .from('ap_invoices')
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

  const handleOpenPayment = (invoice: ApInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentData({
      payment_date: new Date().toISOString().split('T')[0],
      amount: invoice.outstanding_amount.toString(),
      bank_account_id: '',
      reference_no: '',
      notes: '',
    });
    setIsPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !paymentData.amount || !paymentData.bank_account_id || !paymentData.payment_date) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Mohon isi semua field yang wajib');
      return;
    }

    const amount = parseFloat(paymentData.amount);
    if (amount <= 0 || amount > selectedInvoice.outstanding_amount) {
      toast.error(language === 'en' ? 'Invalid payment amount' : 'Jumlah pembayaran tidak valid');
      return;
    }

    try {
      setSaving(true);

      // Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('ap_payments')
        .insert([{
          payment_date: paymentData.payment_date,
          total_amount: amount,
          bank_account_id: paymentData.bank_account_id,
          reference_no: paymentData.reference_no || null,
          notes: paymentData.notes || null,
          created_by: user?.id || '',
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Create allocation
      const { error: allocError } = await supabase
        .from('ap_payment_allocations')
        .insert([{
          payment_id: payment.id,
          ap_invoice_id: selectedInvoice.id,
          amount: amount,
        }]);

      if (allocError) throw allocError;

      // Update invoice
      const newPaidAmount = selectedInvoice.paid_amount + amount;
      const newOutstanding = selectedInvoice.invoice_amount - newPaidAmount;
      const newStatus = newOutstanding <= 0 ? 'PAID' : 'PARTIAL';

      const { error: updateError } = await supabase
        .from('ap_invoices')
        .update({
          paid_amount: newPaidAmount,
          outstanding_amount: newOutstanding,
          status: newStatus,
          paid_date: newStatus === 'PAID' ? paymentData.payment_date : null,
        })
        .eq('id', selectedInvoice.id);

      if (updateError) throw updateError;

      toast.success(language === 'en' ? 'Payment recorded successfully' : 'Pembayaran berhasil dicatat');
      setIsPaymentDialogOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast.error(language === 'en' ? 'Failed to record payment' : 'Gagal mencatat pembayaran');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setImportErrors([]);

      const rows = await parseExcelFile(file);
      const result = validateAndMapApData(rows, vendors, paymentTerms);

      if (result.errors.length > 0) {
        setImportErrors(result.errors);
        toast.error(language === 'en' 
          ? `Import failed with ${result.errors.length} errors` 
          : `Import gagal dengan ${result.errors.length} kesalahan`);
        return;
      }

      if (result.data.length === 0) {
        toast.error(language === 'en' ? 'No valid data to import' : 'Tidak ada data valid untuk diimpor');
        return;
      }

      // Insert all records
      const dataWithCreatedBy = result.data.map(row => ({
        ...row,
        created_by: user?.id || '',
      }));

      const { error } = await supabase
        .from('ap_invoices')
        .insert(dataWithCreatedBy);

      if (error) throw error;

      toast.success(language === 'en' 
        ? `Successfully imported ${result.data.length} invoices` 
        : `Berhasil mengimpor ${result.data.length} invoice`);
      setIsImportDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.error(error.message || (language === 'en' ? 'Failed to import' : 'Gagal mengimpor'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.vendor_invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.po_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canEdit = (status: InvoiceStatus) => {
    if (isPurchasing) {
      return status === 'DRAFT' || status === 'REJECTED';
    }
    return false;
  };

  const canSubmit = (status: InvoiceStatus) => {
    return isPurchasing && status === 'DRAFT';
  };

  const canApprove = (status: InvoiceStatus) => {
    return isFinance && status === 'SUBMITTED';
  };

  const canDelete = (status: InvoiceStatus) => {
    return isSuperAdmin || (isPurchasing && (status === 'DRAFT' || status === 'REJECTED'));
  };

  const canRecordPayment = (status: InvoiceStatus, outstanding: number) => {
    return isFinance && (status === 'APPROVED' || status === 'PARTIAL') && outstanding > 0;
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const columns: ExportColumn[] = [
      { key: 'vendor_name', header: language === 'en' ? 'Vendor Name' : 'Nama Vendor' },
      { key: 'vendor_invoice_number', header: language === 'en' ? 'Invoice Number' : 'No. Invoice' },
      { key: 'po_number', header: language === 'en' ? 'PO Number' : 'No. PO' },
      { key: 'invoice_date', header: language === 'en' ? 'Invoice Date' : 'Tanggal Invoice', format: formatDateForExport },
      { key: 'due_date', header: language === 'en' ? 'Due Date' : 'Jatuh Tempo', format: formatDateForExport },
      { key: 'invoice_amount', header: language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice', format: formatCurrencyForExport },
      { key: 'paid_amount', header: language === 'en' ? 'Paid Amount' : 'Jumlah Dibayar', format: formatCurrencyForExport },
      { key: 'outstanding_amount', header: language === 'en' ? 'Outstanding' : 'Sisa', format: formatCurrencyForExport },
      { key: 'overdue_days', header: language === 'en' ? 'Overdue Days' : 'Hari Terlambat' },
      { key: 'status', header: 'Status' },
    ];

    const filename = `AP_Invoices_${new Date().toISOString().split('T')[0]}`;
    
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
          <h1 className="text-2xl font-bold text-foreground">{t('menu.accountsPayable')}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' 
              ? 'Manage vendor invoices and payments' 
              : 'Kelola invoice dan pembayaran vendor'}
          </p>
        </div>
        <div className="flex gap-2">
          {isPurchasing && (
            <Button variant="outline" className="gap-2" onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="w-4 h-4" />
              {language === 'en' ? 'Import' : 'Impor'}
            </Button>
          )}
          {isPurchasing && (
            <Button className="gap-2" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4" />
              {t('btn.newApInvoice')}
            </Button>
          )}
        </div>
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
                <TableHead>{t('table.vendorName')}</TableHead>
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
                    <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.vendor_invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{invoice.po_number}</p>
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
                          {canRecordPayment(invoice.status, invoice.outstanding_amount) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenPayment(invoice)}>
                              <CreditCard className="w-4 h-4" />
                              {t('btn.recordPayment')}
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
                ? (language === 'en' ? 'Edit AP Invoice' : 'Edit Invoice AP')
                : (language === 'en' ? 'New AP Invoice' : 'Invoice AP Baru')}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Fill in the invoice details below' 
                : 'Isi detail invoice di bawah ini'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Vendor' : 'Vendor'} *</Label>
              <Select value={formData.vendor_id} onValueChange={(v) => setFormData({...formData, vendor_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select vendor' : 'Pilih vendor'} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Vendor Invoice No.' : 'No. Invoice Vendor'} *</Label>
              <Input 
                value={formData.vendor_invoice_number} 
                onChange={(e) => setFormData({...formData, vendor_invoice_number: e.target.value})} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'en' ? 'PO Number' : 'No. PO'} *</Label>
              <Input 
                value={formData.po_number} 
                onChange={(e) => setFormData({...formData, po_number: e.target.value})} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Product Name' : 'Nama Produk'}</Label>
              <Input 
                value={formData.product_name} 
                onChange={(e) => setFormData({...formData, product_name: e.target.value})} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'en' ? 'SP/PO Date' : 'Tanggal SP/PO'} *</Label>
              <Input 
                type="date" 
                value={formData.sp_po_date} 
                onChange={(e) => setFormData({...formData, sp_po_date: e.target.value})} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Invoice Date' : 'Tanggal Invoice'} *</Label>
              <Input 
                type="date" 
                value={formData.invoice_date} 
                onChange={(e) => setFormData({...formData, invoice_date: e.target.value})} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Payment Terms' : 'Terms Pembayaran'} *</Label>
              <Select value={formData.terms_id} onValueChange={(v) => setFormData({...formData, terms_id: v})}>
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
                onChange={(e) => setFormData({...formData, invoice_amount: e.target.value})} 
              />
            </div>
            
            <div className="col-span-2 space-y-2">
              <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
              <Textarea 
                value={formData.notes} 
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
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

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Record Payment' : 'Catat Pembayaran'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? `Outstanding: ${formatCurrency(selectedInvoice?.outstanding_amount || 0)}` 
                : `Sisa: ${formatCurrency(selectedInvoice?.outstanding_amount || 0)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Payment Date' : 'Tanggal Pembayaran'} *</Label>
              <Input 
                type="date"
                value={paymentData.payment_date} 
                onChange={(e) => setPaymentData({...paymentData, payment_date: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Amount' : 'Jumlah'} *</Label>
              <Input 
                type="number"
                value={paymentData.amount} 
                onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                max={selectedInvoice?.outstanding_amount}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Bank Account' : 'Rekening Bank'} *</Label>
              <Select value={paymentData.bank_account_id} onValueChange={(v) => setPaymentData({...paymentData, bank_account_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select bank account' : 'Pilih rekening bank'} />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bank_name} - {b.account_no} ({b.account_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Reference No.' : 'No. Referensi'}</Label>
              <Input 
                value={paymentData.reference_no} 
                onChange={(e) => setPaymentData({...paymentData, reference_no: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
              <Textarea 
                value={paymentData.notes} 
                onChange={(e) => setPaymentData({...paymentData, notes: e.target.value})}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleRecordPayment} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('btn.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Import AP Invoices' : 'Impor Invoice AP'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Upload Excel file with Indonesian headers format' 
                : 'Upload file Excel dengan format header Indonesia'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="outline" className="gap-2 w-full" onClick={generateApTemplate}>
              <FileDown className="w-4 h-4" />
              {language === 'en' ? 'Download Template' : 'Unduh Template'}
            </Button>
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="import-file"
              />
              <label htmlFor="import-file" className="cursor-pointer">
                {importing ? (
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                  </>
                )}
              </label>
            </div>
            {importErrors.length > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded p-3 bg-destructive/10">
                <p className="font-medium text-destructive mb-2">
                  {language === 'en' ? 'Errors:' : 'Kesalahan:'}
                </p>
                <ul className="text-sm space-y-1">
                  {importErrors.map((err, idx) => (
                    <li key={idx} className="text-destructive">
                      Row {err.row}{err.column ? ` (${err.column})` : ''}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
