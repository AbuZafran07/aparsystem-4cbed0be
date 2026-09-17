import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Save, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type BankAccount = Tables<'bank_accounts'>;
type GLRow = Tables<'general_ledger'>;
type Reconciliation = Tables<'bank_reconciliations'>;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const todayStr = () => new Date().toISOString().split('T')[0];

const statusBadge: Record<string, { en: string; id: string; variant: 'default' | 'secondary' }> = {
  DRAFT: { en: 'Draft', id: 'Draft', variant: 'secondary' },
  RECONCILED: { en: 'Reconciled', id: 'Reconciled', variant: 'default' },
};

export default function BankReconciliationPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(todayStr());
  const [statementEndingBalance, setStatementEndingBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [activeReconciliationId, setActiveReconciliationId] = useState<string | null>(null);

  const [glEntries, setGlEntries] = useState<GLRow[]>([]);
  const [clearedElsewhereIds, setClearedElsewhereIds] = useState<Set<string>>(new Set());
  const [descriptionByLineId, setDescriptionByLineId] = useState<Record<string, string>>({});
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank_accounts', 'reconciliation'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bank_accounts').select('*').eq('is_active', true).order('bank_name');
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const bankAccountsWithGl = useMemo(() => bankAccounts.filter(b => b.gl_account_id), [bankAccounts]);
  const selectedBank = bankAccounts.find(b => b.id === selectedBankAccountId) || null;

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['bank_reconciliations', selectedBankAccountId],
    enabled: !!selectedBankAccountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_reconciliations')
        .select('*')
        .eq('bank_account_id', selectedBankAccountId)
        .order('statement_date', { ascending: false });
      if (error) throw error;
      return data as Reconciliation[];
    },
  });

  const resetSession = () => {
    setActiveReconciliationId(null);
    setStatementEndingBalance('');
    setNotes('');
    setCheckedIds(new Set());
  };

  useEffect(() => {
    setCheckedIds(new Set());
  }, [selectedBankAccountId, statementDate]);

  useEffect(() => {
    if (selectedBank?.gl_account_id) {
      fetchEntries(selectedBank.gl_account_id);
    } else {
      setGlEntries([]);
      setClearedElsewhereIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank?.gl_account_id, statementDate]);

  const fetchEntries = async (glAccountId: string) => {
    try {
      setLoadingEntries(true);
      const [{ data: gl, error: glErr }, { data: clearedRows }, { data: jlRows }] = await Promise.all([
        supabase.from('general_ledger').select('*').eq('account_id', glAccountId).lte('posting_date', statementDate).order('posting_date'),
        supabase.from('bank_reconciliation_cleared').select('gl_entry_id'),
        supabase.from('journal_entry_lines').select('id, description'),
      ]);
      if (glErr) throw glErr;
      setGlEntries((gl as GLRow[]) || []);
      setClearedElsewhereIds(new Set((clearedRows || []).map((r: any) => r.gl_entry_id)));
      setDescriptionByLineId(Object.fromEntries((jlRows || []).map((l: any) => [l.id, l.description || ''])));
    } catch (error: any) {
      console.error('Error loading GL entries:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingEntries(false);
    }
  };

  const bookBalance = useMemo(() => glEntries.reduce((s, g) => s + g.debit - g.credit, 0), [glEntries]);
  const unclearedEntries = useMemo(() => glEntries.filter(g => !clearedElsewhereIds.has(g.id)), [glEntries, clearedElsewhereIds]);
  const clearedBalance = useMemo(
    () => unclearedEntries.filter(g => checkedIds.has(g.id)).reduce((s, g) => s + g.debit - g.credit, 0),
    [unclearedEntries, checkedIds]
  );
  const outstandingEntries = useMemo(() => unclearedEntries.filter(g => !checkedIds.has(g.id)), [unclearedEntries, checkedIds]);
  const outstandingTotal = useMemo(() => outstandingEntries.reduce((s, g) => s + g.debit - g.credit, 0), [outstandingEntries]);

  const enteredEndingBalance = parseFloat(statementEndingBalance) || 0;
  const difference = enteredEndingBalance - clearedBalance;
  const isBalanced = statementEndingBalance !== '' && Math.abs(difference) < 1;

  const toggleChecked = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSaveDraft = async () => {
    if (!selectedBankAccountId || !statementDate) {
      toast({ title: 'Error', description: language === 'en' ? 'Please select a bank account and date' : 'Mohon pilih akun bank dan tanggal', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        bank_account_id: selectedBankAccountId,
        statement_date: statementDate,
        statement_ending_balance: enteredEndingBalance,
        notes: notes || null,
        status: 'DRAFT' as const,
      };
      if (activeReconciliationId) {
        const { error } = await supabase.from('bank_reconciliations').update(payload).eq('id', activeReconciliationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('bank_reconciliations').insert([{ ...payload, created_by: user?.id || '' }]).select().single();
        if (error) throw error;
        setActiveReconciliationId(data.id);
      }
      toast({ title: language === 'en' ? 'Saved as draft' : 'Disimpan sebagai draft' });
      refetchHistory();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReconciled = async () => {
    if (!isBalanced) return;
    setSaving(true);
    try {
      const payload = {
        bank_account_id: selectedBankAccountId,
        statement_date: statementDate,
        statement_ending_balance: enteredEndingBalance,
        notes: notes || null,
        status: 'RECONCILED' as const,
        difference,
        reconciled_at: new Date().toISOString(),
      };

      let reconciliationId = activeReconciliationId;
      if (reconciliationId) {
        const { error } = await supabase.from('bank_reconciliations').update(payload).eq('id', reconciliationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('bank_reconciliations').insert([{ ...payload, created_by: user?.id || '' }]).select().single();
        if (error) throw error;
        reconciliationId = data.id;
      }

      const clearedRowsToInsert = unclearedEntries
        .filter(g => checkedIds.has(g.id))
        .map(g => ({ reconciliation_id: reconciliationId as string, gl_entry_id: g.id, amount: g.debit - g.credit }));

      if (clearedRowsToInsert.length > 0) {
        const { error: clearErr } = await supabase.from('bank_reconciliation_cleared').insert(clearedRowsToInsert);
        if (clearErr) throw clearErr;
      }

      toast({
        title: language === 'en' ? 'Reconciled' : 'Berhasil Direkonsiliasi',
        description: language === 'en' ? `${clearedRowsToInsert.length} entries cleared` : `${clearedRowsToInsert.length} entri di-clear`,
      });

      resetSession();
      refetchHistory();
      if (selectedBank?.gl_account_id) fetchEntries(selectedBank.gl_account_id);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleContinueDraft = (row: Reconciliation) => {
    setSelectedBankAccountId(row.bank_account_id);
    setStatementDate(row.statement_date);
    setStatementEndingBalance(String(row.statement_ending_balance));
    setNotes(row.notes || '');
    setActiveReconciliationId(row.id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Bank Reconciliation' : 'Rekonsiliasi Bank'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Match posted General Ledger entries against your bank statement' : 'Cocokkan entri General Ledger terposting dengan mutasi rekening koran'}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-2 min-w-[220px]">
            <Label>{language === 'en' ? 'Bank Account' : 'Akun Bank'} *</Label>
            <Select value={selectedBankAccountId} onValueChange={(v) => { setSelectedBankAccountId(v); resetSession(); }}>
              <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select bank account' : 'Pilih akun bank'} /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map(b => (
                  <SelectItem key={b.id} value={b.id} disabled={!b.gl_account_id}>
                    {b.bank_name} - {b.account_no}{!b.gl_account_id ? (language === 'en' ? ' (no GL account)' : ' (belum ada akun GL)') : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{language === 'en' ? 'Statement Date' : 'Tanggal Statement'} *</Label>
            <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="max-w-xs" />
          </div>
          <div className="space-y-2">
            <Label>{language === 'en' ? 'Statement Ending Balance' : 'Saldo Akhir Rekening Koran'} *</Label>
            <Input type="number" value={statementEndingBalance} onChange={(e) => setStatementEndingBalance(e.target.value)} className="max-w-xs" />
          </div>
          <div className="space-y-2 flex-1 min-w-[200px]">
            <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} className="min-h-9" />
          </div>
        </CardContent>
      </Card>

      {bankAccountsWithGl.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {language === 'en'
              ? 'No bank account has a GL account mapped yet. Configure it on the Bank Accounts page first.'
              : 'Belum ada akun bank yang memiliki pemetaan akun GL. Konfigurasikan dulu di halaman Rekening Bank.'}
          </CardContent>
        </Card>
      )}

      {selectedBank?.gl_account_id && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Book Balance (as of date)' : 'Saldo Buku (s/d tanggal)'}</p>
                <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(bookBalance)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Cleared Balance' : 'Saldo Ter-clear'}</p>
                <p className="text-xl font-bold text-primary mt-1">{formatCurrency(clearedBalance)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Difference' : 'Selisih'}</p>
                <p className={cn('text-xl font-bold mt-1', isBalanced ? 'text-success' : 'text-warning')}>{formatCurrency(difference)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{language === 'en' ? 'Outstanding' : 'Outstanding'}</p>
                <p className="text-xl font-bold text-muted-foreground mt-1">{outstandingEntries.length} / {formatCurrency(outstandingTotal)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {language === 'en' ? 'Save Draft' : 'Simpan Draft'}
            </Button>
            <Button onClick={handleMarkReconciled} disabled={!isBalanced || saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {language === 'en' ? 'Mark Reconciled' : 'Tandai Reconciled'}
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{language === 'en' ? 'GL Entries to Clear' : 'Entri GL untuk Di-clear'}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">{language === 'en' ? 'Cleared' : 'Cleared'}</TableHead>
                    <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                    <TableHead>{language === 'en' ? 'Description' : 'Keterangan'}</TableHead>
                    <TableHead className="text-right">{language === 'en' ? 'In (Debit)' : 'Masuk (Debit)'}</TableHead>
                    <TableHead className="text-right">{language === 'en' ? 'Out (Credit)' : 'Keluar (Kredit)'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingEntries ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : unclearedEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No uncleared entries' : 'Tidak ada entri yang belum di-clear'}</TableCell></TableRow>
                  ) : (
                    unclearedEntries.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell>
                          <Checkbox checked={checkedIds.has(g.id)} onCheckedChange={() => toggleChecked(g.id)} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(g.posting_date).toLocaleDateString('id-ID')}</TableCell>
                        <TableCell>{descriptionByLineId[g.journal_line_id] || g.source_type || '-'}</TableCell>
                        <TableCell className="text-right">{g.debit > 0 ? formatCurrency(g.debit) : ''}</TableCell>
                        <TableCell className="text-right">{g.credit > 0 ? formatCurrency(g.credit) : ''}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {selectedBankAccountId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{language === 'en' ? 'Reconciliation History' : 'Riwayat Rekonsiliasi'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchHistory()}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'en' ? 'Statement Date' : 'Tanggal Statement'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Ending Balance' : 'Saldo Akhir'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Difference' : 'Selisih'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No history yet' : 'Belum ada riwayat'}</TableCell></TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{new Date(h.statement_date).toLocaleDateString('id-ID')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(h.statement_ending_balance)}</TableCell>
                      <TableCell className="text-right">{h.difference != null ? formatCurrency(h.difference) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadge[h.status]?.variant || 'secondary'}>{statusBadge[h.status]?.[language] || h.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {h.status === 'DRAFT' && (
                          <Button size="sm" variant="outline" onClick={() => handleContinueDraft(h)}>
                            {language === 'en' ? 'Continue' : 'Lanjutkan'}
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
      )}
    </div>
  );
}
