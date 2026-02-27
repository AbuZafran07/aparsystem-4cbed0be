import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Printer, Download, MessageCircle, Loader2, Send, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  formatCurrencyIDR,
  formatDateID,
  BillingLetterData,
  MultiBillingLetterData,
} from '@/lib/billingUtils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface BillingLetterDetail {
  id: string;
  letter_no: string;
  letter_date: string;
  ar_invoice_id: string;
  ar_invoice_ids: string[] | null;
  customer_id: string | null;
  total_outstanding: number;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
}

interface InvoiceInfo {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  order_number: string;
}

interface CustomerInfo {
  customer_name: string;
  address: string | null;
  phone: string | null;
  billing_email: string | null;
}

interface CompanyProfile {
  company_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

interface Comment {
  id: string;
  comment: string;
  created_at: string;
  user_id: string;
  user_name: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'badge-draft' },
  SUBMITTED: { label: 'Terkirim', className: 'badge-submitted' },
  APPROVED: { label: 'Disetujui', className: 'badge-approved' },
  REJECTED: { label: 'Ditolak', className: 'badge-rejected' },
  PARTIAL: { label: 'Sebagian', className: 'badge-partial' },
  PAID: { label: 'Lunas', className: 'badge-paid' },
  CANCELLED: { label: 'Dibatalkan', className: 'badge-rejected' },
};

