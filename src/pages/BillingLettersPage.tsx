import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Printer, Trash2, Loader2, FileText, Plus, Download, MessageCircle, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  generateBillingLetterHTML, 
  generateMultiBillingLetterHTML,
  printBillingLetter,
  downloadBillingLetterPDF,
  generateWhatsAppMessage,
  generateMultiWhatsAppMessage,
  openWhatsApp,
  sanitizePrintableHtml,
  formatCurrencyIDR,
  formatDateID,
  generateLetterNumber,
  calcOverdueDays,
  BillingLetterData,
  MultiBillingLetterData,
} from '@/lib/billingUtils';
import type { Database } from '@/integrations/supabase/types';

type RecordStatus = Database['public']['Enums']['record_status'];

interface BillingLetter {
  id: string;
  letter_no: string;
  letter_date: string;
  ar_invoice_id: string;
  ar_invoice_ids: string[] | null;
  customer_id: string | null;
  total_outstanding: number;
  invoice_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string | null;
  invoice_amount: number;
  outstanding_amount: number;
  invoice_date: string;
  due_date: string;
  overdue_days: number;
  status: RecordStatus;
  notes: string | null;
  created_at: string;
  created_by: string;
  is_multi: boolean;
}

interface ArInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  outstanding_amount: number;
  overdue_days: number;
}

interface CustomerInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  outstanding_amount: number;
  overdue_days: number;
}

interface Customer {
  id: string;
  customer_name: string;
  address: string | null;
  phone: string | null;
}

