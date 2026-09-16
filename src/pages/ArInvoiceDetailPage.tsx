import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Send, MessageCircle, Trash2, ChevronsUpDown, Check, Printer, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { InvoiceScanButton } from '@/components/InvoiceScanButton';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { dispatchSalesPulseEvent } from '@/lib/salespulseDispatch';
import { generateInvoiceHTML, printInvoiceHTML, downloadInvoicePDF } from '@/lib/invoiceUtils';

type InvoiceStatus = Database['public']['Enums']['record_status'];

interface Customer { id: string; customer_name: string; billing_email: string | null; address: string | null; }
interface Sales { id: string; sales_name: string; }
interface PaymentTerms { id: string; terms_name: string; days: number; }
interface TaxCode { id: string; code: string; name: string; rate: number; }
interface Comment { id: string; comment: string; created_at: string; user_id: string; user_name: string; }

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'badge-draft' },
  SUBMITTED: { label: 'Diajukan', className: 'badge-submitted' },
  APPROVED: { label: 'Disetujui', className: 'badge-approved' },
  REJECTED: { label: 'Ditolak', className: 'badge-rejected' },
  PARTIAL: { label: 'Sebagian', className: 'badge-partial' },
  PAID: { label: 'Lunas', className: 'badge-paid' },
  CANCELLED: { label: 'Dibatalkan', className: 'badge-rejected' },
  REVISION_REQUESTED: { label: 'Minta Revisi', className: 'badge-submitted' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('id-ID');
const formatDateTime = (dateString: string) => {
  const d = new Date(dateString);
  return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function ArInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const isCreateMode = location.pathname.endsWith('/new');
  const isEditMode = location.pathname.endsWith('/edit');
  const isViewMode = !isCreateMode && !isEditMode;

  const [loading, setLoading] = useState(!isCreateMode);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesList, setSalesList] = useState<Sales[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [creatorName, setCreatorName] = useState('');

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
    tax_code_id: '',
  });

  useEffect(() => {
    fetchDropdowns();
    if (!isCreateMode && id) fetchInvoice();
  }, [id, isCreateMode, isEditMode]);

  const fetchDropdowns = async () => {
    const [customersRes, salesRes, termsRes, taxRes] = await Promise.all([
      supabase.from('customers').select('id, customer_name, billing_email, address').eq('is_active', true).order('customer_name'),
      supabase.from('sales').select('id, sales_name').eq('is_active', true).order('sales_name'),
      supabase.from('payment_terms').select('id, terms_name, days').eq('is_active', true).order('days'),
      supabase.from('tax_codes').select('id, code, name, rate').eq('is_active', true).eq('tax_type', 'OUTPUT').order('code'),
    ]);
    setCustomers(customersRes.data || []);
    setSalesList(salesRes.data || []);
    setPaymentTerms(termsRes.data || []);
    setTaxCodes(taxRes.data || []);
  };

  const taxCodeLabel = (id: string | null) => {
    if (!id) return '-';
    const tc = taxCodes.find(t => t.id === id);
    return tc ? `${tc.code} - ${tc.name}` : '-';
  };

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ar_invoices')
        .select('*, customers(customer_name, billing_email, address), sales(sales_name)')
        .eq('id', id!)
        .maybeSingle();

      if (error || !data) {
        toast.error('Invoice tidak ditemukan');
        navigate('/ar');
        return;
      }

      setInvoice({ ...data, customer_name: (data as any).customers?.customer_name || '', sales_name: (data as any).sales?.sales_name || null });

      if (isEditMode) {
        setFormData({
          customer_id: data.customer_id,
          sales_id: data.sales_id || '',
          invoice_number: data.invoice_number,
          order_number: data.order_number,
          sp_po_date: data.sp_po_date,
          invoice_date: data.invoice_date,
          terms_id: data.terms_id || '',
          invoice_amount: data.invoice_amount.toString(),
          notes: data.notes || '',
          tax_code_id: (data as any).tax_code_id || '',
        });
      }

      // Fetch creator name & comments in parallel
      const [creatorRes, commentsRes] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('user_id', data.created_by).maybeSingle(),
        supabase.from('invoice_comments').select('*').eq('entity_type', 'ar_invoice').eq('entity_id', id!).order('created_at', { ascending: true }),
      ]);

      setCreatorName(creatorRes.data?.full_name || '');

      if (commentsRes.data && commentsRes.data.length > 0) {
        const userIds = [...new Set(commentsRes.data.map((c: any) => c.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
        const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
        setComments(commentsRes.data.map((c: any) => ({
          id: c.id, comment: c.comment, created_at: c.created_at,
          user_id: c.user_id, user_name: nameMap.get(c.user_id) || 'Unknown',
        })));
      }
    } catch (error) {
      console.error('Error fetching invoice:', error);
      toast.error('Gagal memuat data invoice');
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

  const handleSave = async () => {
    if (!formData.customer_id || !formData.invoice_number || !formData.order_number ||
        !formData.sp_po_date || !formData.invoice_date || !formData.terms_id || !formData.invoice_amount) {
      toast.error('Mohon isi semua field yang wajib');
      return;
    }

    try {
      setSaving(true);
      const dueDate = calculateDueDate(formData.invoice_date, formData.terms_id);
      const invoiceAmount = parseFloat(formData.invoice_amount);

      if (isEditMode && invoice) {
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
            outstanding_amount: invoiceAmount - (invoice.paid_amount || 0),
            notes: formData.notes || null,
            tax_code_id: formData.tax_code_id || null,
          })
          .eq('id', invoice.id);
        if (error) throw error;
        toast.success('Invoice berhasil diperbarui');

        // If invoice was already approved (has counterpart in SalesPulse), send revised event
        const wasApproved = ['APPROVED', 'PARTIAL', 'PAID'].includes(invoice.status);
        if (wasApproved) {
          dispatchSalesPulseEvent({ event_type: 'revised', ar_invoice_id: invoice.id });
        }

        navigate(`/ar/${invoice.id}`);
      } else {
        const { data: newInvoice, error } = await supabase
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
            tax_code_id: formData.tax_code_id || null,
            created_by: user?.id || '',
            status: 'DRAFT',
          }])
          .select()
          .single();
        if (error) throw error;
        toast.success('Invoice berhasil dibuat');
        navigate(`/ar/${newInvoice.id}`);
      }
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast.error(error.message || 'Gagal menyimpan invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || !id) return;
    setSendingComment(true);
    try {
      const { error } = await supabase.from('invoice_comments').insert({
        entity_type: 'ar_invoice',
        entity_id: id,
        user_id: user.id,
        comment: newComment.trim(),
      });
      if (error) throw error;
      setNewComment('');

      const { data } = await supabase.from('invoice_comments').select('*')
        .eq('entity_type', 'ar_invoice').eq('entity_id', id).order('created_at', { ascending: true });
      if (data) {
        const userIds = [...new Set(data.map((c: any) => c.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
        const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
        setComments(data.map((c: any) => ({
          id: c.id, comment: c.comment, created_at: c.created_at,
          user_id: c.user_id, user_name: nameMap.get(c.user_id) || 'Unknown',
        })));
      }
      toast.success('Komentar ditambahkan');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Gagal menambahkan komentar');
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase.from('invoice_comments').delete().eq('id', commentId);
      if (error) throw error;
      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success('Komentar dihapus');
    } catch (error) {
      toast.error('Gagal menghapus komentar');
    }
  };

  const buildInvoiceHtml = async () => {
    if (!invoice) return null;
    const [{ data: profile }, { data: banks }, { data: items }] = await Promise.all([
      supabase.from('company_profile').select('*').limit(1).maybeSingle(),
      supabase.from('bank_accounts').select('bank_name, account_no, account_name').eq('is_active', true).order('bank_name'),
      supabase.from('ar_invoice_items').select('*').eq('ar_invoice_id', invoice.id).order('line_no'),
    ]);

    return generateInvoiceHTML({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      orderNumber: invoice.order_number,
      customerName: invoice.customer_name,
      customerAddress: invoice.customers?.address,
      salesName: invoice.sales_name,
      items: ((items as any[]) || []).map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unit_price,
        amount: it.amount,
      })),
      invoiceAmount: invoice.invoice_amount,
      notes: invoice.notes,
      companyName: profile?.company_name || 'PT. Kemika Karya Pratama',
      companyBrandName: profile?.brand_name,
      companyAddress: profile?.address,
      companyPhone: profile?.phone,
      companyEmail: profile?.email,
      companyWebsite: profile?.website,
      bankAccounts: (banks || []).map((b) => ({ bankName: b.bank_name, accountNo: b.account_no, accountName: b.account_name })),
    });
  };

  const handlePrintInvoice = async () => {
    const html = await buildInvoiceHtml();
    if (!html) return;
    printInvoiceHTML(html);
    toast.success('Invoice dibuka untuk dicetak');
  };

  const handleDownloadInvoicePdf = async () => {
    const html = await buildInvoiceHtml();
    if (!html) return;
    const loadingId = toast.loading('Menyiapkan PDF invoice...');
    try {
      await downloadInvoicePDF(html, `Invoice-${invoice.invoice_number}`);
      toast.success('PDF invoice berhasil diunduh', { id: loadingId });
    } catch {
      toast.error('Gagal membuat PDF invoice', { id: loadingId });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // FORM MODE (Create / Edit)
  if (isCreateMode || isEditMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ar')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isCreateMode ? 'Invoice AR Baru' : 'Edit Invoice AR'}
            </h1>
            <p className="text-muted-foreground">Isi detail invoice di bawah ini</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isCreateMode && (
              <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg bg-muted/30 mb-6">
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
                <span className="text-sm text-muted-foreground">Upload gambar invoice untuk isi otomatis</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {formData.customer_id
                        ? customers.find(c => c.id === formData.customer_id)?.customer_name
                        : 'Pilih customer'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Cari customer..." />
                      <CommandList>
                        <CommandEmpty>Customer tidak ditemukan.</CommandEmpty>
                        <CommandGroup>
                          {customers.map((c) => (
                            <CommandItem key={c.id} value={c.customer_name} onSelect={() => setFormData(prev => ({ ...prev, customer_id: c.id }))}>
                              <Check className={cn("mr-2 h-4 w-4", formData.customer_id === c.id ? "opacity-100" : "opacity-0")} />
                              {c.customer_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Sales</Label>
                <Select value={formData.sales_id} onValueChange={(v) => setFormData({ ...formData, sales_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih sales" /></SelectTrigger>
                  <SelectContent>
                    {salesList.map((s) => (<SelectItem key={s.id} value={s.id}>{s.sales_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>No. Invoice *</Label>
                <Input value={formData.invoice_number} onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>No. Order *</Label>
                <Input value={formData.order_number} onChange={(e) => setFormData({ ...formData, order_number: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Tanggal SP/PO *</Label>
                <Input type="date" value={formData.sp_po_date} onChange={(e) => setFormData({ ...formData, sp_po_date: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Tanggal Invoice *</Label>
                <Input type="date" value={formData.invoice_date} onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Terms Pembayaran *</Label>
                <Select value={formData.terms_id} onValueChange={(v) => setFormData({ ...formData, terms_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih terms" /></SelectTrigger>
                  <SelectContent>
                    {paymentTerms.map((t) => (<SelectItem key={t.id} value={t.id}>{t.terms_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Jumlah Invoice *</Label>
                <Input type="number" value={formData.invoice_amount} onChange={(e) => setFormData({ ...formData, invoice_amount: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Kode Pajak (Opsional)</Label>
                <Select value={formData.tax_code_id || 'none'} onValueChange={(v) => setFormData({ ...formData, tax_code_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Tanpa Pajak" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa Pajak</SelectItem>
                    {taxCodes.map((t) => (<SelectItem key={t.id} value={t.id}>{t.code} - {t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label>Catatan</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => navigate('/ar')}>Batal</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Simpan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // VIEW MODE
  if (!invoice) {
    return <div className="text-center py-12 text-muted-foreground">Data tidak ditemukan</div>;
  }

  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const canEdit = isFinance && (invoice.status === 'DRAFT' || invoice.status === 'REJECTED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ar')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Detail Invoice AR</h1>
            <p className="text-muted-foreground">{invoice.invoice_number} - {invoice.customer_name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadInvoicePdf}>
            <Download className="h-4 w-4 mr-2" />
            Unduh Invoice (PDF)
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintInvoice}>
            <Printer className="h-4 w-4 mr-2" />
            Cetak Invoice
          </Button>
          {canEdit && (
            <Button onClick={() => navigate(`/ar/${invoice.id}/edit`)}>Edit Invoice</Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informasi Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">No. Invoice</p>
                <p className="font-medium">{invoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-muted-foreground">No. Order</p>
                <p className="font-medium">{invoice.order_number}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal SP/PO</p>
                <p className="font-medium">{formatDate(invoice.sp_po_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Invoice</p>
                <p className="font-medium">{formatDate(invoice.invoice_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Jatuh Tempo</p>
                <p className="font-medium">{formatDate(invoice.due_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge className={statusConfig[invoice.status]?.className || ''}>
                  {statusConfig[invoice.status]?.label || invoice.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Dibuat Oleh</p>
                <p className="font-medium">{creatorName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Dibuat</p>
                <p className="font-medium">{formatDateTime(invoice.created_at)}</p>
              </div>
              {invoice.doc_sent_date && (
                <div>
                  <p className="text-muted-foreground">Dok. Terkirim</p>
                  <p className="font-medium">{formatDate(invoice.doc_sent_date)}</p>
                </div>
              )}
              {invoice.rejected_reason && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Alasan Penolakan/Revisi</p>
                  <p className="font-medium text-destructive">{invoice.rejected_reason}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informasi Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div className="col-span-2">
                <p className="text-muted-foreground">Nama Customer</p>
                <p className="font-medium">{invoice.customer_name}</p>
              </div>
              {invoice.sales_name && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Sales</p>
                  <p className="font-medium">{invoice.sales_name}</p>
                </div>
              )}
              {invoice.notes && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Catatan</p>
                  <p className="font-medium">{invoice.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Nilai Invoice</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(invoice.invoice_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Terbayar</p>
            <p className="text-xl font-bold text-success">{formatCurrency(invoice.paid_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={cn("text-xl font-bold", invoice.outstanding_amount > 0 ? "text-warning" : "text-foreground")}>
              {formatCurrency(invoice.outstanding_amount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Hari Terlambat</p>
            <p className={cn("text-xl font-bold", invoice.overdue_days > 0 ? "text-destructive" : "text-foreground")}>
              {invoice.overdue_days > 0 ? `${invoice.overdue_days} hari` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tax Info */}
      {invoice.tax_code_id && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informasi Pajak</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Kode Pajak</p>
                <p className="font-medium">{taxCodeLabel(invoice.tax_code_id)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">DPP (Dasar Pengenaan Pajak)</p>
                <p className="font-medium">{formatCurrency(invoice.dpp_amount || 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">PPN</p>
                <p className="font-medium">{formatCurrency(invoice.tax_amount || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Aktivitas & Komentar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Comment Input */}
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Tambah catatan aktivitas..."
              rows={2}
              className="flex-1"
            />
            <Button onClick={handleAddComment} disabled={sendingComment || !newComment.trim()} size="sm" className="self-end">
              {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <Separator />

          {/* Comments List */}
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada aktivitas tercatat</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{comment.user_name}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{comment.comment}</p>
                  </div>
                  {(comment.user_id === user?.id || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDeleteComment(comment.id)}>
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