const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('id-ID');
const formatDateTime = (dateString: string) => {
  const d = new Date(dateString);
  return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function BillingLetterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();

  const [letter, setLetter] = useState<BillingLetterDetail | null>(null);
  const [invoices, setInvoices] = useState<InvoiceInfo[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [creatorName, setCreatorName] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingComment, setSendingComment] = useState(false);

  const isMulti = !!(letter?.ar_invoice_ids && letter.ar_invoice_ids.length > 0);

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    try {
      setLoading(true);

      // Fetch billing letter
      const { data: letterData, error: letterError } = await supabase
        .from('billing_letters')
        .select('*')
        .eq('id', id!)
        .maybeSingle();

      if (letterError || !letterData) {
        toast.error('Surat tagihan tidak ditemukan');
        navigate('/billing-letters');
        return;
      }

      setLetter(letterData as any);

      // Determine invoice IDs to fetch
      const invoiceIds = letterData.ar_invoice_ids && (letterData.ar_invoice_ids as string[]).length > 0
        ? (letterData.ar_invoice_ids as string[])
        : [letterData.ar_invoice_id];

      // Fetch invoices, customer, company profile, creator, and comments in parallel
      const [invoicesRes, companyRes, creatorRes, commentsRes] = await Promise.all([
        supabase
          .from('ar_invoices')
          .select('invoice_number, invoice_date, due_date, invoice_amount, outstanding_amount, overdue_days, order_number, customer_id, customers(customer_name, address, phone, billing_email)')
          .in('id', invoiceIds),
        supabase.from('company_profile').select('*').limit(1).maybeSingle(),
        supabase.from('profiles').select('full_name').eq('user_id', letterData.created_by).maybeSingle(),
        supabase
          .from('billing_letter_comments')
          .select('*')
          .eq('billing_letter_id', id!)
          .order('created_at', { ascending: true }),
      ]);

      if (invoicesRes.data && invoicesRes.data.length > 0) {
        setInvoices(invoicesRes.data.map((inv: any) => ({
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          invoice_amount: inv.invoice_amount,
          outstanding_amount: inv.outstanding_amount,
          overdue_days: inv.overdue_days,
          order_number: inv.order_number,
        })));

        // Get customer from first invoice
        const firstInv = invoicesRes.data[0] as any;
        if (firstInv.customers) {
          setCustomer(firstInv.customers);
        }
      }

      setCompanyProfile(companyRes.data as any);
      setCreatorName(creatorRes.data?.full_name || '');

      // Fetch comment user names
      if (commentsRes.data && commentsRes.data.length > 0) {
        const userIds = [...new Set(commentsRes.data.map((c: any) => c.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);

        const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

        setComments(commentsRes.data.map((c: any) => ({
          id: c.id,
          comment: c.comment,
          created_at: c.created_at,
          user_id: c.user_id,
          user_name: nameMap.get(c.user_id) || 'Unknown',
        })));
      } else {
        setComments([]);
      }
    } catch (error) {
      console.error('Error fetching detail:', error);
      toast.error('Gagal memuat detail surat tagihan');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || !id) return;
    setSendingComment(true);
    try {
      const { error } = await supabase.from('billing_letter_comments').insert({
        billing_letter_id: id,
        user_id: user.id,
        comment: newComment.trim(),
      });
      if (error) throw error;
      setNewComment('');
      // Refresh comments
      const { data } = await supabase
        .from('billing_letter_comments')
        .select('*')
        .eq('billing_letter_id', id)
        .order('created_at', { ascending: true });

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

  const getLetterHtml = async (): Promise<string | null> => {
    if (!letter || !companyProfile || !customer) return null;

    if (isMulti) {
      const multiData: MultiBillingLetterData = {
        letterNo: letter.letter_no,
        letterDate: letter.letter_date,
        customerName: customer.customer_name,
        customerAddress: customer.address || undefined,
        invoices: invoices.map(inv => ({
          invoiceNumber: inv.invoice_number,
          invoiceDate: inv.invoice_date,
          dueDate: inv.due_date,
          invoiceAmount: inv.invoice_amount,
          outstandingAmount: inv.outstanding_amount,
          overdueDays: inv.overdue_days,
        })),
        totalOutstanding: letter.total_outstanding,
        companyName: companyProfile.company_name,
        companyAddress: companyProfile.address || undefined,
        companyPhone: companyProfile.phone || undefined,
        companyEmail: companyProfile.email || undefined,
        companyLogoUrl: companyProfile.logo_url || undefined,
      };
      return generateMultiBillingLetterHTML(multiData);
    }

    const inv = invoices[0];
    if (!inv) return null;
    const billingData: BillingLetterData = {
      letterNo: letter.letter_no,
      letterDate: letter.letter_date,
      customerName: customer.customer_name,
      customerAddress: customer.address || undefined,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      invoiceAmount: inv.invoice_amount,
      outstandingAmount: inv.outstanding_amount,
      overdueDays: inv.overdue_days,
      companyName: companyProfile.company_name,
      companyAddress: companyProfile.address || undefined,
      companyPhone: companyProfile.phone || undefined,
      companyEmail: companyProfile.email || undefined,
      companyLogoUrl: companyProfile.logo_url || undefined,
    };
    return generateBillingLetterHTML(billingData);
  };

  const handlePrint = async () => {
    const html = await getLetterHtml();
    if (html) printBillingLetter(html);
  };

  const handleDownloadPDF = async () => {
    try {
      toast.loading('Membuat PDF...', { id: 'pdf' });
      const html = await getLetterHtml();
      if (!html) { toast.dismiss('pdf'); return; }
      await downloadBillingLetterPDF(html, `Surat-Tagihan-${letter!.letter_no}`);
      toast.success('PDF berhasil diunduh', { id: 'pdf' });
    } catch {
      toast.error('Gagal mengunduh PDF', { id: 'pdf' });
    }
  };

  const handleWhatsApp = async () => {
    if (!customer?.phone) {
      toast.error('Nomor telepon customer tidak tersedia');
      return;
    }
    if (isMulti && companyProfile) {
      const multiData: MultiBillingLetterData = {
        letterNo: letter!.letter_no,
        letterDate: letter!.letter_date,
        customerName: customer.customer_name,
        invoices: invoices.map(inv => ({
          invoiceNumber: inv.invoice_number, invoiceDate: inv.invoice_date,
          dueDate: inv.due_date, invoiceAmount: inv.invoice_amount,
          outstandingAmount: inv.outstanding_amount, overdueDays: inv.overdue_days,
        })),
        totalOutstanding: letter!.total_outstanding,
        companyName: companyProfile.company_name,
      };
      openWhatsApp(customer.phone, generateMultiWhatsAppMessage(multiData));
    } else if (companyProfile && invoices[0]) {
      const billingData: BillingLetterData = {
        letterNo: letter!.letter_no, letterDate: letter!.letter_date,
        customerName: customer.customer_name,
        invoiceNumber: invoices[0].invoice_number, invoiceDate: invoices[0].invoice_date,
        dueDate: invoices[0].due_date, invoiceAmount: invoices[0].invoice_amount,
        outstandingAmount: invoices[0].outstanding_amount, overdueDays: invoices[0].overdue_days,
        companyName: companyProfile.company_name,
      };
      openWhatsApp(customer.phone, generateWhatsAppMessage(billingData));
    }
  };

  const totalOutstanding = isMulti
    ? letter?.total_outstanding || 0
    : invoices[0]?.outstanding_amount || 0;

  const totalInvoiceAmount = invoices.reduce((sum, inv) => sum + inv.invoice_amount, 0);
  const maxOverdue = Math.max(...invoices.map(i => i.overdue_days), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!letter || !customer) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Data tidak ditemukan
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/billing-letters')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Detail Surat Tagihan</h1>
              {isMulti && (
                <Badge variant="secondary">
                  <Users className="w-3 h-3 mr-1" />
                  Multi-Invoice
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{letter.letter_no}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleWhatsApp} disabled={!customer.phone}>
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Unduh PDF
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Cetak
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Letter Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informasi Surat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">No. Surat</p>
                <p className="font-medium">{letter.letter_no}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Surat</p>
                <p className="font-medium">{formatDate(letter.letter_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge className={statusConfig[letter.status]?.className || ''}>
                  {statusConfig[letter.status]?.label || letter.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Dibuat Oleh</p>
                <p className="font-medium">{creatorName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Dibuat</p>
                <p className="font-medium">{formatDateTime(letter.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipe</p>
                <p className="font-medium">{isMulti ? `${invoices.length} Invoice` : '1 Invoice'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informasi Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div className="col-span-2">
                <p className="text-muted-foreground">Nama Customer</p>
                <p className="font-medium">{customer.customer_name}</p>
              </div>
              {customer.address && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Alamat</p>
                  <p className="font-medium">{customer.address}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Telepon</p>
                <p className="font-medium">{customer.phone || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{customer.billing_email || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Jumlah Invoice</p>
            <p className="text-xl font-bold text-foreground">{invoices.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Nilai Invoice</p>
            <p className="text-xl font-bold text-foreground">{formatCurrencyIDR(totalInvoiceAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Outstanding</p>
            <p className="text-xl font-bold text-destructive">{formatCurrencyIDR(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Overdue Terlama</p>
            <p className="text-xl font-bold text-foreground">
              {maxOverdue > 0 ? `${maxOverdue} hari` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Detail Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Invoice</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <TableHead>No. Invoice</TableHead>
                <TableHead>No. Order</TableHead>
                <TableHead>Tgl Invoice</TableHead>
                <TableHead>Jatuh Tempo</TableHead>
                <TableHead className="text-right">Nilai Invoice</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-center">Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-center">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.order_number}</TableCell>
                  <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyIDR(inv.invoice_amount)}</TableCell>
                  <TableCell className="text-right font-medium text-destructive">
                    {formatCurrencyIDR(inv.outstanding_amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.overdue_days > 0 ? (
                      <Badge variant="destructive">{inv.overdue_days} hari</Badge>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {/* Total row */}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={5} className="text-right">Total</TableCell>
                <TableCell className="text-right">{formatCurrencyIDR(totalInvoiceAmount)}</TableCell>
                <TableCell className="text-right text-destructive">{formatCurrencyIDR(totalOutstanding)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notes */}
      {letter.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Catatan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{letter.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Comments / Activity Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Aktivitas Penagihan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add comment */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Tulis catatan aktivitas penagihan... (misal: Sudah telepon customer, janji bayar tgl X)"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[60px] resize-none"
            />
            <Button
              onClick={handleAddComment}
              disabled={sendingComment || !newComment.trim()}
              size="icon"
              className="shrink-0 self-end h-10 w-10"
            >
              {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <Separator />

          {/* Timeline */}
          {comments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Belum ada catatan aktivitas penagihan
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {comment.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="w-px flex-1 bg-border mt-1"></div>
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground">{comment.user_name}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{comment.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
