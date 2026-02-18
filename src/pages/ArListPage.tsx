import React, { useState, useEffect, useRef } from 'react';
import { TablePagination, usePagination } from '@/components/TablePagination';
import { Plus, Search, Filter, Eye, Edit, Trash2, Mail, FileText, MoreHorizontal, Loader2, Check, X, Download, Upload, CreditCard, FileDown, MessageCircle, Phone, Send } from 'lucide-react';
import { InvoiceScanButton } from '@/components/InvoiceScanButton';
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
import { parseExcelFile, validateAndMapArData, generateArTemplate, ImportError } from '@/lib/importUtils';
import { 
  generateLetterNumber, 
  generateBillingLetterHTML, 
  generateWhatsAppMessage, 
  openWhatsApp, 
  printBillingLetter,
  downloadBillingLetterPDF,
  sanitizePrintableHtml,
  BillingLetterData 
} from '@/lib/billingUtils';
import type { Database } from '@/integrations/supabase/types';

interface BankAccount {
  id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
}

interface Customer {
  id: string;
  customer_name: string;
  billing_email: string | null;
  address: string | null;
}

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
  doc_sent_date: string | null;
}

interface Customer {
  id: string;
  customer_name: string;
  billing_email: string | null;
  address: string | null;
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

type StatusTab = 'ALL' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'DOC_SENT' | 'PAID';

const statusTabs: { value: StatusTab; label: { en: string; id: string }; statuses: InvoiceStatus[] }[] = [
  { value: 'ALL', label: { en: 'All', id: 'Semua' }, statuses: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIAL', 'PAID', 'CANCELLED', 'REVISION_REQUESTED'] },
  { value: 'DRAFT', label: { en: 'Draft', id: 'Draft' }, statuses: ['DRAFT', 'REJECTED'] },
  { value: 'SUBMITTED', label: { en: 'Submitted', id: 'Diajukan' }, statuses: ['SUBMITTED', 'REVISION_REQUESTED'] },
  { value: 'APPROVED', label: { en: 'Approved', id: 'Disetujui' }, statuses: ['APPROVED', 'PARTIAL'] },
  { value: 'DOC_SENT', label: { en: 'Doc Sent', id: 'Dok. Terkirim' }, statuses: ['APPROVED', 'PARTIAL'] },
  { value: 'PAID', label: { en: 'Paid', id: 'Lunas' }, statuses: ['PAID'] },
];

export default function ArListPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [invoices, setInvoices] = useState<ArInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesList, setSalesList] = useState<Sales[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);
  const [isBillingPreviewOpen, setIsBillingPreviewOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isDocSentDialogOpen, setIsDocSentDialogOpen] = useState(false);
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [docSentDate, setDocSentDate] = useState('');
  const [docSentInvoiceAmount, setDocSentInvoiceAmount] = useState<number>(0);
  const [selectedInvoice, setSelectedInvoice] = useState<ArInvoice | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [emailData, setEmailData] = useState({
    to_email: '',
    cc_email: '',
    subject: '',
  });

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

