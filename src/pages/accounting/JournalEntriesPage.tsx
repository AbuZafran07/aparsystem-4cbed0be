import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Send, Undo2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth, useRoleAccess } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type JournalEntry = Tables<'journal_entries'>;
type Account = Tables<'chart_of_accounts'>;

interface DraftLine {
  account_id: string;
  debit: string;
  credit: string;
  description: string;
}

const emptyLine = (): DraftLine => ({ account_id: '', debit: '', credit: '', description: '' });

const statusBadge: Record<JournalEntry['status'], { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { en: 'Draft', id: 'Draft', variant: 'secondary' },
  POSTED: { en: 'Posted', id: 'Diposting', variant: 'default' },
  REVERSED: { en: 'Reversed', id: 'Dibalik', variant: 'outline' },
  VOIDED: { en: 'Voided', id: 'Dibatalkan', variant: 'destructive' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function JournalEntriesPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { hasRole } = useRoleAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = hasRole(['SUPER_ADMIN']);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('journal_no', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart_of_accounts', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('code');
      if (error) throw error;
      return data;
    },
  });

  const { data: linesByJournal = {} } = useQuery({
    queryKey: ['journal_entry_lines', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('journal_entry_lines').select('*');
      if (error) throw error;
      const map: Record<string, Tables<'journal_entry_lines'>[]> = {};
      (data || []).forEach((l) => {
        map[l.journal_id] = map[l.journal_id] || [];
        map[l.journal_id].push(l);
      });
      return map;
    },
  });

  const accountLabel = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    return acc ? `${acc.code} - ${acc.name}` : '-';
  };

  const resetForm = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setLines([emptyLine(), emptyLine()]);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (index: number) => setLines(prev => prev.filter((_, i) => i !== index));

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = lines.length >= 2 && totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const handleCreate = async () => {
    if (!isBalanced) {
      toast({
        title: 'Error',
        description: language === 'en' ? 'Total debit must equal total credit' : 'Total debit harus sama dengan total kredit',
        variant: 'destructive',
      });
      return;
    }
    if (lines.some(l => !l.account_id)) {
      toast({ title: 'Error', description: language === 'en' ? 'Every line needs an account' : 'Setiap baris wajib punya akun', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = lines
        .filter(l => (parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0)
        .map(l => ({
          account_id: l.account_id,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description || null,
        }));

      const { data, error } = await supabase.rpc('create_journal_entry', {
        _entry_date: entryDate,
        _description: description || null,
        _source_type: 'MANUAL',
        _source_id: null,
        _lines: payload as any,
      });
      if (error) throw error;
      const res = data as any;
      toast({
        title: language === 'en' ? 'Journal entry created' : 'Jurnal dibuat',
        description: `${res?.journal_no ?? ''} (${language === 'en' ? 'DRAFT' : 'DRAFT'})`,
      });
      setIsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entry_lines'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const postMutation = useMutation({
    mutationFn: async (journalId: string) => {
      const { error } = await supabase.rpc('post_journal_entry', { _journal_id: journalId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      toast({ title: language === 'en' ? 'Posted' : 'Diposting', description: language === 'en' ? 'Journal entry posted to General Ledger' : 'Jurnal diposting ke General Ledger' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleReverse = async () => {
    if (!reversingId) return;
    try {
      const { data, error } = await supabase.rpc('reverse_journal_entry', { _journal_id: reversingId, _reason: reverseReason });
      if (error) throw error;
      const res = data as any;
      toast({ title: language === 'en' ? 'Reversed' : 'Dibalik', description: res?.reversal_journal_no ?? '' });
      setReversingId(null);
      setReverseReason('');
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Journal Entries' : 'Jurnal Umum'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manual journal entries and auto-posted AR/AP events' : 'Jurnal manual dan event AR/AP yang otomatis diposting'}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'New Journal Entry' : 'Jurnal Baru'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'No' : 'No'}</TableHead>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Description' : 'Keterangan'}</TableHead>
                <TableHead>{language === 'en' ? 'Source' : 'Sumber'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No journal entries found' : 'Tidak ada jurnal'}</TableCell></TableRow>
              ) : (
                entries.map((entry) => {
                  const entryLines = linesByJournal[entry.id] || [];
                  const amount = entryLines.reduce((sum, l) => sum + l.debit, 0);
                  const canPost = entry.status === 'DRAFT' && (isSuperAdmin || entry.created_by !== user?.id);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.journal_no}</TableCell>
                      <TableCell>{new Date(entry.entry_date).toLocaleDateString('id-ID')}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{entry.description}</TableCell>
                      <TableCell><Badge variant="outline">{entry.source_type || 'MANUAL'}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(amount)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadge[entry.status].variant}>{statusBadge[entry.status][language]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {entry.status === 'DRAFT' && (
                            <Button
                              size="sm" variant="outline" className="gap-1"
                              disabled={!canPost || postMutation.isPending}
                              title={!canPost ? (language === 'en' ? 'Maker-checker: creator cannot post their own entry' : 'Maker-checker: pembuat tidak bisa posting jurnalnya sendiri') : ''}
                              onClick={() => postMutation.mutate(entry.id)}
                            >
                              <Send className="w-3.5 h-3.5" />{language === 'en' ? 'Post' : 'Posting'}
                            </Button>
                          )}
                          {entry.status === 'POSTED' && (isSuperAdmin || hasRole(['FINANCE'])) && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => setReversingId(entry.id)}>
                              <Undo2 className="w-3.5 h-3.5" />{language === 'en' ? 'Reverse' : 'Balik'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'New Journal Entry' : 'Jurnal Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Entry Date' : 'Tanggal'}</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Description' : 'Keterangan'}</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{language === 'en' ? 'Lines' : 'Baris Jurnal'}</Label>
                <Button size="sm" variant="outline" className="gap-1" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5" />{language === 'en' ? 'Add Line' : 'Tambah Baris'}
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Select value={line.account_id} onValueChange={(v) => updateLine(idx, { account_id: v })}>
                        <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Account' : 'Akun'} /></SelectTrigger>
                        <SelectContent>
                          {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder={language === 'en' ? 'Debit' : 'Debit'} value={line.debit}
                        onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder={language === 'en' ? 'Credit' : 'Kredit'} value={line.credit}
                        onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} />
                    </div>
                    <div className="col-span-2">
                      <Input placeholder={language === 'en' ? 'Note' : 'Catatan'} value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })} />
                    </div>
                    <div className="col-span-1">
                      <Button size="icon" variant="ghost" disabled={lines.length <= 2} onClick={() => removeLine(idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={cn(
                'flex justify-end gap-6 text-sm font-medium pt-2 border-t',
                isBalanced ? 'text-success' : 'text-destructive'
              )}>
                <span>{language === 'en' ? 'Total Debit' : 'Total Debit'}: {formatCurrency(totalDebit)}</span>
                <span>{language === 'en' ? 'Total Credit' : 'Total Kredit'}: {formatCurrency(totalCredit)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleCreate} disabled={submitting || !isBalanced}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {language === 'en' ? 'Save as Draft' : 'Simpan sebagai Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse dialog */}
      <Dialog open={!!reversingId} onOpenChange={(open) => !open && setReversingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Reverse Journal Entry' : 'Balik Jurnal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>{language === 'en' ? 'Reason' : 'Alasan'}</Label>
            <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversingId(null)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button variant="destructive" onClick={handleReverse}>{language === 'en' ? 'Reverse' : 'Balik'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
