import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CreditCard, Search, Eye, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportToCSV, exportToExcel, exportToPDF, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';

interface PaymentAllocation {
  id: string;
  amount: number;
  ap_invoice_id: string;
  ap_invoices: {
    vendor_invoice_number: string;
    po_number: string;
    invoice_amount: number;
    vendors: {
      vendor_name: string;
    };
  };
}

interface Payment {
  id: string;
  payment_date: string;
  total_amount: number;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
  bank_accounts: {
    bank_name: string;
    account_no: string;
    account_name: string;
  } | null;
  allocations?: PaymentAllocation[];
}

export default function ApPaymentsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ap_payments')
        .select(`
          *,
          bank_accounts(bank_name, account_no, account_name)
        `)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error: any) {
      console.error('Error fetching payments:', error);
      toast.error(language === 'en' ? 'Failed to load payments' : 'Gagal memuat pembayaran');
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentAllocations = async (paymentId: string) => {
    try {
      const { data, error } = await supabase
        .from('ap_payment_allocations')
        .select(`
          *,
          ap_invoices(
            vendor_invoice_number,
            po_number,
            invoice_amount,
            vendors(vendor_name)
          )
        `)
        .eq('payment_id', paymentId);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error fetching allocations:', error);
      return [];
    }
  };

  const handleViewDetail = async (payment: Payment) => {
    const allocations = await fetchPaymentAllocations(payment.id);
    setSelectedPayment({ ...payment, allocations });
    setIsDetailDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const filteredPayments = payments.filter(payment => {
    const search = searchTerm.toLowerCase();
    return (
      payment.reference_no?.toLowerCase().includes(search) ||
      payment.bank_accounts?.bank_name.toLowerCase().includes(search) ||
      payment.bank_accounts?.account_no.includes(search) ||
      payment.notes?.toLowerCase().includes(search)
    );
  });

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const exportData = filteredPayments.map(p => ({
      payment_date: p.payment_date,
      reference_no: p.reference_no || '-',
      bank_name: p.bank_accounts?.bank_name || '-',
      account_no: p.bank_accounts?.account_no || '-',
      total_amount: p.total_amount,
      notes: p.notes || '-',
    }));

    const columns = [
      { key: 'payment_date', header: language === 'en' ? 'Payment Date' : 'Tanggal Pembayaran', format: formatDateForExport },
      { key: 'reference_no', header: language === 'en' ? 'Reference No' : 'No Referensi' },
      { key: 'bank_name', header: language === 'en' ? 'Bank' : 'Bank' },
      { key: 'account_no', header: language === 'en' ? 'Account No' : 'No Rekening' },
      { key: 'total_amount', header: language === 'en' ? 'Amount' : 'Jumlah', format: (v: number) => formatCurrencyForExport(v) },
      { key: 'notes', header: language === 'en' ? 'Notes' : 'Catatan' },
    ];

    const filename = `ap_payments_${format(new Date(), 'yyyyMMdd')}`;
    if (type === 'csv') {
      exportToCSV(exportData, columns, filename);
    } else if (type === 'pdf') {
      exportToPDF(exportData, columns, filename, language === 'en' ? 'AP Payments Report' : 'Laporan Pembayaran AP');
    } else {
      exportToExcel(exportData, columns, filename);
    }
  };

  const totalPayments = filteredPayments.reduce((sum, p) => sum + p.total_amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {language === 'en' ? 'AP Payments' : 'Pembayaran AP'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {language === 'en' ? 'View all vendor payment transactions' : 'Lihat semua transaksi pembayaran vendor'}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
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
            <DropdownMenuItem onClick={() => handleExport('pdf')}>
              Export PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'Total Transactions' : 'Total Transaksi'}
              </p>
              <p className="text-2xl font-bold text-foreground">{filteredPayments.length}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'Total Paid' : 'Total Dibayar'}
              </p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totalPayments)}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'This Month' : 'Bulan Ini'}
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(
                  filteredPayments
                    .filter(p => new Date(p.payment_date).getMonth() === new Date().getMonth())
                    .reduce((sum, p) => sum + p.total_amount, 0)
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder={language === 'en' ? 'Search by reference, bank...' : 'Cari berdasarkan referensi, bank...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Payment Date' : 'Tanggal Pembayaran'}</TableHead>
                <TableHead>{language === 'en' ? 'Reference No' : 'No Referensi'}</TableHead>
                <TableHead>{language === 'en' ? 'Bank Account' : 'Rekening Bank'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                <TableHead>{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
                <TableHead className="text-center">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No payments found' : 'Tidak ada pembayaran ditemukan'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{format(new Date(payment.payment_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{payment.reference_no || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{payment.bank_accounts?.bank_name}</p>
                        <p className="text-sm text-muted-foreground">{payment.bank_accounts?.account_no}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-primary">
                      {formatCurrency(payment.total_amount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {payment.notes || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetail(payment)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Payment Detail' : 'Detail Pembayaran'}
            </DialogTitle>
            <DialogDescription>
              {selectedPayment && format(new Date(selectedPayment.payment_date), 'dd MMMM yyyy')}
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Reference No' : 'No Referensi'}</p>
                  <p className="font-medium">{selectedPayment.reference_no || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Amount' : 'Total Jumlah'}</p>
                  <p className="font-medium text-primary">{formatCurrency(selectedPayment.total_amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Bank Account' : 'Rekening Bank'}</p>
                  <p className="font-medium">{selectedPayment.bank_accounts?.bank_name} - {selectedPayment.bank_accounts?.account_no}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Notes' : 'Catatan'}</p>
                  <p className="font-medium">{selectedPayment.notes || '-'}</p>
                </div>
              </div>

              {/* Allocations */}
              <div>
                <h4 className="font-semibold mb-3">{language === 'en' ? 'Invoice Allocations' : 'Alokasi Invoice'}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'en' ? 'Vendor' : 'Vendor'}</TableHead>
                      <TableHead>{language === 'en' ? 'Invoice No' : 'No Invoice'}</TableHead>
                      <TableHead>{language === 'en' ? 'PO No' : 'No PO'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Paid Amount' : 'Jumlah Dibayar'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPayment.allocations?.map((alloc) => (
                      <TableRow key={alloc.id}>
                        <TableCell>{alloc.ap_invoices.vendors.vendor_name}</TableCell>
                        <TableCell>{alloc.ap_invoices.vendor_invoice_number}</TableCell>
                        <TableCell>{alloc.ap_invoices.po_number}</TableCell>
                        <TableCell className="text-right">{formatCurrency(alloc.ap_invoices.invoice_amount)}</TableCell>
                        <TableCell className="text-right font-medium text-primary">{formatCurrency(alloc.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
