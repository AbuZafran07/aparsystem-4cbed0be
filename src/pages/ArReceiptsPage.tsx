import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Wallet, Search, Eye, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportToCSV, exportToExcel, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';

interface ReceiptAllocation {
  id: string;
  amount: number;
  ar_invoice_id: string;
  ar_invoices: {
    invoice_number: string;
    order_number: string;
    invoice_amount: number;
    customers: {
      customer_name: string;
    };
  };
}

interface Receipt {
  id: string;
  receipt_date: string;
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
  allocations?: ReceiptAllocation[];
}

export default function ArReceiptsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ar_receipts')
        .select(`
          *,
          bank_accounts(bank_name, account_no, account_name)
        `)
        .order('receipt_date', { ascending: false });

      if (error) throw error;
      setReceipts(data || []);
    } catch (error: any) {
      console.error('Error fetching receipts:', error);
      toast.error(language === 'en' ? 'Failed to load receipts' : 'Gagal memuat penerimaan');
    } finally {
      setLoading(false);
    }
  };

  const fetchReceiptAllocations = async (receiptId: string) => {
    try {
      const { data, error } = await supabase
        .from('ar_receipt_allocations')
        .select(`
          *,
          ar_invoices(
            invoice_number,
            order_number,
            invoice_amount,
            customers(customer_name)
          )
        `)
        .eq('receipt_id', receiptId);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error fetching allocations:', error);
      return [];
    }
  };

  const handleViewDetail = async (receipt: Receipt) => {
    const allocations = await fetchReceiptAllocations(receipt.id);
    setSelectedReceipt({ ...receipt, allocations });
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

  const filteredReceipts = receipts.filter(receipt => {
    const search = searchTerm.toLowerCase();
    return (
      receipt.reference_no?.toLowerCase().includes(search) ||
      receipt.bank_accounts?.bank_name.toLowerCase().includes(search) ||
      receipt.bank_accounts?.account_no.includes(search) ||
      receipt.notes?.toLowerCase().includes(search)
    );
  });

  const handleExport = (type: 'csv' | 'excel') => {
    const exportData = filteredReceipts.map(r => ({
      receipt_date: r.receipt_date,
      reference_no: r.reference_no || '-',
      bank_name: r.bank_accounts?.bank_name || '-',
      account_no: r.bank_accounts?.account_no || '-',
      total_amount: r.total_amount,
      notes: r.notes || '-',
    }));

    const columns = [
      { key: 'receipt_date', header: language === 'en' ? 'Receipt Date' : 'Tanggal Penerimaan', format: formatDateForExport },
      { key: 'reference_no', header: language === 'en' ? 'Reference No' : 'No Referensi' },
      { key: 'bank_name', header: language === 'en' ? 'Bank' : 'Bank' },
      { key: 'account_no', header: language === 'en' ? 'Account No' : 'No Rekening' },
      { key: 'total_amount', header: language === 'en' ? 'Amount' : 'Jumlah', format: (v: number) => formatCurrencyForExport(v) },
      { key: 'notes', header: language === 'en' ? 'Notes' : 'Catatan' },
    ];

    const filename = `ar_receipts_${format(new Date(), 'yyyyMMdd')}`;
    if (type === 'csv') {
      exportToCSV(exportData, columns, filename);
    } else {
      exportToExcel(exportData, columns, filename);
    }
  };

  const totalReceipts = filteredReceipts.reduce((sum, r) => sum + r.total_amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {language === 'en' ? 'AR Receipts' : 'Penerimaan AR'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {language === 'en' ? 'View all customer receipt transactions' : 'Lihat semua transaksi penerimaan customer'}
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
              <p className="text-2xl font-bold text-foreground">{filteredReceipts.length}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'Total Received' : 'Total Diterima'}
              </p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totalReceipts)}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'This Month' : 'Bulan Ini'}
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(
                  filteredReceipts
                    .filter(r => new Date(r.receipt_date).getMonth() === new Date().getMonth())
                    .reduce((sum, r) => sum + r.total_amount, 0)
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
                <TableHead>{language === 'en' ? 'Receipt Date' : 'Tanggal Penerimaan'}</TableHead>
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
              ) : filteredReceipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No receipts found' : 'Tidak ada penerimaan ditemukan'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredReceipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell>{format(new Date(receipt.receipt_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{receipt.reference_no || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{receipt.bank_accounts?.bank_name}</p>
                        <p className="text-sm text-muted-foreground">{receipt.bank_accounts?.account_no}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-primary">
                      {formatCurrency(receipt.total_amount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {receipt.notes || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetail(receipt)}
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
              {language === 'en' ? 'Receipt Detail' : 'Detail Penerimaan'}
            </DialogTitle>
            <DialogDescription>
              {selectedReceipt && format(new Date(selectedReceipt.receipt_date), 'dd MMMM yyyy')}
            </DialogDescription>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Reference No' : 'No Referensi'}</p>
                  <p className="font-medium">{selectedReceipt.reference_no || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Amount' : 'Total Jumlah'}</p>
                  <p className="font-medium text-primary">{formatCurrency(selectedReceipt.total_amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Bank Account' : 'Rekening Bank'}</p>
                  <p className="font-medium">{selectedReceipt.bank_accounts?.bank_name} - {selectedReceipt.bank_accounts?.account_no}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Notes' : 'Catatan'}</p>
                  <p className="font-medium">{selectedReceipt.notes || '-'}</p>
                </div>
              </div>

              {/* Allocations */}
              <div>
                <h4 className="font-semibold mb-3">{language === 'en' ? 'Invoice Allocations' : 'Alokasi Invoice'}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'en' ? 'Customer' : 'Customer'}</TableHead>
                      <TableHead>{language === 'en' ? 'Invoice No' : 'No Invoice'}</TableHead>
                      <TableHead>{language === 'en' ? 'Order No' : 'No Order'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Invoice Amount' : 'Jumlah Invoice'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Received Amount' : 'Jumlah Diterima'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReceipt.allocations?.map((alloc) => (
                      <TableRow key={alloc.id}>
                        <TableCell>{alloc.ar_invoices.customers.customer_name}</TableCell>
                        <TableCell>{alloc.ar_invoices.invoice_number}</TableCell>
                        <TableCell>{alloc.ar_invoices.order_number}</TableCell>
                        <TableCell className="text-right">{formatCurrency(alloc.ar_invoices.invoice_amount)}</TableCell>
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
