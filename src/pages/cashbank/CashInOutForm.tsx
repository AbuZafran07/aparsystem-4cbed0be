import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type CashBankTransaction = Tables<'cash_bank_transactions'>;
type BankAccount = Tables<'bank_accounts'>;
type Account = Tables<'chart_of_accounts'>;

const statusBadge: Record<string, { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { en: 'Draft', id: 'Draft', variant: 'secondary' },
  APPROVED: { en: 'Approved', id: 'Disetujui', variant: 'default' },
  REJECTED: { en: 'Rejected', id: 'Ditolak', variant: 'destructive' },
  CANCELLED: { en: 'Cancelled', id: 'Dibatalkan', variant: 'destructive' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const todayStr = () => new Date().toISOString().split('T')[0];

interface CashInOutFormProps {
  transactionType: 'CASH_IN' | 'CASH_OUT';
}

export default function CashInOutForm({ transactionType }: CashInOutFormProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isCashIn = transactionType === 'CASH_IN';
  const title = isCashIn ? (language === 'en' ? 'Cash In' : 'Kas Masuk') : (language === 'en' ? 'Cash Out' : 'Kas Keluar');
  const contraLabel = isCashIn
    ? (language === 'en' ? 'Source Account (Credit)' : 'Akun Sumber (Kredit)')
    : (language === 'en' ? 'Expense/Destination Account (Debit)' : 'Akun Tujuan/Beban (Debit)');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transactionDate, setTransactionDate] = useState(todayStr());
  const [bankAccountId, setBankAccountId] = useState('');
  const [contraAccountId, setContraAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');

  const queryKey = ['cash_bank_transactions', transactionType];

  const { data: transactions = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_bank_transactions')
        .select('*')
        .eq('transaction_type', transactionType)
        .order('transaction_date', { ascending: false })
        .order('transaction_no', { ascending: false });
      if (error) throw error;
      return data as CashBankTransaction[];
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank_accounts', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bank_accounts').select('*').eq('is_active', true).order('bank_name');
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart_of_accounts', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('code');
      if (error) throw error;
      return data as Account[];
    },
  });

  const bankLabel = (id: string) => {
    const b = bankAccounts.find(x => x.id === id);
    return b ? `${b.bank_name} - ${b.account_no}` : '-';
  };
  const accountLabel = (id: string | null) => {
    if (!id) return '-';
    const a = accounts.find(x => x.id === id);
    return a ? `${a.code} - ${a.name}` : '-';
  };

  const resetForm = () => {
    setTransactionDate(todayStr());
    setBankAccountId('');
    setContraAccountId('');
    setAmount('');
    setDescription('');
    setReferenceNo('');
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleCreate = async () => {
    const amountNum = parseFloat(amount);
    if (!bankAccountId || !contraAccountId || !amountNum || amountNum <= 0) {
      toast({
        title: 'Error',
        description: language === 'en' ? 'Please fill bank/cash account, contra account, and a positive amount' : 'Mohon isi akun bank/kas, akun lawan, dan jumlah yang lebih dari 0',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      const { data: txNo, error: noErr } = await supabase.rpc('generate_cash_bank_no');
      if (noErr) throw noErr;

      const { error } = await supabase.from('cash_bank_transactions').insert({
        transaction_no: txNo as string,
        transaction_type: transactionType,
        transaction_date: transactionDate,
        bank_account_id: bankAccountId,
        contra_account_id: contraAccountId,
        amount: amountNum,
        description: description || null,
        reference_no: referenceNo || null,
        status: 'DRAFT',
        created_by: user?.id || '',
      });
      if (error) throw error;

      toast({ title: language === 'en' ? 'Saved as draft' : 'Disimpan sebagai draft', description: txNo as string });
      setIsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">
            {isCashIn
              ? (language === 'en' ? 'Record cash/bank receipts and post them to the General Ledger' : 'Catat penerimaan kas/bank dan posting ke General Ledger')
              : (language === 'en' ? 'Record cash/bank disbursements and post them to the General Ledger' : 'Catat pengeluaran kas/bank dan posting ke General Ledger')}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {title}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'No' : 'No'}</TableHead>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Bank/Cash Account' : 'Akun Bank/Kas'}</TableHead>
                <TableHead>{language === 'en' ? 'Contra Account' : 'Akun Lawan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                <TableHead>{language === 'en' ? 'Description' : 'Keterangan'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : transactions.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No data found' : 'Tidak ada data'}</TableCell></TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs">{tx.transaction_no}</TableCell>
                    <TableCell>{new Date(tx.transaction_date).toLocaleDateString('id-ID')}</TableCell>
                    <TableCell>{bankLabel(tx.bank_account_id)}</TableCell>
                    <TableCell>{accountLabel(tx.contra_account_id)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(tx.amount)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
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
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Date' : 'Tanggal'} *</Label>
                <Input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Amount' : 'Jumlah'} *</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Bank/Cash Account' : 'Akun Bank/Kas'} *</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.account_no}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{contraLabel} *</Label>
              <Select value={contraAccountId} onValueChange={setContraAccountId}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Reference No' : 'No. Referensi'}</Label>
              <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Description' : 'Keterangan'}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Save as Draft' : 'Simpan sebagai Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