interface CompanyProfile {
  company_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

const statusConfig: Record<RecordStatus, { label: { en: string; id: string }; className: string }> = {
  DRAFT: { label: { en: 'Draft', id: 'Draft' }, className: 'badge-draft' },
  SUBMITTED: { label: { en: 'Sent', id: 'Terkirim' }, className: 'badge-submitted' },
  APPROVED: { label: { en: 'Approved', id: 'Disetujui' }, className: 'badge-approved' },
  REJECTED: { label: { en: 'Rejected', id: 'Ditolak' }, className: 'badge-rejected' },
  PARTIAL: { label: { en: 'Partial', id: 'Sebagian' }, className: 'badge-partial' },
  PAID: { label: { en: 'Paid', id: 'Lunas' }, className: 'badge-paid' },
  CANCELLED: { label: { en: 'Cancelled', id: 'Dibatalkan' }, className: 'badge-rejected' },
  REVISION_REQUESTED: { label: { en: 'Revision Requested', id: 'Minta Revisi' }, className: 'badge-submitted' },
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('id-ID');
};

export default function BillingLettersPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [letters, setLetters] = useState<BillingLetter[]>([]);
  const [arInvoices, setArInvoices] = useState<ArInvoice[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<BillingLetter | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  // Multi-invoice states
  const [isMultiCreateOpen, setIsMultiCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerInvoices, setCustomerInvoices] = useState<CustomerInvoice[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: lettersData, error: lettersError } = await supabase
        .from('billing_letters')
        .select(`
          *,
          ar_invoices (
            invoice_number,
            invoice_amount,
            outstanding_amount,
            invoice_date,
            due_date,
            overdue_days,
            customers (
              customer_name,
              address,
              phone
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (lettersError) throw lettersError;

      const formattedLetters: BillingLetter[] = (lettersData || []).map((letter: any) => ({
        id: letter.id,
        letter_no: letter.letter_no,
        letter_date: letter.letter_date,
        ar_invoice_id: letter.ar_invoice_id,
        ar_invoice_ids: letter.ar_invoice_ids,
        customer_id: letter.customer_id,
        total_outstanding: letter.total_outstanding || 0,
        invoice_number: letter.ar_invoices?.invoice_number || '',
        customer_name: letter.ar_invoices?.customers?.customer_name || 'Unknown',
        customer_address: letter.ar_invoices?.customers?.address || null,
        customer_phone: letter.ar_invoices?.customers?.phone || null,
        invoice_amount: letter.ar_invoices?.invoice_amount || 0,
        outstanding_amount: letter.ar_invoices?.outstanding_amount || 0,
        invoice_date: letter.ar_invoices?.invoice_date || '',
        due_date: letter.ar_invoices?.due_date || '',
        overdue_days: calcOverdueDays(letter.ar_invoices?.due_date || '', letter.ar_invoices?.outstanding_amount || 0),
        status: letter.status,
        notes: letter.notes,
        created_at: letter.created_at,
        created_by: letter.created_by,
        is_multi: !!(letter.ar_invoice_ids && letter.ar_invoice_ids.length > 0),
      }));

      setLetters(formattedLetters);

      // Fetch AR invoices for single create dialog
      const { data: invoicesData } = await supabase
        .from('ar_invoices')
        .select(`id, invoice_number, outstanding_amount, overdue_days, customers (customer_name)`)
        .gt('outstanding_amount', 0)
        .in('status', ['APPROVED', 'PARTIAL'])
        .order('invoice_number');

      setArInvoices((invoicesData || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_name: inv.customers?.customer_name || 'Unknown',
        outstanding_amount: inv.outstanding_amount,
        overdue_days: inv.overdue_days,
      })));

      // Fetch customers for multi-invoice
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, customer_name, address, phone')
        .eq('is_active', true)
        .order('customer_name');

      setCustomers(customersData || []);

      // Fetch company profile
      const { data: profileData } = await supabase
        .from('company_profile')
        .select('company_name, address, phone, email, logo_url')
        .limit(1)
        .maybeSingle();

      setCompanyProfile(profileData);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch invoices when customer is selected in multi-invoice dialog
  const fetchCustomerInvoices = async (customerId: string) => {
    setLoadingInvoices(true);
    setSelectedInvoiceIds([]);
    try {
      const { data, error } = await supabase
        .from('ar_invoices')
        .select('id, invoice_number, invoice_date, due_date, invoice_amount, outstanding_amount, overdue_days')
        .eq('customer_id', customerId)
        .gt('outstanding_amount', 0)
        .in('status', ['APPROVED', 'PARTIAL'])
        .order('invoice_date');

      if (error) throw error;
      setCustomerInvoices(data || []);
    } catch (error) {
      console.error('Error fetching customer invoices:', error);
      toast.error('Gagal memuat invoice customer');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (customerId) {
      fetchCustomerInvoices(customerId);
    } else {
      setCustomerInvoices([]);
      setSelectedInvoiceIds([]);
    }
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoiceIds(prev =>
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInvoiceIds.length === customerInvoices.length) {
      setSelectedInvoiceIds([]);
    } else {
      setSelectedInvoiceIds(customerInvoices.map(inv => inv.id));
    }
  };

  const selectedTotal = customerInvoices
    .filter(inv => selectedInvoiceIds.includes(inv.id))
    .reduce((sum, inv) => sum + inv.outstanding_amount, 0);

  const handleView = (letter: BillingLetter) => {
    navigate(`/billing-letters/${letter.id}`);
  };

  const getBillingData = (letter: BillingLetter): BillingLetterData | null => {
    if (!companyProfile) {
      toast.error(language === 'en' ? 'Company profile not found' : 'Profil perusahaan tidak ditemukan');
      return null;
    }

    return {
      letterNo: letter.letter_no,
      letterDate: letter.letter_date,
      customerName: letter.customer_name,
      customerAddress: letter.customer_address || undefined,
      invoiceNumber: letter.invoice_number,
      invoiceDate: letter.invoice_date,
      dueDate: letter.due_date,
      invoiceAmount: letter.invoice_amount,
      outstandingAmount: letter.outstanding_amount,
      overdueDays: calcOverdueDays(letter.due_date, letter.outstanding_amount),
      companyName: companyProfile.company_name,
      companyAddress: companyProfile.address || undefined,
      companyPhone: companyProfile.phone || undefined,
      companyEmail: companyProfile.email || undefined,
      companyLogoUrl: companyProfile.logo_url || undefined,
    };
  };

  // For multi-invoice letters, we need to fetch related invoice data
  const getMultiBillingHtml = async (letter: BillingLetter): Promise<string | null> => {
    if (!companyProfile || !letter.ar_invoice_ids) return null;

    const { data: invoices } = await supabase
      .from('ar_invoices')
      .select('invoice_number, invoice_date, due_date, invoice_amount, outstanding_amount, overdue_days')
      .in('id', letter.ar_invoice_ids);

    if (!invoices || invoices.length === 0) return null;

    // Get customer info
    const { data: customer } = await supabase
      .from('customers')
      .select('customer_name, address, phone')
      .eq('id', letter.customer_id!)
      .maybeSingle();

    const multiData: MultiBillingLetterData = {
      letterNo: letter.letter_no,
      letterDate: letter.letter_date,
      customerName: customer?.customer_name || letter.customer_name,
      customerAddress: customer?.address || undefined,
      invoices: invoices.map(inv => ({
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        invoiceAmount: inv.invoice_amount,
        outstandingAmount: inv.outstanding_amount,
        overdueDays: calcOverdueDays(inv.due_date, inv.outstanding_amount),
      })),
      totalOutstanding: letter.total_outstanding,
      companyName: companyProfile.company_name,
      companyAddress: companyProfile.address || undefined,
      companyPhone: companyProfile.phone || undefined,
      companyEmail: companyProfile.email || undefined,
      companyLogoUrl: companyProfile.logo_url || undefined,
    };

    return generateMultiBillingLetterHTML(multiData);
  };

  const getLetterHtml = async (letter: BillingLetter): Promise<string | null> => {
    if (letter.is_multi) {
      return getMultiBillingHtml(letter);
    }
    const billingData = getBillingData(letter);
    if (!billingData) return null;
    return generateBillingLetterHTML(billingData);
  };

  const handlePrint = async (letter: BillingLetter) => {
    const html = await getLetterHtml(letter);
    if (!html) return;
    printBillingLetter(html);
  };

  const handleDownloadPDF = async (letter: BillingLetter) => {
    try {
      toast.loading(language === 'en' ? 'Generating PDF...' : 'Membuat PDF...', { id: 'pdf-download' });
      const html = await getLetterHtml(letter);
      if (!html) {
        toast.dismiss('pdf-download');
        return;
      }
      await downloadBillingLetterPDF(html, `Surat-Tagihan-${letter.letter_no}`);
      toast.success(language === 'en' ? 'PDF downloaded' : 'PDF berhasil diunduh', { id: 'pdf-download' });
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error(language === 'en' ? 'Failed to download PDF' : 'Gagal mengunduh PDF', { id: 'pdf-download' });
    }
  };

  const handleSendWhatsApp = async (letter: BillingLetter) => {
    const phone = letter.customer_phone;
    if (!phone) {
      toast.error(language === 'en' ? 'Customer phone number not available' : 'Nomor telepon customer tidak tersedia');
      return;
    }

    if (letter.is_multi && letter.ar_invoice_ids && companyProfile) {
      const { data: invoices } = await supabase
        .from('ar_invoices')
        .select('invoice_number, invoice_date, due_date, invoice_amount, outstanding_amount, overdue_days')
        .in('id', letter.ar_invoice_ids);

      if (invoices) {
        const multiData: MultiBillingLetterData = {
          letterNo: letter.letter_no,
          letterDate: letter.letter_date,
          customerName: letter.customer_name,
          invoices: invoices.map(inv => ({
            invoiceNumber: inv.invoice_number,
            invoiceDate: inv.invoice_date,
            dueDate: inv.due_date,
            invoiceAmount: inv.invoice_amount,
            outstandingAmount: inv.outstanding_amount,
            overdueDays: calcOverdueDays(inv.due_date, inv.outstanding_amount),
          })),
          totalOutstanding: letter.total_outstanding,
          companyName: companyProfile.company_name,
        };
        const message = generateMultiWhatsAppMessage(multiData);
        openWhatsApp(phone, message);
        return;
      }
    }

    const billingData = getBillingData(letter);
    if (!billingData) return;
    const message = generateWhatsAppMessage(billingData);
    openWhatsApp(phone, message);
  };

  const handleCreate = async () => {
    if (!selectedInvoiceId || !user) {
      toast.error(language === 'en' ? 'Please select an invoice' : 'Pilih invoice terlebih dahulu');
      return;
    }

    setSaving(true);
    try {
      const letterNo = generateLetterNumber();
      const { error } = await supabase
        .from('billing_letters')
        .insert({
          ar_invoice_id: selectedInvoiceId,
          letter_no: letterNo,
          letter_date: new Date().toISOString().split('T')[0],
          created_by: user.id,
          status: 'DRAFT',
        });

      if (error) throw error;
      toast.success(language === 'en' ? 'Billing letter created' : 'Surat tagihan dibuat');
      setIsCreateDialogOpen(false);
      setSelectedInvoiceId('');
      fetchData();
    } catch (error: any) {
      console.error('Error creating letter:', error);
      toast.error(language === 'en' ? 'Failed to create letter' : 'Gagal membuat surat tagihan');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMulti = async () => {
    if (!selectedCustomerId || selectedInvoiceIds.length === 0 || !user) {
      toast.error('Pilih customer dan minimal 1 invoice');
      return;
    }

    setSaving(true);
    try {
      const letterNo = generateLetterNumber();
      // Use the first invoice as ar_invoice_id (required by existing schema)
      const firstInvoiceId = selectedInvoiceIds[0];

      const { error } = await supabase
        .from('billing_letters')
        .insert({
          ar_invoice_id: firstInvoiceId,
          ar_invoice_ids: selectedInvoiceIds,
          customer_id: selectedCustomerId,
          total_outstanding: selectedTotal,
          letter_no: letterNo,
          letter_date: new Date().toISOString().split('T')[0],
          created_by: user.id,
          status: 'DRAFT',
        });

      if (error) throw error;
      toast.success('Surat tagihan multi-invoice berhasil dibuat');
      setIsMultiCreateOpen(false);
      setSelectedCustomerId('');
      setCustomerInvoices([]);
      setSelectedInvoiceIds([]);
      fetchData();
    } catch (error: any) {
      console.error('Error creating multi letter:', error);
      toast.error('Gagal membuat surat tagihan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedLetter) return;

    try {
      const { error } = await supabase
        .from('billing_letters')
        .delete()
        .eq('id', selectedLetter.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Billing letter deleted' : 'Surat tagihan dihapus');
      setIsDeleteDialogOpen(false);
      setSelectedLetter(null);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting letter:', error);
      toast.error(language === 'en' ? 'Failed to delete letter' : 'Gagal menghapus surat tagihan');
    }
  };

  const filteredLetters = letters.filter(
    (letter) =>
      letter.letter_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      letter.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      letter.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canDelete = (status: RecordStatus) => {
    return isSuperAdmin || (isFinance && status === 'DRAFT');
  };

  // Preview HTML removed - detail page is now used instead

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('menu.billingLetters')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage billing letters for AR invoices' : 'Kelola surat tagihan untuk invoice AR'}
          </p>
        </div>
        {isFinance && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setIsMultiCreateOpen(true)}>
              <Users className="w-4 h-4" />
              {language === 'en' ? 'Multi-Invoice Letter' : 'Surat Multi-Invoice'}
            </Button>
            <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Single Invoice Letter' : 'Surat 1 Invoice'}
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Letter No' : 'No. Surat'}</TableHead>
                <TableHead>{language === 'en' ? 'Letter Date' : 'Tanggal Surat'}</TableHead>
                <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                <TableHead>{t('table.customerName')}</TableHead>
                <TableHead className="text-right">{t('table.outstanding')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead className="text-center">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLetters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLetters.map((letter) => (
                  <TableRow key={letter.id}>
                    <TableCell className="font-medium">{letter.letter_no}</TableCell>
                    <TableCell>{formatDate(letter.letter_date)}</TableCell>
                    <TableCell>
                      {letter.is_multi ? (
                        <Badge variant="secondary">
                          <Users className="w-3 h-3 mr-1" />
                          {letter.ar_invoice_ids?.length || 0} Invoice
                        </Badge>
                      ) : (
                        <Badge variant="outline">{letter.invoice_number}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{letter.customer_name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrencyIDR(letter.is_multi ? letter.total_outstanding : letter.outstanding_amount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig[letter.status]?.className || ''}>
                        {statusConfig[letter.status]?.label[language] || letter.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleView(letter)} title={t('btn.view')}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(letter)} title="Download PDF">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handlePrint(letter)} title="Cetak">
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleSendWhatsApp(letter)} title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        {canDelete(letter.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedLetter(letter); setIsDeleteDialogOpen(true); }}
                            title={t('btn.delete')}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Single Invoice Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {language === 'en' ? 'Create Billing Letter' : 'Buat Surat Tagihan (1 Invoice)'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Select an AR invoice to create a billing letter'
                : 'Pilih invoice AR untuk membuat surat tagihan'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Select Invoice' : 'Pilih Invoice'} *</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select an invoice...' : 'Pilih invoice...'} />
                </SelectTrigger>
                <SelectContent>
                  {arInvoices.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      {language === 'en' ? 'No invoices with outstanding balance' : 'Tidak ada invoice dengan saldo outstanding'}
                    </div>
                  ) : (
                    arInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        <div className="flex flex-col">
                          <span>{inv.invoice_number} - {inv.customer_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatCurrencyIDR(inv.outstanding_amount)}
                            {inv.overdue_days > 0 && (
                              <span className="text-destructive ml-1">
                                ({inv.overdue_days} {language === 'en' ? 'days overdue' : 'hari terlambat'})
                              </span>
                            )}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={saving || !selectedInvoiceId}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('btn.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-Invoice Create Dialog */}
      <Dialog open={isMultiCreateOpen} onOpenChange={(open) => {
        setIsMultiCreateOpen(open);
        if (!open) {
          setSelectedCustomerId('');
          setCustomerInvoices([]);
          setSelectedInvoiceIds([]);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Buat Surat Tagihan Multi-Invoice
            </DialogTitle>
            <DialogDescription>
              Pilih customer, lalu centang invoice-invoice yang ingin ditagihkan dalam satu surat
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-auto">
            {/* Customer selector */}
            <div className="space-y-2">
              <Label>Pilih Customer *</Label>
              <Select value={selectedCustomerId} onValueChange={handleCustomerChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice list */}
            {selectedCustomerId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Invoice Outstanding</Label>
                  {customerInvoices.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                      {selectedInvoiceIds.length === customerInvoices.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    </Button>
                  )}
                </div>

                {loadingInvoices ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : customerInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Customer ini tidak memiliki invoice outstanding
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>No. Invoice</TableHead>
                          <TableHead>Tgl Invoice</TableHead>
                          <TableHead>Jatuh Tempo</TableHead>
                          <TableHead className="text-right">Nilai Invoice</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-center">Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerInvoices.map((inv) => (
                          <TableRow
                            key={inv.id}
                            className="cursor-pointer"
                            onClick={() => toggleInvoiceSelection(inv.id)}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedInvoiceIds.includes(inv.id)}
                                onCheckedChange={() => toggleInvoiceSelection(inv.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                            <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                            <TableCell>{formatDate(inv.due_date)}</TableCell>
                            <TableCell className="text-right">{formatCurrencyIDR(inv.invoice_amount)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrencyIDR(inv.outstanding_amount)}</TableCell>
                            <TableCell className="text-center">
                              {inv.overdue_days > 0 ? (
                                <Badge variant="destructive">{inv.overdue_days} hari</Badge>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {selectedInvoiceIds.length > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">
                      {selectedInvoiceIds.length} invoice dipilih
                    </span>
                    <span className="font-bold text-foreground">
                      Total Outstanding: {formatCurrencyIDR(selectedTotal)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsMultiCreateOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleCreateMulti} disabled={saving || selectedInvoiceIds.length === 0}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Buat Surat Tagihan ({selectedInvoiceIds.length} Invoice)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Billing Letter?' : 'Hapus Surat Tagihan?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? 'This action cannot be undone. The billing letter will be permanently deleted.'
                : 'Tindakan ini tidak dapat dibatalkan. Surat tagihan akan dihapus secara permanen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('btn.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('btn.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}