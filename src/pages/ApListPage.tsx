import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TablePagination, usePagination } from '@/components/TablePagination';
import { Plus, Search, Filter, Eye, Edit, Trash2, Check, X, MoreHorizontal, Loader2, Download, Upload, CreditCard, FileDown, Printer, ChevronsUpDown } from 'lucide-react';
import { InvoiceScanButton } from '@/components/InvoiceScanButton';
import { exportToCSV, exportToExcel, formatCurrencyForExport, formatDateForExport, ExportColumn } from '@/lib/exportUtils';
import { parseExcelFile, validateAndMapApData, generateApTemplate, ImportError } from '@/lib/importUtils';
import { generatePaymentRequestHTML, downloadPaymentRequestPDF, PaymentRequestData } from '@/lib/paymentRequestUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
  address?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
}

interface PaymentTerms {
  id: string;
  terms_name: string;
  days: number;
}

interface CompanyProfile {
  company_name: string;
  brand_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
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

type StatusTab = 'ALL' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID';

const statusTabs: { value: StatusTab; label: { en: string; id: string }; statuses: InvoiceStatus[] }[] = [
  { value: 'ALL', label: { en: 'All', id: 'Semua' }, statuses: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIAL', 'PAID', 'CANCELLED', 'REVISION_REQUESTED'] },
  { value: 'DRAFT', label: { en: 'Draft', id: 'Draft' }, statuses: ['DRAFT', 'REJECTED'] },
  { value: 'SUBMITTED', label: { en: 'Submitted', id: 'Diajukan' }, statuses: ['SUBMITTED', 'REVISION_REQUESTED'] },
  { value: 'APPROVED', label: { en: 'Approved', id: 'Disetujui' }, statuses: ['APPROVED', 'PARTIAL'] },
  { value: 'PAID', label: { en: 'Paid', id: 'Lunas' }, statuses: ['PAID'] },
];

export default function ApListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [invoices, setInvoices] = useState<ApInvoice[]>([]);
  const [prByInvoice, setPrByInvoice] = useState<Record<string, Array<{ id: string; request_no: string; status: string; submitted_amount: number; approved_amount: number | null; request_date: string; paid_at: string | null; notes: string | null }>>>({});
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isPaymentRequestDialogOpen, setIsPaymentRequestDialogOpen] = useState(false);
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
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

  const [paymentRequestData, setPaymentRequestData] = useState({
    payment_method: 'transfer' as 'transfer' | 'cash',
    bank_account_id: '',
    transfer_amount: '',
    cash_amount: '',
    notes: '',
  });

  const isPurchasing = user?.role === 'PURCHASING' || user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  // FINANCE can view AP but cannot create/edit/delete
  const canCreateAp = isPurchasing || isAdmin;
  const canEditAp = (status: string) => {
    if (user?.role === 'FINANCE') return false;
    if (isPurchasing) return status === 'DRAFT' || status === 'REJECTED';
    if (isAdmin) return status === 'DRAFT' || status === 'REJECTED';
    return false;
  };
  const canDeleteAp = (status: string) => {
    if (user?.role === 'FINANCE') return false;
    return isSuperAdmin || (isPurchasing && (status === 'DRAFT' || status === 'REJECTED')) || (isAdmin && (status === 'DRAFT' || status === 'REJECTED'));
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription for AP invoices
    const channel = supabase
      .channel('ap-invoices-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ap_invoices' },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow?.notes?.includes('WMS')) {
            toast.info('Invoice AP baru dari WMS', {
              description: `Invoice ${newRow.vendor_invoice_number || ''} telah masuk otomatis dari WMS`,
            });
          }
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ap_invoices' },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'ap_invoices' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

