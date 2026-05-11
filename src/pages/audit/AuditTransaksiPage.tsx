import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const db = supabase as any;
const TAHUN = 2026;

const BULAN_LIST = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

interface Department { id: string; name: string; color: string; }
interface Budget { department_id: string; amount: number; }
interface Transaction {
  id: string; tanggal: string; department_id: string; keterangan: string;
  nominal: number; bulan: string; tahun: number; status: 'normal' | 'warning' | 'over';
  created_at: string; departments?: { name: string; color: string };
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const bulanFromDate = (date: string) => BULAN_LIST[new Date(date).getMonth()];

const statusBadge = (s: string) => {
  if (s === 'over') return <Badge variant="destructive">Over</Badge>;
  if (s === 'warning') return <Badge className="bg-yellow-500 hover:bg-yellow-600">Warning</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-700">Normal</Badge>;
};

export default function AuditTransaksiPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filterBulan, setFilterBulan] = useState(searchParams.get('bulan') ?? 'all');
  const [filterDept, setFilterDept] = useState(searchParams.get('dept') ?? 'all');
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const [fTanggal, setFTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [fDept, setFDept] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fNominal, setFNominal] = useState('');

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['audit-departments'],
    queryFn: async () => {
      const { data, error } = await db.from('departments').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['audit-budgets', TAHUN],
    queryFn: async () => {
      const { data, error } = await db.from('budgets').select('department_id, amount').eq('year', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db
        .from('cash_out_transactions')
        .select('*, departments(name, color)')
        .eq('tahun', TAHUN)
        .order('tanggal', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
    [budgets],
  );

  const calcStatus = (deptId: string, nominal: number, excludeId?: string): 'normal' | 'warning' | 'over' => {
    const budget = budgetMap[deptId] ?? 0;
    const spent = transactions
      .filter(t => t.department_id === deptId && t.id !== excludeId)
      .reduce((s, t) => s + t.nominal, 0);
    const total = spent + nominal;
    if (total > budget) return 'over';
    if (total > budget * 0.8) return 'warning';
    return 'normal';
  };

  const filtered = useMemo(() => transactions.filter(t => {
    const matchBulan = filterBulan === 'all' || t.bulan === filterBulan;
    const matchDept = filterDept === 'all' || t.department_id === filterDept;
    const matchSearch = !search || t.keterangan.toLowerCase().includes(search.toLowerCase());
    return matchBulan && matchDept && matchSearch;
  }), [transactions, filterBulan, filterDept, search]);

  const totalFiltered = filtered.reduce((s, t) => s + t.nominal, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nominal = parseInt(fNominal.replace(/\D/g, ''), 10);
      if (!fTanggal || !fDept || !fKeterangan || !nominal) throw new Error('Lengkapi semua field');
      const bulan = bulanFromDate(fTanggal);
      const status = calcStatus(fDept, nominal, editTx?.id);
      const payload = { tanggal: fTanggal, department_id: fDept, keterangan: fKeterangan, nominal, bulan, tahun: TAHUN, status, created_by: user?.id };
      if (editTx) {
        const { error } = await db.from('cash_out_transactions').update(payload).eq('id', editTx.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('cash_out_transactions').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-transactions'] });
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      closeDialog();
      toast({ title: 'Berhasil', description: editTx ? 'Transaksi diupdate' : 'Transaksi ditambahkan' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('cash_out_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-transactions'] });
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      toast({ title: 'Berhasil', description: 'Transaksi dihapus' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openDialog = (tx?: Transaction) => {
    if (tx) {
      setEditTx(tx); setFTanggal(tx.tanggal); setFDept(tx.department_id);
      setFKeterangan(tx.keterangan); setFNominal(tx.nominal.toString());
    } else {
      setEditTx(null); setFTanggal(new Date().toISOString().split('T')[0]);
      setFDept(departments[0]?.id ?? ''); setFKeterangan(''); setFNominal('');
    }
    setIsOpen(true);
  };
  const closeDialog = () => { setIsOpen(false); setEditTx(null); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Transaksi Cash Out</h1>
          <p className="text-sm text-muted-foreground">Tahun {TAHUN}</p>
        </div>
        <Button onClick={() => openDialog()} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Tambah
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cari keterangan..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <Select value={filterBulan} onValueChange={v => { setFilterBulan(v); setSearchParams(p => { p.set('bulan', v); return p; }); }}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Semua Bulan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Bulan</SelectItem>
            {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDept} onValueChange={v => { setFilterDept(v); setSearchParams(p => { p.set('dept', v); return p; }); }}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Semua Dept" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Dept</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Departemen</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Bulan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada transaksi</TableCell></TableRow>
              ) : filtered.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(tx.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tx.departments?.color ?? '#888' }} />
                      <span className="text-sm">{tx.departments?.name ?? '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm max-w-[240px] truncate">{tx.keterangan}</TableCell>
                  <TableCell className="text-right font-medium text-sm whitespace-nowrap">{fmtRp(tx.nominal)}</TableCell>
                  <TableCell className="text-sm">{tx.bulan}</TableCell>
                  <TableCell>{statusBadge(tx.status)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDialog(tx)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteMutation.mutate(tx.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <div className="flex justify-end text-sm text-muted-foreground">
          {filtered.length} transaksi &nbsp;·&nbsp;
          <span className="font-semibold text-foreground ml-1">{fmtRp(totalFiltered)}</span>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editTx ? 'Edit Transaksi' : 'Tambah Transaksi'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={fTanggal} onChange={e => setFTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Departemen</Label>
              <Select value={fDept} onValueChange={setFDept}>
                <SelectTrigger><SelectValue placeholder="Pilih departemen" /></SelectTrigger>
                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Textarea value={fKeterangan} onChange={e => setFKeterangan(e.target.value)} placeholder="Deskripsi pengeluaran..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Nominal (Rp)</Label>
              <Input
                type="text" inputMode="numeric"
                value={fNominal ? parseInt(fNominal.replace(/\D/g, '') || '0', 10).toLocaleString('id-ID') : ''}
                onChange={e => setFNominal(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
              />
            </div>
            {fDept && fNominal && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Prediksi status:</span>
                {statusBadge(calcStatus(fDept, parseInt(fNominal || '0', 10), editTx?.id))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Batal</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