  const [receiptData, setReceiptData] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    amount: '',
    bank_account_id: '',
    reference_no: '',
    notes: '',
  });

  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  // PURCHASING can view AR but cannot create/edit/delete
  const canCreateAr = isFinance || isAdmin;

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
        .select('id, customer_name, billing_email, address')
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

      // Fetch bank accounts
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_no, account_name')
        .eq('is_active', true)
        .order('bank_name');

      setBankAccounts(bankData || []);

      // Fetch company profile for billing letters
      const { data: profileData } = await supabase
        .from('company_profile')
        .select('*')
        .limit(1)
        .single();

      setCompanyProfile(profileData);

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

  const handleOpenView = (invoice: ArInvoice) => {
    setSelectedInvoice(invoice);
    setIsViewDialogOpen(true);
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

  const activeTabStatuses = statusTabs.find(tab => tab.value === activeTab)?.statuses || [];
  
  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = 
      inv.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.order_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = activeTabStatuses.includes(inv.status);
    
    // Special filtering for APPROVED vs DOC_SENT tabs
    if (activeTab === 'APPROVED') {
      return matchesSearch && matchesStatus && !inv.doc_sent_date;
    }
    if (activeTab === 'DOC_SENT') {
      return matchesSearch && matchesStatus && !!inv.doc_sent_date;
    }
    
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

  const getTabCount = (tab: StatusTab, statuses: InvoiceStatus[]) => {
    if (tab === 'APPROVED') {
      return invoices.filter(inv => statuses.includes(inv.status) && !inv.doc_sent_date).length;
    }
    if (tab === 'DOC_SENT') {
      return invoices.filter(inv => statuses.includes(inv.status) && !!inv.doc_sent_date).length;
    }
    return invoices.filter(inv => statuses.includes(inv.status)).length;
  };

  const canEdit = (status: InvoiceStatus) => {
    if (user?.role === 'PURCHASING') return false;
    return (isFinance || isAdmin) && (status === 'DRAFT' || status === 'REJECTED');
  };

  const canSubmit = (status: InvoiceStatus) => {
    if (user?.role === 'PURCHASING') return false;
    return (isFinance || isAdmin) && status === 'DRAFT';
  };

  const canApprove = (status: InvoiceStatus) => {
    return isFinance && status === 'SUBMITTED';
  };

  const canDelete = (status: InvoiceStatus) => {
    if (user?.role === 'PURCHASING') return false;
    return isSuperAdmin || (isFinance && (status === 'DRAFT' || status === 'REJECTED')) || (isAdmin && (status === 'DRAFT' || status === 'REJECTED'));
  };

  const canMarkDocSent = (invoice: ArInvoice) => {
    return isFinance && (invoice.status === 'APPROVED' || invoice.status === 'PARTIAL') && !invoice.doc_sent_date;
  };

  const canEditDocSent = (invoice: ArInvoice) => {
    return isFinance && (invoice.status === 'APPROVED' || invoice.status === 'PARTIAL') && !!invoice.doc_sent_date;
  };

  const handleOpenDocSent = (invoice: ArInvoice) => {
    setSelectedInvoice(invoice);
    setDocSentDate(new Date().toISOString().split('T')[0]);
    setDocSentInvoiceAmount(invoice.invoice_amount);
    setIsDocSentDialogOpen(true);
  };

  const handleSaveDocSent = async () => {
    if (!selectedInvoice || !docSentDate) {
      toast.error(language === 'en' ? 'Please select a date' : 'Mohon pilih tanggal');
      return;
    }
    if (docSentInvoiceAmount <= 0) {
      toast.error(language === 'en' ? 'Invoice amount must be greater than 0' : 'Nilai invoice harus lebih dari 0');
      return;
    }

    try {
      setSaving(true);
      const newOutstanding = docSentInvoiceAmount - selectedInvoice.paid_amount;
      const { error } = await supabase
        .from('ar_invoices')
        .update({ 
          doc_sent_date: docSentDate,
          invoice_amount: docSentInvoiceAmount,
          outstanding_amount: newOutstanding > 0 ? newOutstanding : 0,
          overdue_amount: newOutstanding > 0 ? newOutstanding : 0,
        } as any)
        .eq('id', selectedInvoice.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Document sent date saved' : 'Tanggal dokumen terkirim berhasil disimpan');
      setIsDocSentDialogOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving doc sent date:', error);
      toast.error(language === 'en' ? 'Failed to save' : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelDocSent = async () => {
    if (!selectedInvoice) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('ar_invoices')
        .update({ doc_sent_date: null } as any)
        .eq('id', selectedInvoice.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Document sent date cleared' : 'Tanggal dokumen terkirim berhasil dibatalkan');
      setIsDocSentDialogOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error clearing doc sent date:', error);
      toast.error(language === 'en' ? 'Failed to clear' : 'Gagal membatalkan');
    } finally {
      setSaving(false);
    }
  };

  const canSendBilling = (status: InvoiceStatus, outstanding: number) => {
    return isFinance && status !== 'PAID' && outstanding > 0;
  };

  const canRecordReceipt = (status: InvoiceStatus, outstanding: number) => {
    return isFinance && (status === 'APPROVED' || status === 'PARTIAL') && outstanding > 0;
  };

  const canRequestRevision = (status: InvoiceStatus) => {
    return (status === 'APPROVED' || status === 'PARTIAL') && (isFinance || isAdmin);
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
        .from('ar_invoices')
        .update({ status: 'REVISION_REQUESTED' as any, rejected_reason: revisionReason })
        .eq('id', selectedInvoice.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'REQUEST_REVISION',
        actor_id: user?.id || '',
        actor_role: user?.role || 'FINANCE',
        entity_type: 'ar_invoice',
        entity_id: selectedInvoice.id,
        reason: revisionReason,
      });

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

  const handleApproveRevision = async (invoice: ArInvoice) => {
    try {
      const { error } = await supabase
        .from('ar_invoices')
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
        entity_type: 'ar_invoice',
        entity_id: invoice.id,
        reason: 'Revision approved, reverted to DRAFT',
      });

      toast.success(language === 'en' ? 'Revision approved, invoice reverted to Draft' : 'Revisi disetujui, invoice kembali ke Draft');
      fetchData();
    } catch (error: any) {
      console.error('Error approving revision:', error);
      toast.error(language === 'en' ? 'Failed to approve revision' : 'Gagal menyetujui revisi');
    }
  };

  const handleOpenReceipt = (invoice: ArInvoice) => {
    setSelectedInvoice(invoice);
    setReceiptData({
      receipt_date: new Date().toISOString().split('T')[0],
      amount: invoice.outstanding_amount.toString(),
      bank_account_id: '',
      reference_no: '',
      notes: '',
    });
    setIsReceiptDialogOpen(true);
  };

  const handleRecordReceipt = async () => {
    if (!selectedInvoice || !receiptData.amount || !receiptData.bank_account_id || !receiptData.receipt_date) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Mohon isi semua field yang wajib');
      return;
    }

    const amount = parseFloat(receiptData.amount);
    if (amount <= 0 || amount > selectedInvoice.outstanding_amount) {
      toast.error(language === 'en' ? 'Invalid receipt amount' : 'Jumlah penerimaan tidak valid');
      return;
    }

    try {
      setSaving(true);

      // Create receipt record
      const { data: receipt, error: receiptError } = await supabase
        .from('ar_receipts')
        .insert([{
          receipt_date: receiptData.receipt_date,
          total_amount: amount,
          bank_account_id: receiptData.bank_account_id,
          reference_no: receiptData.reference_no || null,
          notes: receiptData.notes || null,
          created_by: user?.id || '',
        }])
        .select()
        .single();

      if (receiptError) throw receiptError;

      // Create allocation
      const { error: allocError } = await supabase
        .from('ar_receipt_allocations')
        .insert([{
          receipt_id: receipt.id,
          ar_invoice_id: selectedInvoice.id,
          amount: amount,
        }]);

      if (allocError) throw allocError;

      // Update invoice
      const newPaidAmount = selectedInvoice.paid_amount + amount;
      const newOutstanding = selectedInvoice.invoice_amount - newPaidAmount;
      const newStatus = newOutstanding <= 0 ? 'PAID' : 'PARTIAL';

      const { error: updateError } = await supabase
        .from('ar_invoices')
        .update({
          paid_amount: newPaidAmount,
          outstanding_amount: newOutstanding,
          status: newStatus,
          paid_date: newStatus === 'PAID' ? receiptData.receipt_date : null,
        })
        .eq('id', selectedInvoice.id);

      if (updateError) throw updateError;

      toast.success(language === 'en' ? 'Receipt recorded successfully' : 'Penerimaan berhasil dicatat');
      setIsReceiptDialogOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error: any) {
      console.error('Error recording receipt:', error);
      toast.error(language === 'en' ? 'Failed to record receipt' : 'Gagal mencatat penerimaan');
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
      const result = validateAndMapArData(rows, customers, salesList, paymentTerms);

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
        .from('ar_invoices')
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

  const handleOpenBilling = (invoice: ArInvoice) => {
    setSelectedInvoice(invoice);
    setIsBillingDialogOpen(true);
  };

  const getBillingLetterData = (): BillingLetterData | null => {
    if (!selectedInvoice) return null;
    
    const customer = customers.find(c => c.id === selectedInvoice.customer_id);
    
    return {
      letterNo: generateLetterNumber(),
      letterDate: new Date().toISOString().split('T')[0],
      customerName: selectedInvoice.customer_name,
      customerAddress: customer?.address || undefined,
      invoiceNumber: selectedInvoice.invoice_number,
      invoiceDate: selectedInvoice.invoice_date,
      dueDate: selectedInvoice.due_date,
      invoiceAmount: selectedInvoice.invoice_amount,
      outstandingAmount: selectedInvoice.outstanding_amount,
      overdueDays: selectedInvoice.overdue_days,
      companyName: companyProfile?.company_name || 'PT. Kemika Karya Pratama',
      companyAddress: companyProfile?.address,
      companyPhone: companyProfile?.phone,
      companyEmail: companyProfile?.email,
    };
  };

  const handleSaveBillingLetter = async () => {
    if (!selectedInvoice || !user) return;
    
    const letterNo = generateLetterNumber();
    
    try {
      const { error } = await supabase
        .from('billing_letters')
        .insert({
          ar_invoice_id: selectedInvoice.id,
          letter_no: letterNo,
          letter_date: new Date().toISOString().split('T')[0],
          created_by: user.id,
          status: 'DRAFT',
        });
      
      if (error) throw error;
      
      toast.success(language === 'en' ? 'Billing letter created' : 'Surat tagihan dibuat');
      return letterNo;
    } catch (error: any) {
      console.error('Error saving billing letter:', error);
      toast.error(language === 'en' ? 'Failed to save billing letter' : 'Gagal menyimpan surat tagihan');
      return null;
    }
  };

  const handleOpenEmailDialog = (invoice: ArInvoice) => {
    setSelectedInvoice(invoice);
    const customer = customers.find(c => c.id === invoice.customer_id);
    setEmailData({
      to_email: customer?.billing_email || '',
      cc_email: '',
      subject: `Surat Penagihan - Invoice ${invoice.invoice_number}`,
    });
    setIsEmailDialogOpen(true);
  };

  const handleSendEmail = async () => {
    if (!selectedInvoice || !emailData.to_email) {
      toast.error(language === 'en' ? 'Please enter recipient email' : 'Mohon isi email tujuan');
      return;
    }

    setSendingEmail(true);
    
    try {
      const data = getBillingLetterData();
      if (!data) throw new Error('No billing data');

      const htmlContent = generateBillingLetterHTML(data);
      const bodyPreview = `Surat Penagihan untuk ${selectedInvoice.customer_name} - Invoice ${selectedInvoice.invoice_number}`;

      const { data: result, error } = await supabase.functions.invoke('send-billing-email', {
        body: {
          ar_invoice_id: selectedInvoice.id,
          to_email: emailData.to_email,
          cc_email: emailData.cc_email || undefined,
          subject: emailData.subject,
          html_content: htmlContent,
          body_preview: bodyPreview,
        },
      });

      if (error) throw error;

      if (result?.success) {
        toast.success(language === 'en' ? 'Email sent successfully' : 'Email berhasil dikirim');
        setIsEmailDialogOpen(false);
        setIsBillingDialogOpen(false);
      } else {
        throw new Error(result?.error || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error(error.message || (language === 'en' ? 'Failed to send email' : 'Gagal mengirim email'));
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePreviewBillingLetter = () => {
    const data = getBillingLetterData();
    if (!data) return;
    
    setIsBillingPreviewOpen(true);
  };

  const handlePrintBillingLetter = () => {
    const data = getBillingLetterData();
    if (!data) return;
    
    const html = generateBillingLetterHTML(data);
    printBillingLetter(html);
    toast.success(language === 'en' ? 'Billing letter opened for printing' : 'Surat tagihan dibuka untuk cetak');
  };

  const handleDownloadBillingPDF = async () => {
    const data = getBillingLetterData();
    if (!data) return;
    
    const html = generateBillingLetterHTML(data);
    const filename = `Billing_Letter_${data.invoiceNumber}_${data.letterDate}`;
    await downloadBillingLetterPDF(html, filename);
    toast.success(language === 'en' ? 'PDF download initiated' : 'Unduhan PDF dimulai');
  };

  const handleSendWhatsApp = (phone?: string) => {
    const data = getBillingLetterData();
    if (!data) return;
    
    const message = generateWhatsAppMessage(data);
    
    if (phone) {
      openWhatsApp(phone, message);
    } else {
      // Copy message to clipboard if no phone
      navigator.clipboard.writeText(message);
      toast.success(language === 'en' ? 'Message copied to clipboard' : 'Pesan disalin ke clipboard');
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
        <div className="flex gap-2">
          {canCreateAr && (
            <Button variant="outline" className="gap-2" onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="w-4 h-4" />
              {language === 'en' ? 'Import' : 'Impor'}
            </Button>
          )}
          {canCreateAr && (
            <Button className="gap-2" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4" />
              {t('btn.newArInvoice')}
            </Button>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const count = getTabCount(tab.value, tab.statuses);
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
                paginatedInvoices.map((invoice) => (
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
                      {invoice.doc_sent_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === 'en' ? 'Sent' : 'Terkirim'}: {formatDate(invoice.doc_sent_date)}
                        </p>
                      )}
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
                          {canMarkDocSent(invoice) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenDocSent(invoice)}>
                              <Send className="w-4 h-4" />
                              {language === 'en' ? 'Mark Doc Sent' : 'Dokumen Terkirim'}
                            </DropdownMenuItem>
                          )}
                          {canEditDocSent(invoice) && (
                            <DropdownMenuItem className="gap-2" onClick={() => {
                              setSelectedInvoice(invoice);
                              setDocSentDate(invoice.doc_sent_date || '');
                              setDocSentInvoiceAmount(invoice.invoice_amount);
                              setIsDocSentDialogOpen(true);
                            }}>
                              <Edit className="w-4 h-4" />
                              {language === 'en' ? 'Edit/Cancel Doc Sent' : 'Ubah/Batalkan Dok. Terkirim'}
                            </DropdownMenuItem>
                          )}
                          {canSendBilling(invoice.status, invoice.outstanding_amount) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenBilling(invoice)}>
                              <FileText className="w-4 h-4" />
                              {t('btn.generateBillingLetter')}
                            </DropdownMenuItem>
                          )}
                          {canRecordReceipt(invoice.status, invoice.outstanding_amount) && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleOpenReceipt(invoice)}>
                              <CreditCard className="w-4 h-4" />
                              {t('btn.recordReceipt')}
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
                ? (language === 'en' ? 'Edit AR Invoice' : 'Edit Invoice AR')
                : (language === 'en' ? 'New AR Invoice' : 'Invoice AR Baru')}
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
                type="ar"
                onExtracted={(data) => {
                  setFormData(prev => ({
                    ...prev,
                    invoice_number: data.invoice_number || prev.invoice_number,
                    order_number: data.order_number || prev.order_number,
                    sp_po_date: data.sp_po_date || prev.sp_po_date,
                    invoice_date: data.invoice_date || prev.invoice_date,
                    invoice_amount: data.invoice_amount ? String(data.invoice_amount) : prev.invoice_amount,
                    notes: data.notes || prev.notes,
                  }));
                }}
              />
              <span className="text-sm text-muted-foreground">
                {language === 'en' ? 'Upload invoice image to auto-fill' : 'Upload gambar invoice untuk isi otomatis'}
              </span>
            </div>
          )}

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

      {/* View Invoice Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Invoice Details' : 'Detail Invoice'}
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.customer_name} - {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Customer' : 'Customer'}</p>
                <p className="font-medium">{selectedInvoice.customer_name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Sales' : 'Sales'}</p>
                <p className="font-medium">{selectedInvoice.sales_name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Invoice Number' : 'No. Invoice'}</p>
                <p className="font-medium">{selectedInvoice.invoice_number}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Order Number' : 'No. Order'}</p>
                <p className="font-medium">{selectedInvoice.order_number}</p>
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

      {/* Receipt Dialog */}
      <Dialog open={isReceiptDialogOpen} onOpenChange={setIsReceiptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Record Receipt' : 'Catat Penerimaan'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? `Outstanding: ${formatCurrency(selectedInvoice?.outstanding_amount || 0)}` 
                : `Sisa: ${formatCurrency(selectedInvoice?.outstanding_amount || 0)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Receipt Date' : 'Tanggal Penerimaan'} *</Label>
              <Input 
                type="date"
                value={receiptData.receipt_date} 
                onChange={(e) => setReceiptData({...receiptData, receipt_date: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Amount' : 'Jumlah'} *</Label>
              <Input 
                type="number"
                value={receiptData.amount} 
                onChange={(e) => setReceiptData({...receiptData, amount: e.target.value})}
                max={selectedInvoice?.outstanding_amount}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Bank Account' : 'Rekening Bank'} *</Label>
              <Select value={receiptData.bank_account_id} onValueChange={(v) => setReceiptData({...receiptData, bank_account_id: v})}>
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
                value={receiptData.reference_no} 
                onChange={(e) => setReceiptData({...receiptData, reference_no: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
              <Textarea 
                value={receiptData.notes} 
                onChange={(e) => setReceiptData({...receiptData, notes: e.target.value})}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReceiptDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleRecordReceipt} disabled={saving}>
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
              {language === 'en' ? 'Import AR Invoices' : 'Impor Invoice AR'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Upload Excel file with Indonesian headers format' 
                : 'Upload file Excel dengan format header Indonesia'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="outline" className="gap-2 w-full" onClick={generateArTemplate}>
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
                id="import-ar-file"
              />
              <label htmlFor="import-ar-file" className="cursor-pointer">
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

      {/* Billing Letter Dialog */}
      <Dialog open={isBillingDialogOpen} onOpenChange={setIsBillingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Billing Letter' : 'Surat Penagihan'}
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice && (
                <>
                  {selectedInvoice.customer_name} - {selectedInvoice.invoice_number}
                  <br />
                  <span className="font-medium">
                    {formatCurrency(selectedInvoice.outstanding_amount)}
                  </span>
                  {selectedInvoice.overdue_days > 0 && (
                    <span className="text-destructive ml-2">
                      ({selectedInvoice.overdue_days} {language === 'en' ? 'days overdue' : 'hari terlambat'})
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full gap-2 justify-start" 
              onClick={handlePreviewBillingLetter}
            >
              <Eye className="w-4 h-4" />
              {language === 'en' ? 'Preview Letter' : 'Lihat Surat'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full gap-2 justify-start" 
              onClick={handlePrintBillingLetter}
            >
              <FileText className="w-4 h-4" />
              {language === 'en' ? 'Print' : 'Cetak'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full gap-2 justify-start" 
              onClick={handleDownloadBillingPDF}
            >
              <FileDown className="w-4 h-4" />
              {language === 'en' ? 'Download PDF' : 'Unduh PDF'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full gap-2 justify-start" 
              onClick={() => handleSendWhatsApp()}
            >
              <MessageCircle className="w-4 h-4" />
              {language === 'en' ? 'Copy WhatsApp Message' : 'Salin Pesan WhatsApp'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full gap-2 justify-start text-primary" 
              onClick={() => {
                setIsBillingDialogOpen(false);
                if (selectedInvoice) {
                  handleOpenEmailDialog(selectedInvoice);
                }
              }}
            >
              <Send className="w-4 h-4" />
              {language === 'en' ? 'Send via Email' : 'Kirim via Email'}
            </Button>
            <Button 
              className="w-full gap-2 justify-start" 
              onClick={async () => {
                const letterNo = await handleSaveBillingLetter();
                if (letterNo) {
                  setIsBillingDialogOpen(false);
                }
              }}
            >
              <FileText className="w-4 h-4" />
              {language === 'en' ? 'Save Billing Letter' : 'Simpan Surat Tagihan'}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBillingDialogOpen(false)}>
              {t('btn.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Letter Preview Dialog */}
      <Dialog open={isBillingPreviewOpen} onOpenChange={setIsBillingPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Billing Letter Preview' : 'Preview Surat Tagihan'}
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.customer_name} - {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && getBillingLetterData() && (
            <iframe
              srcDoc={sanitizePrintableHtml(generateBillingLetterHTML(getBillingLetterData()!))}
              className="w-full min-h-[600px] bg-white rounded border"
              title="Billing Letter Preview"
              sandbox="allow-same-origin"
            />
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsBillingPreviewOpen(false)}>
              {t('btn.close')}
            </Button>
            <Button variant="outline" onClick={handlePrintBillingLetter}>
              <FileText className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Print' : 'Cetak'}
            </Button>
            <Button onClick={handleDownloadBillingPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Download PDF' : 'Unduh PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {language === 'en' ? 'Send Billing Email' : 'Kirim Email Tagihan'}
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice && (
                <>
                  {selectedInvoice.customer_name} - {selectedInvoice.invoice_number}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'To Email' : 'Email Tujuan'} *</Label>
              <Input 
                type="email"
                value={emailData.to_email}
                onChange={(e) => setEmailData({...emailData, to_email: e.target.value})}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>CC</Label>
              <Input 
                type="email"
                value={emailData.cc_email}
                onChange={(e) => setEmailData({...emailData, cc_email: e.target.value})}
                placeholder="cc@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Subject' : 'Subjek'} *</Label>
              <Input 
                value={emailData.subject}
                onChange={(e) => setEmailData({...emailData, subject: e.target.value})}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {language === 'en' 
                ? 'The billing letter will be sent as the email body in HTML format.'
                : 'Surat tagihan akan dikirim sebagai isi email dalam format HTML.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail || !emailData.to_email}>
              {sendingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Send' : 'Kirim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Doc Sent Date Dialog */}
      <Dialog open={isDocSentDialogOpen} onOpenChange={setIsDocSentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedInvoice?.doc_sent_date
                ? (language === 'en' ? 'Edit / Cancel Document Sent' : 'Ubah / Batalkan Dokumen Terkirim')
                : (language === 'en' ? 'Mark Document as Sent' : 'Tandai Dokumen Terkirim')}
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.doc_sent_date
                ? (language === 'en'
                  ? 'You can change the sent date or cancel (clear) it to move the invoice back to Approved.'
                  : 'Anda dapat mengubah tanggal terkirim atau membatalkannya agar invoice kembali ke tab Approved.')
                : (language === 'en'
                  ? 'Enter the date when the invoice document was sent to the customer.'
                  : 'Masukkan tanggal pengiriman dokumen invoice ke customer.')}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <p><span className="font-medium">{language === 'en' ? 'Customer' : 'Customer'}:</span> {selectedInvoice.customer_name}</p>
                <p><span className="font-medium">{language === 'en' ? 'Invoice' : 'Invoice'}:</span> {selectedInvoice.invoice_number}</p>
              </div>

              <div className="space-y-2">
                <Label>{language === 'en' ? 'Invoice Amount' : 'Nilai Invoice'} *</Label>
                <Input
                  type="number"
                  min={0}
                  value={docSentInvoiceAmount}
                  onChange={(e) => setDocSentInvoiceAmount(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>{language === 'en' ? 'Document Sent Date' : 'Tanggal Dokumen Terkirim'} *</Label>
                <Input
                  type="date"
                  value={docSentDate}
                  onChange={(e) => setDocSentDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedInvoice?.doc_sent_date && (
              <Button variant="destructive" onClick={handleCancelDocSent} disabled={saving} className="gap-2 sm:mr-auto">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <X className="w-4 h-4" />
                {language === 'en' ? 'Clear Date' : 'Batalkan Tanggal'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsDocSentDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleSaveDocSent} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <Send className="w-4 h-4" />
              {language === 'en' ? 'Save' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
