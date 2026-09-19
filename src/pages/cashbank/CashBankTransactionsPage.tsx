import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TablePagination, usePagination } from '@/components/TablePagination';
import type { Tables } from '@/integrations/supabase/types';

type CashBankTransaction = Tables<'cash_bank_transactions'>;
type BankAccount = Tables<'bank_accounts'>;
type Account = Tables<'chart_of_accounts'>;

const typeBadge: Record<string, { en: string; id: string; className: string }> = {
  CASH_IN: { en: 'Cash In', id: 'Kas Masuk', className: 'bg-success/15 text-success' },
  CASH_OUT: { en: 'Cash Out', id: 'Kas Keluar', className: 'bg-destructive/15 text-destructive' },
  TRANSFER: { en: 'Transfer', id: 'Transfer', className: 'bg-info/15 text-info' },
};

const statusBadge: Record<string, { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { en: 'Draft', id: 'Draft', variant: 'secondary' },
  APPROVED: { en: 'Approved', id: 'Disetujui', variant: 'default' },
  REJECTED: { en: 'Rejected', id: 'Ditolak', variant: 'destructive' },
  CANCELLED: { en: 'Cancelled', id: 'Dibatalkan', variant: 'destructive' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function CashBankTransactionsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const queryKey = ['cash_bank_transactions', 'all'];

  const { data: transactions = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('transaction_no', { ascending: false });
      if (error) throw error;
      return data as CashBankTransaction[];
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank_accounts', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bank_accounts').select('*').order('bank_name');
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart_of_accounts', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').order('code');
      if (error) throw error;
      return data as Account[];
    },
  });

  const bankLabel = (id: string | null) => {
    if (!id) return '-';
    const b = bankAccounts.find(x => x.id === id);
    return b ? `${b.bank_name} - ${b.account_no}` : '-';
  };
  const accountLabel = (id: string | null) => {
    if (!id) return '-';
    const a = accounts.find(x => x.id === id);
    return a ? `${a.code} - ${a.name}` : '-';
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cash_bank_transactions').update({ status: 'APPROVED' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: language === 'en' ? 'Approved' : 'Disetujui',
        description: language === 'en' ? 'Posted to the General Ledger' : 'Diposting ke General Ledger',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      tx.transaction_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.reference_no || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || tx.transaction_type === typeFilter;
    const matchesAccount = accountFilter === 'all' || tx.bank_account_id === accountFilter || tx.counter_bank_account_id === accountFilter;
    const matchesStatus = statusFilter === 'all' || tx.status === statusFilter;
    let matchesDate = true;
    if (dateFrom) matchesDate = matchesDate && tx.transaction_date >= dateFrom;
    if (dateTo) matchesDate = matchesDate && tx.transaction_date <= dateTo;
    return matchesSearch && matchesType && matchesAccount && matchesStatus && matchesDate;
  });

  const {
    paginatedItems: paginatedTransactions,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(filtered, 25);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Cash & Bank Transactions' : 'Daftar Transaksi Kas & Bank'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'All cash in, cash out, and transfer records' : 'Seluruh catatan kas masuk, kas keluar, dan transfer'}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === 'en' ? 'Search...' : 'Cari...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder={language === 'en' ? 'All Types' : 'Semua Tipe'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Types' : 'Semua Tipe'}</SelectItem>
                {Object.entries(typeBadge).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg[language]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger><SelectValue placeholder={language === 'en' ? 'All Accounts' : 'Semua Akun'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Accounts' : 'Semua Akun'}</SelectItem>
                {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.account_no}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder={language === 'en' ? 'All Status' : 'Semua Status'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                {Object.entries(statusBadge).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg[language]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder={language === 'en' ? 'From Date' : 'Dari Tanggal'} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder={language === 'en' ? 'To Date' : 'Sampai Tanggal'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'No' : 'No'}</TableHead>
                <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Account' : 'Akun'}</TableHead>
                <TableHead>{language === 'en' ? 'Contra/Destination' : 'Lawan/Tujuan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No data found' : 'Tidak ada data'}</TableCell></TableRow>
              ) : (
                paginatedTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs">{tx.transaction_no}</TableCell>
                    <TableCell>
                      <Badge className={typeBadge[tx.transaction_type]?.className}>
                        {typeBadge[tx.transaction_type]?.[language] || tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(tx.transaction_date).toLocaleDateString('id-ID')}</TableCell>
                    <TableCell>{bankLabel(tx.bank_account_id)}</TableCell>
                    <TableCell>
                      {tx.transaction_type === 'TRANSFER' ? bankLabel(tx.counter_bank_account_id) : accountLabel(tx.contra_account_id)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(tx.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadge[tx.status]?.variant || 'secondary'}>
                        {statusBadge[tx.status]?.[language] || tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.status === 'DRAFT' && (
                        <Button
                          size="sm" variant="outline" className="gap-1"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(tx.id)}
                        >
                          <Check className="w-3.5 h-3.5" />{language === 'en' ? 'Approve' : 'Setujui'}
                        </Button>
                      )}
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
    </div>
  );
}
