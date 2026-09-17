import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react';
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type GiroRow = Tables<'giro_transactions'>;
type BankAccount = Tables<'bank_accounts'>;
type Account = Tables<'chart_of_accounts'>;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const todayStr = () => new Date().toISOString().split('T')[0];

const statusConfig: Record<string, { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { en: 'Pending', id: 'Pending', variant: 'outline' },
  CLEARED: { en: 'Cleared', id: 'Cair', variant: 'default' },
  BOUNCED: { en: 'Bounced', id: 'Ditolak', variant: 'destructive' },
  CANCELLED: { en: 'Cancelled', id: 'Dibatalkan', variant: 'secondary' },
};

const daysUntil = (dateStr: string) => {
  const today = new Date(todayStr());
  const due = new Date(dateStr);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const emptyForm = {
  party_id: '',
  giro_no: '',
  issue_date: todayStr(),
  due_date: '',
  amount: '',
  giro_account_id: '',
  contra_account_id: '',
  notes: '',
};

interface Props {
  giroType: 'IN' | 'OUT';
}

export default function GiroTransactionsPage({ giroType }: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const partyType = giroType === 'IN' ? 'CUSTOMER' : 'VENDOR';
  const accountTypeForGiro = giroType === 'IN' ? 'ASSET' : 'LIABILITY';
  const ruleSourceType = `GIRO_${giroType}`;

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dueSoonOnly, setDueSoonOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [clearTarget, setClearTarget] = useState<GiroRow | null>(null);
  const [clearBankAccountId, setClearBankAccountId] = useState('');
  const [clearDate, setClearDate] = useState(todayStr());
  const [clearing, setClearing] = useState(false);

  const [bounceTarget, setBounceTarget] = useState<GiroRow | null>(null);
  const [bounceReason, setBounceReason] = useState('');
  const [bouncing, setBouncing] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<GiroRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const queryKey = ['giro_transactions', giroType];

  const { data: giroRows = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('giro_transactions')
        .select('*')
        .eq('giro_type', giroType)
        .order('due_date');
      if (error) throw error;
      return data as GiroRow[];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: [giroType === 'IN' ? 'customers' : 'vendors', 'giro'],
    queryFn: async () => {
      if (giroType === 'IN') {
        const { data, error } = await supabase.from('customers').select('id, customer_name').eq('is_active', true).order('customer_name');
        if (error) throw error;
        return (data || []).map(c => ({ id: c.id, name: c.customer_name }));
      } else {
        const { data, error } = await supabase.from('vendors').select('id, vendor_name').eq('is_active', true).order('vendor_name');
        if (error) throw error;
        return (data || []).map(v => ({ id: v.id, name: v.vendor_name }));
      }
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank_accounts', 'giro'],
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

  const { data: rule } = useQuery({
    queryKey: ['accounting_rules', ruleSourceType],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_rules').select('*').eq('source_type', ruleSourceType).eq('is_active', true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const giroAccountOptions = useMemo(() => accounts.filter(a => a.account_type === accountTypeForGiro), [accounts, accountTypeForGiro]);
  const contraAccountDefault = giroType === 'IN' ? accounts.find(a => a.code === '1200') : accounts.find(a => a.code === '2100');

  const partyName = (id: string) => parties.find(p => p.id === id)?.name || '-';

  const filtered = useMemo(() => {
    return giroRows.filter(g => {
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
      if (dueSoonOnly && g.status === 'PENDING') {
        const d = daysUntil(g.due_date);
        return d <= 7;
      }
      if (dueSoonOnly) return false;
      return true;
    });
  }, [giroRows, statusFilter, dueSoonOnly]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      giro_account_id: rule?.debit_account_id && giroType === 'IN' ? rule.debit_account_id : rule?.credit_account_id && giroType === 'OUT' ? rule.credit_account_id : '',
      contra_account_id: rule?.credit_account_id && giroType === 'IN' ? rule.credit_account_id : rule?.debit_account_id && giroType === 'OUT' ? rule.debit_account_id : (contraAccountDefault?.id || ''),
    });
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.party_id || !form.giro_no.trim() || !form.due_date || !form.amount || !form.giro_account_id || !form.contra_account_id) {
      toast({
        title: 'Error',
        description: language === 'en' ? 'Please fill all required fields' : 'Mohon lengkapi semua field wajib',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('create_giro_transaction', {
        _giro_type: giroType,
        _party_type: partyType,
        _party_id: form.party_id,
        _giro_no: form.giro_no.trim(),
        _issue_date: form.issue_date,
        _due_date: form.due_date,
        _amount: parseFloat(form.amount) || 0,
        _giro_account_id: form.giro_account_id,
        _contra_account_id: form.contra_account_id,
        _notes: form.notes || null,
      });
      if (error) throw error;
      toast({ title: language === 'en' ? 'Giro recorded' : 'Giro dicatat', description: (data as any)?.journal_no });
      setIsCreateOpen(false);
      refetch();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openClear = (row: GiroRow) => {
    setClearTarget(row);
    setClearBankAccountId('');
    setClearDate(todayStr());
  };

  const handleClear = async () => {
    if (!clearTarget || !clearBankAccountId) {
      toast({ title: 'Error', description: language === 'en' ? 'Please select a bank account' : 'Mohon pilih akun bank', variant: 'destructive' });
      return;
    }
    setClearing(true);
    try {
      const { error } = await supabase.rpc('clear_giro_transaction', {
        _giro_id: clearTarget.id,
        _bank_account_id: clearBankAccountId,
        _clear_date: clearDate,
      });
      if (error) throw error;
      toast({ title: language === 'en' ? 'Giro cleared' : 'Giro dicairkan' });
      setClearTarget(null);
      refetch();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  const handleBounce = async () => {
    if (!bounceTarget) return;
    setBouncing(true);
    try {
      const { error } = await supabase.rpc('bounce_giro_transaction', {
        _giro_id: bounceTarget.id,
        _reason: bounceReason || null,
      });
      if (error) throw error;
      toast({ title: language === 'en' ? 'Giro marked as bounced' : 'Giro ditandai ditolak' });
      setBounceTarget(null);
      setBounceReason('');
      refetch();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setBouncing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc('cancel_giro_transaction', {
        _giro_id: cancelTarget.id,
        _reason: null,
      });
      if (error) throw error;
      toast({ title: language === 'en' ? 'Giro cancelled' : 'Giro dibatalkan' });
      setCancelTarget(null);
      refetch();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const title = giroType === 'IN'
    ? (language === 'en' ? 'Giro In' : 'Giro Masuk')
    : (language === 'en' ? 'Giro Out' : 'Giro Keluar');

  const partyLabel = giroType === 'IN'
    ? (language === 'en' ? 'Customer' : 'Pelanggan')
    : (language === 'en' ? 'Vendor' : 'Pemasok');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">
            {giroType === 'IN'
              ? (language === 'en' ? 'Postdated cheques received from customers' : 'Giro mundur yang diterima dari pelanggan')
              : (language === 'en' ? 'Postdated cheques issued to vendors' : 'Giro mundur yang diterbitkan untuk pemasok')}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'New Giro' : 'Giro Baru'}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{language === 'en' ? 'Status' : 'Status'}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{language === 'en' ? 'All' : 'Semua'}</SelectItem>
                {Object.keys(statusConfig).map(s => (
                  <SelectItem key={s} value={s}>{statusConfig[s][language]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Button
              variant={dueSoonOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDueSoonOnly(v => !v)}
            >
              {language === 'en' ? 'Due within 7 days' : 'Jatuh tempo ≤ 7 hari'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Giro No' : 'No. Giro'}</TableHead>
                <TableHead>{partyLabel}</TableHead>
                <TableHead>{language === 'en' ? 'Issue Date' : 'Tanggal Terbit'}</TableHead>
                <TableHead>{language === 'en' ? 'Due Date' : 'Jatuh Tempo'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Days' : 'Hari Jatuh Tempo'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                <TableHead>{language === 'en' ? 'Status' : 'Status'}</TableHead>
                <TableHead className="w-[80px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No giro transactions found' : 'Tidak ada transaksi giro'}</TableCell></TableRow>
              ) : (
                filtered.map((row) => {
                  const d = daysUntil(row.due_date);
                  const overdue = row.status === 'PENDING' && d < 0;
                  const soon = row.status === 'PENDING' && d >= 0 && d <= 7;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono font-medium">{row.giro_no}</TableCell>
                      <TableCell>{partyName(row.party_id)}</TableCell>
                      <TableCell>{row.issue_date}</TableCell>
                      <TableCell>{row.due_date}</TableCell>
                      <TableCell className={cn('text-right', overdue && 'text-destructive font-medium', soon && 'text-warning font-medium')}>
                        {row.status === 'PENDING' ? (overdue ? `${language === 'en' ? 'Overdue' : 'Lewat'} ${Math.abs(d)}d` : `${d}d`) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[row.status]?.variant || 'secondary'}>
                          {statusConfig[row.status]?.[language] || row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.status === 'PENDING' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openClear(row)} className="gap-2">
                                <CheckCircle2 className="w-4 h-4" />{language === 'en' ? 'Clear' : 'Cairkan'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setBounceTarget(row)} className="gap-2 text-destructive">
                                <XCircle className="w-4 h-4" />{language === 'en' ? 'Bounce' : 'Tolak'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setCancelTarget(row)} className="gap-2 text-muted-foreground">
                                <Ban className="w-4 h-4" />{language === 'en' ? 'Cancel' : 'Batal'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? `New ${title}` : `${title} Baru`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{partyLabel} *</Label>
              <Select value={form.party_id || 'none'} onValueChange={(v) => setForm({ ...form, party_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select' : 'Pilih'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Giro No' : 'No. Giro'} *</Label>
              <Input value={form.giro_no} onChange={(e) => setForm({ ...form, giro_no: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Issue Date' : 'Tanggal Terbit'} *</Label>
                <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Due Date' : 'Jatuh Tempo'} *</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Amount' : 'Jumlah'} *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{giroType === 'IN' ? (language === 'en' ? 'Giro In Account' : 'Akun Giro Masuk') : (language === 'en' ? 'Giro Out Account' : 'Akun Giro Keluar')} *</Label>
              <Select value={form.giro_account_id || 'none'} onValueChange={(v) => setForm({ ...form, giro_account_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {giroAccountOptions.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{giroType === 'IN' ? (language === 'en' ? 'Contra Account (AR)' : 'Akun Lawan (Piutang)') : (language === 'en' ? 'Contra Account (AP)' : 'Akun Lawan (Hutang)')} *</Label>
              <Select value={form.contra_account_id || 'none'} onValueChange={(v) => setForm({ ...form, contra_account_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Save' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear dialog */}
      <Dialog open={!!clearTarget} onOpenChange={(open) => !open && setClearTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Clear Giro' : 'Cairkan Giro'} - {clearTarget?.giro_no}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Bank Account' : 'Akun Bank'} *</Label>
              <Select value={clearBankAccountId || 'none'} onValueChange={(v) => setClearBankAccountId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select bank account' : 'Pilih akun bank'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id} disabled={!b.gl_account_id}>
                      {b.bank_name} - {b.account_no}{!b.gl_account_id ? (language === 'en' ? ' (no GL account)' : ' (belum ada akun GL)') : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Clear Date' : 'Tanggal Cair'} *</Label>
              <Input type="date" value={clearDate} onChange={(e) => setClearDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearTarget(null)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleClear} disabled={clearing}>
              {clearing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Clear' : 'Cairkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bounce dialog */}
      <Dialog open={!!bounceTarget} onOpenChange={(open) => !open && setBounceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Bounce Giro' : 'Tolak Giro'} - {bounceTarget?.giro_no}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {language === 'en' ? 'This will reverse the original journal entry for this giro.' : 'Ini akan membalik jurnal asli untuk giro ini.'}
            </p>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Reason' : 'Alasan'}</Label>
              <Textarea value={bounceReason} onChange={(e) => setBounceReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBounceTarget(null)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button variant="destructive" onClick={handleBounce} disabled={bouncing}>
              {bouncing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Bounce' : 'Tolak'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Cancel Giro' : 'Batalkan Giro'} - {cancelTarget?.giro_no}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {language === 'en' ? 'This will reverse the original journal entry for this giro. Continue?' : 'Ini akan membalik jurnal asli untuk giro ini. Lanjutkan?'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>{language === 'en' ? 'No' : 'Tidak'}</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Yes, Cancel Giro' : 'Ya, Batalkan Giro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
