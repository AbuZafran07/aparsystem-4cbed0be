import React, { useState, useEffect } from 'react';
import { Search, Filter, Eye, Printer, Check, X, Loader2, Download, FileText, Trash2, FileDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generatePaymentRequestHTML, printPaymentRequest, previewPaymentRequest, downloadPaymentRequestPDF, PaymentRequestData } from '@/lib/paymentRequestUtils';
import { exportToCSV, exportToExcel, formatDateForExport, formatCurrencyForExport, ExportColumn } from '@/lib/exportUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PaymentRequest {
  id: string;
  request_no: string;
  ap_invoice_id: string;
  request_date: string;
  requested_by: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  submitted_amount: number;
  approved_amount: number | null;
  // Joined data
  vendor_name: string;
  vendor_invoice_number: string;
  po_number: string;
  product_name: string | null;
  invoice_amount: number;
  outstanding_amount: number;
  due_date: string;
  invoice_status: string;
  requester_name: string;
  approver_name: string | null;
  vendor_bank_name: string | null;
  vendor_bank_account_no: string | null;
}

interface CompanyProfile {
  company_name: string;
  brand_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

const statusConfig: Record<string, { label: { en: string; id: string }; className: string }> = {
  PENDING: { label: { en: 'Pending', id: 'Menunggu' }, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
  APPROVED: { label: { en: 'Approved', id: 'Disetujui' }, className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  PAID: { label: { en: 'Paid', id: 'Dibayar' }, className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  CANCELLED: { label: { en: 'Cancelled', id: 'Dibatalkan' }, className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
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

type StatusTab = 'ALL' | 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';

const statusTabs: { value: StatusTab; label: { en: string; id: string }; statuses: string[] }[] = [
  { value: 'ALL', label: { en: 'All', id: 'Semua' }, statuses: ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'] },
  { value: 'PENDING', label: { en: 'Pending', id: 'Menunggu' }, statuses: ['PENDING'] },
  { value: 'APPROVED', label: { en: 'Approved', id: 'Disetujui' }, statuses: ['APPROVED'] },
  { value: 'PAID', label: { en: 'Paid', id: 'Dibayar' }, statuses: ['PAID'] },
  { value: 'CANCELLED', label: { en: 'Cancelled', id: 'Dibatalkan' }, statuses: ['CANCELLED'] },
];

export default function PaymentRequestsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [approveAmount, setApproveAmount] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');

  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch payment requests with joined data
      const { data: requestsData, error: requestsError } = await supabase
        .from('payment_requests')
        .select(`
          *,
          ap_invoices (
            vendor_invoice_number,
            po_number,
            product_name,
            invoice_amount,
            outstanding_amount,
            due_date,
            status,
            vendors (vendor_name, bank_name, bank_account_no)
          )
        `)
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Fetch requester names
      const requesterIds = [...new Set((requestsData || []).map(r => r.requested_by))];
      const approverIds = [...new Set((requestsData || []).filter(r => r.approved_by).map(r => r.approved_by))];
      const allUserIds = [...new Set([...requesterIds, ...approverIds])];

      let profilesMap: Record<string, string> = {};
      if (allUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', allUserIds);

        profilesMap = (profilesData || []).reduce((acc, p) => {
          acc[p.user_id] = p.full_name;
          return acc;
        }, {} as Record<string, string>);
      }

      const formattedRequests: PaymentRequest[] = (requestsData || []).map((req: any) => ({
        id: req.id,
        request_no: req.request_no,
        ap_invoice_id: req.ap_invoice_id,
        request_date: req.request_date,
        requested_by: req.requested_by,
        status: req.status,
        approved_by: req.approved_by,
        approved_at: req.approved_at,
        paid_at: req.paid_at,
        notes: req.notes,
        created_at: req.created_at,
        submitted_amount: req.submitted_amount || 0,
        approved_amount: req.approved_amount ?? null,
        vendor_name: req.ap_invoices?.vendors?.vendor_name || 'Unknown',
        vendor_invoice_number: req.ap_invoices?.vendor_invoice_number || '',
        po_number: req.ap_invoices?.po_number || '',
        product_name: req.ap_invoices?.product_name,
        invoice_amount: req.ap_invoices?.invoice_amount || 0,
        outstanding_amount: req.ap_invoices?.outstanding_amount || 0,
        due_date: req.ap_invoices?.due_date || req.request_date,
        invoice_status: req.ap_invoices?.status || '',
        requester_name: profilesMap[req.requested_by] || 'Unknown',
        approver_name: req.approved_by ? profilesMap[req.approved_by] || 'Unknown' : null,
        vendor_bank_name: req.ap_invoices?.vendors?.bank_name || null,
        vendor_bank_account_no: req.ap_invoices?.vendors?.bank_account_no || null,
      }));

      setRequests(formattedRequests);

      // Fetch company profile
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

  const openApproveDialog = (request: PaymentRequest) => {
    setSelectedRequest(request);
    setApproveAmount(request.submitted_amount.toString());
    setIsApproveDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    const amount = parseFloat(approveAmount) || 0;
    if (amount <= 0) {
      toast.error(language === 'en' ? 'Please enter approved amount' : 'Mohon masukkan nilai yang disetujui');
      return;
    }
    // Validate: approved amount cannot exceed submitted amount
    if (amount > selectedRequest.submitted_amount) {
      toast.error(language === 'en' 
        ? 'Approved amount cannot exceed submitted amount' 
        : 'Nilai approved tidak boleh melebihi nilai pengajuan');
      return;
    }
    // Validate: approved amount cannot exceed outstanding amount
    if (amount > selectedRequest.outstanding_amount) {
      toast.error(language === 'en' 
        ? 'Approved amount cannot exceed outstanding amount' 
        : 'Nilai approved tidak boleh melebihi sisa outstanding');
      return;
    }
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'APPROVED',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          approved_amount: amount,
        } as any)
        .eq('id', selectedRequest.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Payment request approved' : 'Pengajuan pembayaran disetujui');
      setIsApproveDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error approving:', error);
      toast.error(language === 'en' ? 'Failed to approve' : 'Gagal menyetujui');
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkAsPaid = async (request: PaymentRequest) => {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'PAID',
          paid_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Marked as paid' : 'Ditandai sebagai dibayar');
      fetchData();
    } catch (error: any) {
      console.error('Error marking as paid:', error);
      toast.error(language === 'en' ? 'Failed to update' : 'Gagal memperbarui');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async (request: PaymentRequest) => {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('payment_requests')
        .update({ status: 'CANCELLED' })
        .eq('id', request.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Payment request cancelled' : 'Pengajuan pembayaran dibatalkan');
      fetchData();
    } catch (error: any) {
      console.error('Error cancelling:', error);
      toast.error(language === 'en' ? 'Failed to cancel' : 'Gagal membatalkan');
    } finally {
      setProcessing(false);
    }
  };

  const getPaymentRequestData = (request: PaymentRequest): PaymentRequestData => {
    return {
      requestNo: request.request_no,
      requestDate: request.request_date,
      vendorName: request.vendor_name,
      vendorInvoiceNumber: request.vendor_invoice_number,
      poNumber: request.po_number,
      productName: request.product_name || undefined,
      spPoDate: request.request_date,
      invoiceDate: request.request_date,
      dueDate: request.due_date || request.request_date,
      invoiceAmount: request.invoice_amount,
      outstandingAmount: request.outstanding_amount,
      overdueDays: 0,
      notes: request.notes || undefined,
      companyName: companyProfile?.company_name || companyProfile?.brand_name || 'Company',
      companyAddress: companyProfile?.address || undefined,
      companyPhone: companyProfile?.phone || undefined,
      companyEmail: companyProfile?.email || undefined,
      companyLogoUrl: companyProfile?.logo_url || undefined,
      requestedBy: request.requester_name,
      status: request.status,
      submittedAmount: request.submitted_amount,
      approvedAmount: request.approved_amount ?? undefined,
      bankName: request.vendor_bank_name || undefined,
      bankAccountNo: request.vendor_bank_account_no || undefined,
      transferAmount: request.approved_amount || request.submitted_amount,
    };
  };

  const handlePrint = (request: PaymentRequest) => {
    const requestData = getPaymentRequestData(request);
    const html = generatePaymentRequestHTML(requestData);
    printPaymentRequest(html);
  };

  const handlePreview = (request: PaymentRequest) => {
    const requestData = getPaymentRequestData(request);
    const html = generatePaymentRequestHTML(requestData);
    setPreviewHtml(html);
    setSelectedRequest(request);
    setIsPreviewDialogOpen(true);
  };

  const handleDownloadPDF = async (request: PaymentRequest) => {
    const requestData = getPaymentRequestData(request);
    const html = generatePaymentRequestHTML(requestData);

    try {
      toast.loading(language === 'en' ? 'Generating PDF...' : 'Membuat PDF...', { id: 'pdf-download-pr' });
      await downloadPaymentRequestPDF(html, `Pengajuan_Pembayaran_${request.request_no}.pdf`);
      toast.success(language === 'en' ? 'PDF downloaded' : 'PDF berhasil diunduh', { id: 'pdf-download-pr' });
    } catch (e) {
      console.error('Payment Request PDF download error:', e);
      toast.error(language === 'en' ? 'Failed to download PDF' : 'Gagal mengunduh PDF', { id: 'pdf-download-pr' });
    }
  };

  const handleDelete = async () => {
    if (!selectedRequest) return;
    
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('payment_requests')
        .delete()
        .eq('id', selectedRequest.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Payment request deleted' : 'Pengajuan pembayaran dihapus');
      setIsDeleteDialogOpen(false);
      setSelectedRequest(null);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(language === 'en' ? 'Failed to delete' : 'Gagal menghapus');
    } finally {
      setProcessing(false);
    }
  };

  const openDeleteDialog = (request: PaymentRequest) => {
    setSelectedRequest(request);
    setIsDeleteDialogOpen(true);
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const columns: ExportColumn[] = [
      { key: 'request_no', header: language === 'en' ? 'Request No' : 'No. Pengajuan' },
      { key: 'request_date', header: language === 'en' ? 'Request Date' : 'Tanggal', format: formatDateForExport },
      { key: 'vendor_name', header: language === 'en' ? 'Vendor' : 'Vendor' },
      { key: 'vendor_invoice_number', header: language === 'en' ? 'Invoice No' : 'No. Invoice' },
      { key: 'po_number', header: 'No. PO' },
      { key: 'invoice_amount', header: language === 'en' ? 'Amount' : 'Jumlah', format: formatCurrencyForExport },
      { key: 'status', header: 'Status' },
      { key: 'requester_name', header: language === 'en' ? 'Requested By' : 'Diajukan Oleh' },
      { key: 'approver_name', header: language === 'en' ? 'Approved By' : 'Disetujui Oleh' },
    ];

    const filename = `Payment_Requests_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      exportToCSV(filteredRequests, columns, filename);
    } else {
      exportToExcel(filteredRequests, columns, filename);
    }
    toast.success(language === 'en' ? 'Export successful' : 'Ekspor berhasil');
  };

  const activeTabStatuses = statusTabs.find(tab => tab.value === activeTab)?.statuses || [];

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.request_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.vendor_invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.po_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = activeTabStatuses.includes(req.status);
    return matchesSearch && matchesStatus;
  });

  const getTabCount = (statuses: string[]) => {
    return requests.filter(req => statuses.includes(req.status)).length;
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
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Payment Requests' : 'Pengajuan Pembayaran'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en'
              ? 'Track and manage payment request documents'
              : 'Lacak dan kelola dokumen pengajuan pembayaran'}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              {language === 'en' ? 'Export' : 'Ekspor'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              {language === 'en' ? 'Export CSV' : 'Ekspor CSV'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('excel')}>
              {language === 'en' ? 'Export Excel' : 'Ekspor Excel'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const count = getTabCount(tab.statuses);
          return (
            <Button
              key={tab.value}
              variant={activeTab === tab.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.value)}
              className="gap-2"
            >
              {tab.label[language]}
              <Badge variant="secondary" className="ml-1">
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder={language === 'en' ? 'Search...' : 'Cari...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Request No' : 'No. Pengajuan'}</TableHead>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Vendor' : 'Vendor'}</TableHead>
                <TableHead>{language === 'en' ? 'Invoice' : 'Invoice'}</TableHead>
                <TableHead>{language === 'en' ? 'Cost Description' : 'Keterangan Biaya'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Invoice Amount' : 'Nilai Invoice'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Submitted Amount' : 'Nilai Pengajuan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Approved Amount' : 'Nilai Approved'}</TableHead>
                <TableHead>{language === 'en' ? 'Requested By' : 'Diajukan Oleh'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No data found' : 'Tidak ada data'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {request.request_no}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(request.request_date)}</TableCell>
                    <TableCell>{request.vendor_name}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{request.vendor_invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{request.po_number}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{request.notes || '-'}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(request.invoice_amount)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {request.submitted_amount > 0 ? formatCurrency(request.submitted_amount) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {request.approved_amount !== null && request.approved_amount !== undefined ? formatCurrency(request.approved_amount) : '-'}
                    </TableCell>
                    <TableCell>{request.requester_name}</TableCell>
                    <TableCell>
                      <Badge className={cn('text-xs', statusConfig[request.status]?.className)}>
                        {statusConfig[request.status]?.label[language] || request.status}
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
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => {
                              setSelectedRequest(request);
                              setIsViewDialogOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                            {language === 'en' ? 'View' : 'Lihat'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handlePreview(request)}>
                            <FileText className="w-4 h-4" />
                            {language === 'en' ? 'Preview' : 'Preview'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handlePrint(request)}>
                            <Printer className="w-4 h-4" />
                            {language === 'en' ? 'Print' : 'Cetak'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleDownloadPDF(request)}>
                            <FileDown className="w-4 h-4" />
                            {language === 'en' ? 'Download PDF' : 'Download PDF'}
                          </DropdownMenuItem>
                          {isFinance && request.status === 'PENDING' && (
                            <>
                              <DropdownMenuItem
                                className="gap-2 text-success"
                                onClick={() => openApproveDialog(request)}
                                disabled={processing}
                              >
                                <Check className="w-4 h-4" />
                                {language === 'en' ? 'Approve' : 'Setujui'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-destructive"
                                onClick={() => handleCancel(request)}
                                disabled={processing}
                              >
                                <X className="w-4 h-4" />
                                {language === 'en' ? 'Cancel' : 'Batalkan'}
                              </DropdownMenuItem>
                            </>
                          )}
                          {isFinance && request.status === 'APPROVED' && (
                            <DropdownMenuItem
                              className="gap-2 text-success"
                              onClick={() => handleMarkAsPaid(request)}
                              disabled={processing}
                            >
                              <Check className="w-4 h-4" />
                              {language === 'en' ? 'Mark as Paid' : 'Tandai Dibayar'}
                            </DropdownMenuItem>
                          )}
                          {(isSuperAdmin || (request.status === 'PENDING' && request.requested_by === user?.id)) && (
                            <DropdownMenuItem
                              className="gap-2 text-destructive"
                              onClick={() => openDeleteDialog(request)}
                              disabled={processing}
                            >
                              <Trash2 className="w-4 h-4" />
                              {language === 'en' ? 'Delete' : 'Hapus'}
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

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Payment Request Details' : 'Detail Pengajuan Pembayaran'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.request_no}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Request Date' : 'Tanggal Pengajuan'}</p>
                  <p className="font-medium">{formatDate(selectedRequest.request_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={cn('text-xs', statusConfig[selectedRequest.status]?.className)}>
                    {statusConfig[selectedRequest.status]?.label[language] || selectedRequest.status}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">{language === 'en' ? 'Invoice Information' : 'Informasi Invoice'}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Vendor</p>
                    <p className="font-medium">{selectedRequest.vendor_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Invoice No' : 'No. Invoice'}</p>
                    <p className="font-medium">{selectedRequest.vendor_invoice_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">No. PO</p>
                    <p className="font-medium">{selectedRequest.po_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Invoice Amount' : 'Nilai Invoice'}</p>
                    <p className="font-medium">{formatCurrency(selectedRequest.invoice_amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Submitted Amount' : 'Nilai Pengajuan'}</p>
                    <p className="font-medium">{formatCurrency(selectedRequest.submitted_amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Approved Amount' : 'Nilai Approved'}</p>
                    <p className="font-medium">
                      {selectedRequest.approved_amount !== null && selectedRequest.approved_amount !== undefined 
                        ? formatCurrency(selectedRequest.approved_amount) 
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">{language === 'en' ? 'Approval History' : 'Riwayat Persetujuan'}</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <span className="text-sm">
                      {language === 'en' ? 'Requested by' : 'Diajukan oleh'}: <strong>{selectedRequest.requester_name}</strong>
                    </span>
                  </div>
                  {selectedRequest.approver_name && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-accent"></div>
                      <span className="text-sm">
                        {language === 'en' ? 'Approved by' : 'Disetujui oleh'}: <strong>{selectedRequest.approver_name}</strong>
                        {selectedRequest.approved_at && (
                          <span className="text-muted-foreground ml-1">
                            ({formatDate(selectedRequest.approved_at)})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedRequest.paid_at && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                      <span className="text-sm">
                        {language === 'en' ? 'Paid on' : 'Dibayar pada'}: <strong>{formatDate(selectedRequest.paid_at)}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedRequest.notes && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">{language === 'en' ? 'Notes' : 'Catatan'}</h4>
                  <p className="text-sm text-muted-foreground">{selectedRequest.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
            {selectedRequest && (
              <Button onClick={() => handlePrint(selectedRequest)} className="gap-2">
                <Printer className="w-4 h-4" />
                {language === 'en' ? 'Print' : 'Cetak'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {language === 'en' ? 'Document Preview' : 'Preview Dokumen'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.request_no}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-6 pt-4">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-[60vh] border rounded-lg bg-white"
              title="Payment Request Preview"
              sandbox="allow-same-origin"
            />
          </div>

          <DialogFooter className="p-6 pt-0 gap-2">
            <Button variant="outline" onClick={() => setIsPreviewDialogOpen(false)}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
            {selectedRequest && (
              <>
                <Button variant="outline" onClick={() => handleDownloadPDF(selectedRequest)} className="gap-2">
                  <FileDown className="w-4 h-4" />
                  {language === 'en' ? 'Download PDF' : 'Download PDF'}
                </Button>
                <Button onClick={() => handlePrint(selectedRequest)} className="gap-2">
                  <Printer className="w-4 h-4" />
                  {language === 'en' ? 'Print' : 'Cetak'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'en' ? 'Delete Payment Request?' : 'Hapus Pengajuan Pembayaran?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete payment request "${selectedRequest?.request_no}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus pengajuan pembayaran "${selectedRequest?.request_no}"? Tindakan ini tidak dapat dibatalkan.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {language === 'en' ? 'Delete' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Dialog with Amount Input */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Approve Payment Request' : 'Setujui Pengajuan Pembayaran'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.request_no} - {selectedRequest?.vendor_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                {language === 'en' ? 'Invoice Amount' : 'Nilai Invoice'}
              </p>
              <p className="font-medium">{selectedRequest ? formatCurrency(selectedRequest.invoice_amount) : '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                {language === 'en' ? 'Submitted Amount' : 'Nilai Pengajuan'}
              </p>
              <p className="font-medium">{selectedRequest ? formatCurrency(selectedRequest.submitted_amount) : '-'}</p>
            </div>
            {selectedRequest?.notes && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  {language === 'en' ? 'Cost Description' : 'Keterangan Biaya'}
                </p>
                <p className="text-sm">{selectedRequest.notes}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">
                {language === 'en' ? 'Approved Amount' : 'Nilai yang Disetujui'}
              </label>
              <Input
                type="number"
                value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)}
                placeholder="0"
                max={selectedRequest ? Math.min(selectedRequest.submitted_amount, selectedRequest.outstanding_amount) : undefined}
                className="mt-1"
              />
              {selectedRequest && (
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'en' 
                    ? `Max: ${formatCurrency(Math.min(selectedRequest.submitted_amount, selectedRequest.outstanding_amount))} (cannot exceed submitted or outstanding amount)`
                    : `Maks: ${formatCurrency(Math.min(selectedRequest.submitted_amount, selectedRequest.outstanding_amount))} (tidak boleh melebihi nilai pengajuan atau outstanding)`}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} disabled={processing}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </Button>
            <Button onClick={handleApprove} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Check className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Approve' : 'Setujui'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
