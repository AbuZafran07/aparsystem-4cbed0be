import React, { useState, useEffect } from 'react';
import { Search, Eye, Printer, Trash2, Loader2, FileText, Plus, Download, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  printBillingLetter,
  downloadBillingLetterPDF,
  generateWhatsAppMessage,
  openWhatsApp,
  sanitizePrintableHtml,
  formatCurrencyIDR,
  formatDateID,
  generateLetterNumber,
  BillingLetterData 
} from '@/lib/billingUtils';
import type { Database } from '@/integrations/supabase/types';

type RecordStatus = Database['public']['Enums']['record_status'];

interface BillingLetter {
  id: string;
  letter_no: string;
  letter_date: string;
  ar_invoice_id: string;
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
}

interface ArInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  outstanding_amount: number;
  overdue_days: number;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [letters, setLetters] = useState<BillingLetter[]>([]);
  const [arInvoices, setArInvoices] = useState<ArInvoice[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<BillingLetter | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch billing letters with invoice and customer data
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
        invoice_number: letter.ar_invoices?.invoice_number || '',
        customer_name: letter.ar_invoices?.customers?.customer_name || 'Unknown',
        customer_address: letter.ar_invoices?.customers?.address || null,
        customer_phone: letter.ar_invoices?.customers?.phone || null,
        invoice_amount: letter.ar_invoices?.invoice_amount || 0,
        outstanding_amount: letter.ar_invoices?.outstanding_amount || 0,
        invoice_date: letter.ar_invoices?.invoice_date || '',
        due_date: letter.ar_invoices?.due_date || '',
        overdue_days: letter.ar_invoices?.overdue_days || 0,
        status: letter.status,
        notes: letter.notes,
        created_at: letter.created_at,
        created_by: letter.created_by,
      }));

      setLetters(formattedLetters);

      // Fetch AR invoices with outstanding for create dialog
      const { data: invoicesData } = await supabase
        .from('ar_invoices')
        .select(`
          id,
          invoice_number,
          outstanding_amount,
          overdue_days,
          customers (customer_name)
        `)
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

  const handleView = (letter: BillingLetter) => {
    setSelectedLetter(letter);
    setIsViewDialogOpen(true);
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
      overdueDays: letter.overdue_days,
      companyName: companyProfile.company_name,
      companyAddress: companyProfile.address || undefined,
      companyPhone: companyProfile.phone || undefined,
      companyEmail: companyProfile.email || undefined,
      companyLogoUrl: companyProfile.logo_url || undefined,
    };
  };

  const handlePrint = (letter: BillingLetter) => {
    const billingData = getBillingData(letter);
    if (!billingData) return;

    const html = generateBillingLetterHTML(billingData);
    printBillingLetter(html);
  };

  const handleDownloadPDF = async (letter: BillingLetter) => {
    const billingData = getBillingData(letter);
    if (!billingData) return;

    try {
      toast.loading(language === 'en' ? 'Generating PDF...' : 'Membuat PDF...', { id: 'pdf-download' });
      const html = generateBillingLetterHTML(billingData);
      await downloadBillingLetterPDF(html, `Surat-Tagihan-${letter.letter_no}`);
      toast.success(language === 'en' ? 'PDF downloaded' : 'PDF berhasil diunduh', { id: 'pdf-download' });
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error(language === 'en' ? 'Failed to download PDF' : 'Gagal mengunduh PDF', { id: 'pdf-download' });
    }
  };

  const handleSendWhatsApp = (letter: BillingLetter) => {
    if (!letter.customer_phone) {
      toast.error(language === 'en' ? 'Customer phone number not available' : 'Nomor telepon customer tidak tersedia');
      return;
    }

    const billingData = getBillingData(letter);
    if (!billingData) return;

    const message = generateWhatsAppMessage(billingData);
    openWhatsApp(letter.customer_phone, message);
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
          <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            {language === 'en' ? 'New Billing Letter' : 'Surat Tagihan Baru'}
          </Button>
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
                <TableHead>{t('table.invoiceNumber')}</TableHead>
                <TableHead>{t('table.customerName')}</TableHead>
                <TableHead className="text-right">{t('table.outstanding')}</TableHead>
                <TableHead className="text-center">{language === 'en' ? 'Overdue' : 'Keterlambatan'}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead className="text-center">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLetters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLetters.map((letter) => (
                  <TableRow key={letter.id}>
                    <TableCell className="font-medium">{letter.letter_no}</TableCell>
                    <TableCell>{formatDate(letter.letter_date)}</TableCell>
                    <TableCell>{letter.invoice_number}</TableCell>
                    <TableCell>{letter.customer_name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrencyIDR(letter.outstanding_amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {letter.overdue_days > 0 ? (
                        <Badge variant="destructive">{letter.overdue_days} {language === 'en' ? 'days' : 'hari'}</Badge>
                      ) : (
                        <Badge variant="secondary">-</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig[letter.status]?.className || ''}>
                        {statusConfig[letter.status]?.label[language] || letter.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleView(letter)}
                          title={t('btn.view')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownloadPDF(letter)}
                          title={language === 'en' ? 'Download PDF' : 'Unduh PDF'}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePrint(letter)}
                          title={language === 'en' ? 'Print' : 'Cetak'}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSendWhatsApp(letter)}
                          title={language === 'en' ? 'Send via WhatsApp' : 'Kirim via WhatsApp'}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        {canDelete(letter.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedLetter(letter);
                              setIsDeleteDialogOpen(true);
                            }}
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

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {language === 'en' ? 'Create Billing Letter' : 'Buat Surat Tagihan'}
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

      {/* View Dialog with Preview */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {language === 'en' ? 'Billing Letter Preview' : 'Preview Surat Tagihan'}
            </DialogTitle>
            <DialogDescription>
              {selectedLetter?.letter_no}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLetter && companyProfile && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Preview iframe */}
              <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-[400px]">
                <iframe
                  srcDoc={sanitizePrintableHtml(generateBillingLetterHTML({
                    letterNo: selectedLetter.letter_no,
                    letterDate: selectedLetter.letter_date,
                    customerName: selectedLetter.customer_name,
                    customerAddress: selectedLetter.customer_address || undefined,
                    invoiceNumber: selectedLetter.invoice_number,
                    invoiceDate: selectedLetter.invoice_date,
                    dueDate: selectedLetter.due_date,
                    invoiceAmount: selectedLetter.invoice_amount,
                    outstandingAmount: selectedLetter.outstanding_amount,
                    overdueDays: selectedLetter.overdue_days,
                    companyName: companyProfile.company_name,
                    companyAddress: companyProfile.address || undefined,
                    companyPhone: companyProfile.phone || undefined,
                    companyEmail: companyProfile.email || undefined,
                    companyLogoUrl: companyProfile.logo_url || undefined,
                  }))}
                  className="w-full h-full min-h-[500px]"
                  title="Billing Letter Preview"
                  sandbox="allow-same-origin"
                />
              </div>

              {/* Info summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Invoice' : 'Invoice'}</p>
                  <p className="font-medium text-sm">{selectedLetter.invoice_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Customer' : 'Customer'}</p>
                  <p className="font-medium text-sm">{selectedLetter.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('table.outstanding')}</p>
                  <p className="font-medium text-sm text-destructive">{formatCurrencyIDR(selectedLetter.outstanding_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Overdue' : 'Keterlambatan'}</p>
                  <p className="font-medium text-sm">
                    {selectedLetter.overdue_days > 0 ? (
                      <span className="text-destructive">{selectedLetter.overdue_days} {language === 'en' ? 'days' : 'hari'}</span>
                    ) : '-'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  {t('btn.close')}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleSendWhatsApp(selectedLetter)}
                  disabled={!selectedLetter.customer_phone}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button variant="outline" onClick={() => handleDownloadPDF(selectedLetter)}>
                  <Download className="h-4 w-4 mr-2" />
                  {language === 'en' ? 'Download PDF' : 'Unduh PDF'}
                </Button>
                <Button onClick={() => handlePrint(selectedLetter)}>
                  <Printer className="h-4 w-4 mr-2" />
                  {language === 'en' ? 'Print' : 'Cetak'}
                </Button>
              </div>
            </div>
          )}
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