      // Fetch payment requests linked to these invoices
      const invoiceIds = formattedInvoices.map(i => i.id);
      if (invoiceIds.length > 0) {
        const { data: prData } = await supabase
          .from('payment_requests')
          .select('id, request_no, ap_invoice_id, status, submitted_amount, approved_amount, request_date, paid_at, notes')
          .in('ap_invoice_id', invoiceIds)
          .order('created_at', { ascending: true });
        const grouped: Record<string, any[]> = {};
        (prData || []).forEach((pr: any) => {
          (grouped[pr.ap_invoice_id] ||= []).push(pr);
        });
        setPrByInvoice(grouped);
      } else {
        setPrByInvoice({});
      }

      // Fetch vendors for dropdown (include address and bank details for payment request)
      const { data: vendorsData } = await supabase
        .from('vendors')
        .select('id, vendor_name, address, bank_name, bank_account_no')
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

      // Fetch company profile for payment request PDF
      const { data: companyData } = await supabase
        .from('company_profile')
        .select('company_name, brand_name, address, phone, email, logo_url')
        .limit(1)
        .maybeSingle();

      setCompanyProfile(companyData);

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
    navigate('/ap/new');
  };

  const handleOpenView = (invoice: ApInvoice) => {
    navigate(`/ap/${invoice.id}`);
  };

  const handleOpenEdit = (invoice: ApInvoice) => {
    navigate(`/ap/${invoice.id}/edit`);
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

      // If rejecting a REVISION_REQUESTED invoice, notify PURCHASING users
      if (selectedInvoice.status === 'REVISION_REQUESTED') {
        const vendor = vendors.find(v => v.id === selectedInvoice.vendor_id);
        const { data: purchasingUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['PURCHASING', 'SUPER_ADMIN']);
        if (purchasingUsers && purchasingUsers.length > 0) {
          await supabase.from('notifications').insert(
            purchasingUsers.map(r => ({
              user_id: r.user_id,
              title: language === 'en' ? 'AP Revision Rejected' : 'Revisi AP Ditolak',
              message: language === 'en'
                ? `Revision for AP invoice ${selectedInvoice.vendor_invoice_number} (${vendor?.vendor_name || 'Unknown'}) was rejected. Reason: ${rejectReason}`
                : `Revisi invoice AP ${selectedInvoice.vendor_invoice_number} (${vendor?.vendor_name || 'Unknown'}) ditolak. Alasan: ${rejectReason}`,
              type: 'revision_rejected',
              entity_type: 'ap_invoice',
              entity_id: selectedInvoice.id,
            }))
          );
        }
      }

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

      // Notify FINANCE users about the payment
      if (user?.role === 'PURCHASING') {
        try {
          const { data: financeUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role', ['FINANCE', 'SUPER_ADMIN']);

          if (financeUsers && financeUsers.length > 0) {
            const vendorName = vendors.find(v => v.id === selectedInvoice.vendor_id)?.vendor_name || '-';
            const notifications = financeUsers.map(fu => ({
              user_id: fu.user_id,
              title: language === 'en' ? 'AP Payment Recorded' : 'Pembayaran AP Dicatat',
              message: language === 'en'
                ? `Purchasing recorded payment of Rp ${amount.toLocaleString('id-ID')} for invoice ${selectedInvoice.vendor_invoice_number} (${vendorName})`
                : `Purchasing mencatat pembayaran Rp ${amount.toLocaleString('id-ID')} untuk invoice ${selectedInvoice.vendor_invoice_number} (${vendorName})`,
              type: 'info',
              entity_type: 'ap_invoice',
              entity_id: selectedInvoice.id,
            }));
            await supabase.from('notifications').insert(notifications);
          }
        } catch (notifError) {
          console.error('Failed to send notifications:', notifError);
        }
      }

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

  const activeTabStatuses = statusTabs.find(tab => tab.value === activeTab)?.statuses || [];
  
  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = 
      inv.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.vendor_invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.po_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = activeTabStatuses.includes(inv.status);
    return matchesSearch && matchesStatus;
  });

  const {
    paginatedItems: paginatedInvoices,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(filteredInvoices);

  const getTabCount = (statuses: InvoiceStatus[]) => {
    return invoices.filter(inv => statuses.includes(inv.status)).length;
  };

  const canEdit = (status: InvoiceStatus) => canEditAp(status);

  const canSubmit = (status: InvoiceStatus) => {
    if (user?.role === 'FINANCE') return false;
    return (isPurchasing || isAdmin) && status === 'DRAFT';
  };

  const canApprove = (status: InvoiceStatus) => {
    return isFinance && status === 'SUBMITTED';
  };

  const canDelete = (status: InvoiceStatus) => canDeleteAp(status);

  const canRecordPayment = (status: InvoiceStatus, outstanding: number) => {
    return (isFinance || isPurchasing) && (status === 'APPROVED' || status === 'PARTIAL') && outstanding > 0;
  };

  const canMarkAsPaid = (status: InvoiceStatus, outstanding: number, invoiceAmount: number) => {
    return (isFinance || isPurchasing) && (status === 'APPROVED' || status === 'PARTIAL') && outstanding === 0 && invoiceAmount === 0;
  };

  const handleMarkAsPaid = async (invoice: ApInvoice) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('ap_invoices')
        .update({
          status: 'PAID',
          paid_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', invoice.id);
      if (error) throw error;
      toast.success(language === 'en' ? 'Invoice marked as paid' : 'Invoice ditandai lunas');
      fetchData();
    } catch (error: any) {
      console.error('Error marking as paid:', error);
      toast.error(language === 'en' ? 'Failed to mark as paid' : 'Gagal menandai lunas');
    } finally {
      setSaving(false);
    }
  };

  const canPrintPaymentRequest = (status: InvoiceStatus) => {
    return status === 'SUBMITTED' || status === 'APPROVED';
  };

  const canRequestRevision = (status: InvoiceStatus) => {
    return (status === 'APPROVED' || status === 'PARTIAL') && (isPurchasing || isFinance || isAdmin);
  };

  const canApproveRevision = (status: InvoiceStatus) => {
    return status === 'REVISION_REQUESTED' && isAdmin;
  };

  const handleRequestRevision = async () => {
    if (!selectedInvoice || !revisionReason.trim()) {
      toast.error(language === 'en' ? 'Please provide revision reason' : 'Mohon berikan alasan revisi');
      return;
    }
    try {
      const { error } = await supabase
        .from('ap_invoices')
        .update({ status: 'REVISION_REQUESTED' as any, rejected_reason: revisionReason })
        .eq('id', selectedInvoice.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'REQUEST_REVISION',
        actor_id: user?.id || '',
        actor_role: user?.role || 'PURCHASING',
        entity_type: 'ap_invoice',
        entity_id: selectedInvoice.id,
        reason: revisionReason,
      });

      // Send notification to all ADMIN and SUPER_ADMIN users
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['ADMIN', 'SUPER_ADMIN']);
      
      if (adminRoles && adminRoles.length > 0) {
        const vendor = vendors.find(v => v.id === selectedInvoice.vendor_id);
        const notifications = adminRoles
          .filter(r => r.user_id !== user?.id)
          .map(r => ({
            user_id: r.user_id,
            title: 'Permintaan Revisi AP',
            message: `${user?.name} mengajukan revisi untuk invoice AP ${selectedInvoice.vendor_invoice_number} (${vendor?.vendor_name || 'Unknown'}). Alasan: ${revisionReason}`,
            type: 'revision_request',
            entity_type: 'ap_invoice',
            entity_id: selectedInvoice.id,
          }));
        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }

      toast.success(language === 'en' ? 'Revision requested' : 'Permintaan revisi berhasil diajukan');
      setIsRevisionDialogOpen(false);
      setRevisionReason('');
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error requesting revision:', error);
      toast.error(language === 'en' ? 'Failed to request revision' : 'Gagal mengajukan revisi');
    }
  };

  const handleApproveRevision = async (invoice: ApInvoice) => {
    try {
      const { error } = await supabase
        .from('ap_invoices')
        .update({ 
          status: 'DRAFT' as any, 
          approved_by: null, 
          approved_at: null,
          rejected_reason: null,
        })
        .eq('id', invoice.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'APPROVE_REVISION',
        actor_id: user?.id || '',
        actor_role: user?.role || 'ADMIN',
        entity_type: 'ap_invoice',
        entity_id: invoice.id,
        reason: 'Revision approved, reverted to DRAFT',
      });

      // Notify PURCHASING users that revision was approved
      const vendor = vendors.find(v => v.id === invoice.vendor_id);
      const { data: purchasingUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['PURCHASING', 'SUPER_ADMIN']);
      if (purchasingUsers && purchasingUsers.length > 0) {
        await supabase.from('notifications').insert(
          purchasingUsers.map(r => ({
            user_id: r.user_id,
            title: language === 'en' ? 'AP Revision Approved' : 'Revisi AP Disetujui',
            message: language === 'en'
              ? `Revision for AP invoice ${invoice.vendor_invoice_number} (${vendor?.vendor_name || 'Unknown'}) has been approved. Invoice reverted to Draft for editing.`
              : `Revisi invoice AP ${invoice.vendor_invoice_number} (${vendor?.vendor_name || 'Unknown'}) telah disetujui. Invoice kembali ke Draft untuk diedit.`,
            type: 'revision_approved',
            entity_type: 'ap_invoice',
            entity_id: invoice.id,
          }))
        );
      }

      toast.success(language === 'en' ? 'Revision approved, invoice reverted to Draft' : 'Revisi disetujui, invoice kembali ke Draft');
      fetchData();
    } catch (error: any) {
      console.error('Error approving revision:', error);
      toast.error(language === 'en' ? 'Failed to approve revision' : 'Gagal menyetujui revisi');
    }
  };

  const handleOpenPaymentRequest = (invoice: ApInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentRequestData({
      payment_method: 'transfer',
      bank_account_id: bankAccounts.length > 0 ? bankAccounts[0].id : '',
      transfer_amount: invoice.outstanding_amount.toString(),
      cash_amount: '',
      notes: invoice.notes || '',
    });
    setIsPaymentRequestDialogOpen(true);
  };

  const handleSubmitPaymentRequest = async () => {
    if (!selectedInvoice) return;

    const vendor = vendors.find(v => v.id === selectedInvoice.vendor_id);

    // Validate vendor bank details for transfer payment
    if (paymentRequestData.payment_method === 'transfer' && (!vendor?.bank_name || !vendor?.bank_account_no)) {
      toast.error(language === 'en' 
        ? 'Vendor bank details not available. Please update vendor master data first.' 
        : 'Data rekening vendor belum tersedia. Mohon update data master vendor terlebih dahulu.');
      return;
    }

    const transferAmount = parseFloat(paymentRequestData.transfer_amount) || 0;
    const cashAmount = parseFloat(paymentRequestData.cash_amount) || 0;

    if (transferAmount <= 0 && cashAmount <= 0) {
      toast.error(language === 'en' ? 'Please enter payment amount' : 'Mohon masukkan jumlah pembayaran');
      return;
    }
    
    try {
      setSaving(true);

      // Generate request number - format: PR-YYYYMM-XXXX
      const now = new Date();
      const prefix = `PR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
      
      // Get last number for current month
      const { data: existingRequests, error: fetchError } = await supabase
        .from('payment_requests')
        .select('request_no')
        .like('request_no', `${prefix}%`)
        .order('request_no', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      let nextNum = 1;
      if (existingRequests && existingRequests.length > 0) {
        const lastNo = existingRequests[0].request_no;
        const lastNum = parseInt(lastNo.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }

      const requestNo = `${prefix}${String(nextNum).padStart(4, '0')}`;

      // Calculate submitted amount
      const submittedAmount = transferAmount + cashAmount;

      // Save to database
      const { error: insertError } = await supabase
        .from('payment_requests')
        .insert({
          request_no: requestNo,
          ap_invoice_id: selectedInvoice.id,
          request_date: new Date().toISOString().split('T')[0],
          requested_by: user?.id || '',
          status: 'PENDING',
          notes: paymentRequestData.notes,
          submitted_amount: submittedAmount,
        } as any);

      if (insertError) throw insertError;

      // Generate and print PDF - use vendor bank details for transfer
      const requestData: PaymentRequestData = {
        requestNo: requestNo,
        requestDate: new Date().toISOString(),
        vendorName: selectedInvoice.vendor_name,
        vendorAddress: vendor?.address || undefined,
        vendorInvoiceNumber: selectedInvoice.vendor_invoice_number,
        poNumber: selectedInvoice.po_number,
        productName: selectedInvoice.product_name || undefined,
        spPoDate: selectedInvoice.sp_po_date,
        invoiceDate: selectedInvoice.invoice_date,
        dueDate: selectedInvoice.due_date,
        invoiceAmount: selectedInvoice.invoice_amount,
        outstandingAmount: selectedInvoice.outstanding_amount,
        overdueDays: selectedInvoice.overdue_days,
        notes: paymentRequestData.notes || undefined,
        companyName: companyProfile?.company_name || companyProfile?.brand_name || 'Company',
        companyAddress: companyProfile?.address || undefined,
        companyPhone: companyProfile?.phone || undefined,
        companyEmail: companyProfile?.email || undefined,
        companyLogoUrl: companyProfile?.logo_url || undefined,
        requestedBy: user?.name || 'User',
        status: selectedInvoice.status,
        paymentMethod: paymentRequestData.payment_method,
        // Use vendor bank details for transfer payment
        bankName: vendor?.bank_name || undefined,
        bankAccountNo: vendor?.bank_account_no || undefined,
        transferAmount: transferAmount > 0 ? transferAmount : undefined,
        cashAmount: cashAmount > 0 ? cashAmount : undefined,
        submittedAmount: submittedAmount,
      };

      const html = generatePaymentRequestHTML(requestData);
      
      // Download as PDF directly
      await downloadPaymentRequestPDF(html, `Pengajuan_Pembayaran_${requestNo}.pdf`);

      setIsPaymentRequestDialogOpen(false);
      toast.success(language === 'en' 
        ? `Payment request ${requestNo} created and PDF downloaded` 
        : `Pengajuan pembayaran ${requestNo} dibuat dan PDF didownload`);
    } catch (error: any) {
      console.error('Error creating payment request:', error);
      toast.error(language === 'en' 
        ? 'Failed to create payment request' 
        : 'Gagal membuat pengajuan pembayaran');
    } finally {
      setSaving(false);
    }
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
          {canCreateAp && (
            <Button variant="outline" className="gap-2" onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="w-4 h-4" />
              {language === 'en' ? 'Import' : 'Impor'}
            </Button>
          )}
          {canCreateAp && (
            <Button className="gap-2" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4" />
              {t('btn.newApInvoice')}
            </Button>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const count = getTabCount(tab.statuses);
          const isActive = activeTab === tab.value;
          return (
            <Button
              key={tab.value}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "gap-2",
                isActive && "bg-primary text-primary-foreground"
              )}
            >
              {tab.label[language]}
              <Badge 
                variant="secondary" 
                className={cn(
                  "ml-1 h-5 px-1.5 text-xs",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted"
                )}
              >
                {count}
              </Badge>
            </Button>
          );
        })}
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
                paginatedInvoices.map((invoice) => {
                  const prs = prByInvoice[invoice.id] || [];
                  const pendingCount = prs.filter(p => p.status === 'PENDING' || p.status === 'APPROVED' || p.status === 'DRAFT').length;
                  const paidCount = prs.filter(p => p.status === 'PAID').length;
                  const isExpanded = expandedInvoiceId === invoice.id;
                  return (
                  <React.Fragment key={invoice.id}>
                  <TableRow>
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
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn(invoice.outstanding_amount > 0 && 'text-warning font-medium')}>
                          {formatCurrency(invoice.outstanding_amount)}
                        </span>
                        {prs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedInvoiceId(isExpanded ? null : invoice.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted-foreground/10 text-muted-foreground"
                            title={language === 'en' ? 'View payment requests' : 'Lihat pengajuan pembayaran'}
                          >
                            PR: {pendingCount > 0 && `${pendingCount} ${language === 'en' ? 'active' : 'aktif'}`}
                            {pendingCount > 0 && paidCount > 0 && ' · '}
                            {paidCount > 0 && `${paidCount} paid`}
                            {' '}{isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                      </div>
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
                          <DropdownMenuItem className="gap-2" onClick={() => handleOpenView(invoice)}>
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
                          {canPrintPaymentRequest(invoice.status) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenPaymentRequest(invoice)}>
                              <Printer className="w-4 h-4" />
                              {language === 'en' ? 'Create Payment Request' : 'Buat Pengajuan Pembayaran'}
                            </DropdownMenuItem>
                          )}
                          {canRecordPayment(invoice.status, invoice.outstanding_amount) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenPayment(invoice)}>
                              <CreditCard className="w-4 h-4" />
                              {t('btn.recordPayment')}
                            </DropdownMenuItem>
                          )}
                          {canMarkAsPaid(invoice.status, invoice.outstanding_amount, invoice.invoice_amount) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleMarkAsPaid(invoice)}>
                              <Check className="w-4 h-4" />
                              {language === 'en' ? 'Mark as Paid' : 'Tandai Lunas'}
                            </DropdownMenuItem>
                          )}
                          {canRequestRevision(invoice.status) && (
                            <DropdownMenuItem 
                              className="gap-2 text-orange-600" 
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setRevisionReason('');
                                setIsRevisionDialogOpen(true);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                              {language === 'en' ? 'Request Revision' : 'Minta Revisi'}
                            </DropdownMenuItem>
                          )}
                          {canApproveRevision(invoice.status) && (
                            <>
                              <DropdownMenuItem className="gap-2 text-success" onClick={() => handleApproveRevision(invoice)}>
                                <Check className="w-4 h-4" />
                                {language === 'en' ? 'Approve Revision' : 'Setujui Revisi'}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="gap-2 text-destructive" 
                                onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setIsRejectDialogOpen(true);
                                }}
                              >
                                <X className="w-4 h-4" />
                                {language === 'en' ? 'Reject Revision' : 'Tolak Revisi'}
                              </DropdownMenuItem>
                            </>
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
          <TablePagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
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

          {!selectedInvoice && (
            <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg bg-muted/30">
              <InvoiceScanButton
                type="ap"
                onExtracted={(data) => {
                  setFormData(prev => ({
                    ...prev,
                    vendor_invoice_number: data.vendor_invoice_number || prev.vendor_invoice_number,
                    po_number: data.po_number || prev.po_number,
                    product_name: data.product_name || prev.product_name,
                    sp_po_date: data.sp_po_date || prev.sp_po_date,
                    invoice_date: data.invoice_date || prev.invoice_date,
                    invoice_amount: data.invoice_amount ? String(data.invoice_amount) : prev.invoice_amount,
                    notes: data.notes || prev.notes,
                  }));
                  // Auto-match vendor by name
                  if (data.vendor_name) {
                    const vendorNameLower = data.vendor_name.toLowerCase();
                    const matched = vendors.find(v => 
                      v.vendor_name.toLowerCase().includes(vendorNameLower) ||
                      vendorNameLower.includes(v.vendor_name.toLowerCase())
                    );
                    if (matched) {
                      setFormData(prev => ({ ...prev, vendor_id: matched.id }));
                      toast.success(language === 'en' ? `Vendor matched: ${matched.vendor_name}` : `Vendor ditemukan: ${matched.vendor_name}`);
                    } else {
                      toast.info(language === 'en' ? `Vendor "${data.vendor_name}" not found in database. Please select manually.` : `Vendor "${data.vendor_name}" tidak ditemukan di database. Silakan pilih manual.`);
                    }
                  }
                }}
              />
              <span className="text-sm text-muted-foreground">
                {language === 'en' ? 'Upload invoice image to auto-fill' : 'Upload gambar invoice untuk isi otomatis'}
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Vendor' : 'Vendor'} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {formData.vendor_id
                      ? vendors.find(v => v.id === formData.vendor_id)?.vendor_name
                      : (language === 'en' ? 'Select vendor' : 'Pilih vendor')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={language === 'en' ? 'Search vendor...' : 'Cari vendor...'} />
                    <CommandList>
                      <CommandEmpty>{language === 'en' ? 'No vendor found.' : 'Vendor tidak ditemukan.'}</CommandEmpty>
                      <CommandGroup>
                        {vendors.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={v.vendor_name}
                            onSelect={() => {
                              setFormData(prev => ({ ...prev, vendor_id: v.id }));
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", formData.vendor_id === v.id ? "opacity-100" : "opacity-0")} />
                            {v.vendor_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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

      {/* View Invoice Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Invoice Details' : 'Detail Invoice'}
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.vendor_name} - {selectedInvoice?.vendor_invoice_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Vendor' : 'Vendor'}</p>
                <p className="font-medium">{selectedInvoice.vendor_name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Vendor Invoice No.' : 'No. Invoice Vendor'}</p>
                <p className="font-medium">{selectedInvoice.vendor_invoice_number}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'PO Number' : 'No. PO'}</p>
                <p className="font-medium">{selectedInvoice.po_number}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Product Name' : 'Nama Produk'}</p>
                <p className="font-medium">{selectedInvoice.product_name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'SP/PO Date' : 'Tanggal SP/PO'}</p>
                <p className="font-medium">{formatDate(selectedInvoice.sp_po_date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Invoice Date' : 'Tanggal Invoice'}</p>
                <p className="font-medium">{formatDate(selectedInvoice.invoice_date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Due Date' : 'Jatuh Tempo'}</p>
                <p className="font-medium">{formatDate(selectedInvoice.due_date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={cn('text-xs', statusConfig[selectedInvoice.status]?.className)}>
                  {statusConfig[selectedInvoice.status]?.label[language] || selectedInvoice.status}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice'}</p>
                <p className="font-medium text-lg">{formatCurrency(selectedInvoice.invoice_amount)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Paid Amount' : 'Jumlah Dibayar'}</p>
                <p className="font-medium text-lg text-success">{formatCurrency(selectedInvoice.paid_amount)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Outstanding' : 'Sisa'}</p>
                <p className={cn('font-medium text-lg', selectedInvoice.outstanding_amount > 0 && 'text-warning')}>
                  {formatCurrency(selectedInvoice.outstanding_amount)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Overdue Days' : 'Hari Terlambat'}</p>
                <p className={cn('font-medium', selectedInvoice.overdue_days > 0 && 'text-destructive')}>
                  {selectedInvoice.overdue_days > 0 ? `${selectedInvoice.overdue_days} ${language === 'en' ? 'days' : 'hari'}` : '-'}
                </p>
              </div>
              {selectedInvoice.notes && (
                <div className="col-span-2 space-y-1">
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Notes' : 'Catatan'}</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              {t('btn.close')}
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

      {/* Revision Request Dialog */}
      <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Request Revision' : 'Minta Revisi'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Please provide a reason for revision request. After admin approval, the invoice will revert to Draft.' 
                : 'Mohon berikan alasan permintaan revisi. Setelah disetujui admin, invoice akan kembali ke Draft.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{language === 'en' ? 'Revision Reason' : 'Alasan Revisi'} *</Label>
            <Textarea 
              value={revisionReason} 
              onChange={(e) => setRevisionReason(e.target.value)}
              rows={3}
              placeholder={language === 'en' ? 'Enter revision reason...' : 'Masukkan alasan revisi...'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevisionDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleRequestRevision}>
              {language === 'en' ? 'Submit Request' : 'Ajukan Revisi'}
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

      {/* Payment Request Form Dialog */}
      <Dialog open={isPaymentRequestDialogOpen} onOpenChange={setIsPaymentRequestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Create Payment Request' : 'Buat Pengajuan Pembayaran'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Fill in payment request details' 
                : 'Isi detail pengajuan pembayaran'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (() => {
            const selectedVendor = vendors.find(v => v.id === selectedInvoice.vendor_id);
            return (
            <div className="space-y-4">
              {/* Invoice Info Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Vendor' : 'Vendor'}</p>
                  <p className="text-sm font-medium">{selectedInvoice.vendor_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Invoice No.' : 'No. Invoice'}</p>
                  <p className="text-sm font-medium">{selectedInvoice.vendor_invoice_number}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice'}</p>
                  <p className="text-sm font-medium">{formatCurrency(selectedInvoice.invoice_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Outstanding' : 'Sisa'}</p>
                  <p className="text-sm font-medium text-warning">{formatCurrency(selectedInvoice.outstanding_amount)}</p>
                </div>
              </div>

              {/* Vendor Bank Details (auto-populated from master data) */}
              {selectedVendor && (selectedVendor.bank_name || selectedVendor.bank_account_no) && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">
                    {language === 'en' ? 'Vendor Bank Account (from master data)' : 'Rekening Bank Vendor (dari master data)'}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{language === 'en' ? 'Bank Name' : 'Nama Bank'}</p>
                      <p className="text-sm font-medium">{selectedVendor.bank_name || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{language === 'en' ? 'Account Number' : 'No. Rekening'}</p>
                      <p className="text-sm font-medium">{selectedVendor.bank_account_no || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning if no bank details */}
              {selectedVendor && !selectedVendor.bank_name && !selectedVendor.bank_account_no && paymentRequestData.payment_method === 'transfer' && (
                <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                  <p className="text-xs text-warning">
                    {language === 'en' 
                      ? '⚠️ Vendor bank details not available. Please update vendor master data.' 
                      : '⚠️ Data rekening vendor belum tersedia. Mohon update data master vendor.'}
                  </p>
                </div>
              )}

              {/* Payment Method */}
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Payment Method' : 'Metode Pembayaran'} *</Label>
                <Select 
                  value={paymentRequestData.payment_method} 
                  onValueChange={(v: 'transfer' | 'cash') => setPaymentRequestData({...paymentRequestData, payment_method: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">{language === 'en' ? 'Bank Transfer' : 'Transfer Bank'}</SelectItem>
                    <SelectItem value="cash">{language === 'en' ? 'Cash' : 'Tunai'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Transfer Amount (only for transfer) */}
              {paymentRequestData.payment_method === 'transfer' && (
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Transfer Amount' : 'Jumlah Transfer'} *</Label>
                  <Input 
                    type="number"
                    value={paymentRequestData.transfer_amount} 
                    onChange={(e) => setPaymentRequestData({...paymentRequestData, transfer_amount: e.target.value})}
                  />
                </div>
              )}

              {/* Cash Amount (only for cash) */}
              {paymentRequestData.payment_method === 'cash' && (
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Cash Amount' : 'Jumlah Tunai'} *</Label>
                  <Input 
                    type="number"
                    value={paymentRequestData.cash_amount} 
                    onChange={(e) => setPaymentRequestData({...paymentRequestData, cash_amount: e.target.value})}
                  />
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Notes / Description' : 'Catatan / Keterangan'}</Label>
                <Textarea 
                  value={paymentRequestData.notes} 
                  onChange={(e) => setPaymentRequestData({...paymentRequestData, notes: e.target.value})}
                  rows={3}
                  placeholder={language === 'en' ? 'Enter payment request notes...' : 'Masukkan catatan pengajuan...'}
                />
              </div>
            </div>
            );
          })()}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentRequestDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleSubmitPaymentRequest} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              {language === 'en' ? 'Create & Print' : 'Buat & Cetak'}
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
