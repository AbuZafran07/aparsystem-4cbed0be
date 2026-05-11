import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReceiptText, Plus, Search, Pencil, Trash2, MoreHorizontal,
  TrendingDown, Wallet, AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

// ─── Local types ─────────────────────────────────────────────────────────────
interface Department { id: string; name: string; color: string; }
interface Budget { id: string; department_id: string; year: number; amount: number; }
interface Transaction {
  id: string; tanggal: string; department_id: string; keterangan: string;
  nominal: number; bulan: string; tahun: number;
  status: 'normal' | 'warning' | 'over'; created_at: string;
  departments?: { name: string; color: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const db = supabase as any;

const TAHUN = 2026;

const BULAN_LIST = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];

const bulanFromDate = (date: string) => {
  const m = new Date(date).getMonth();
  return BULAN_LIST[m];
};

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  return `Rp ${(n / 1_000).toFixed(0)}K`;
};

const statusBadge = (s: string) => {
  if (s === 'over') return <Badge variant="destructive">Over Budget</Badge>;
  if (s === 'warning') return <Badge className="bg-yellow-500 hover:bg-yellow-600">Warning</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-700">Normal</Badge>;
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'transaksi' | 'anggaran';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditCashoutPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [search, setSearch] = useState('');
  const [filterBulan, setFilterBulan] = useState<string>('all');
  const [filterDept, setFilterDept] = useState<string>('all');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<{ dept: Department; amount: number } | null>(null);

  // form state – transaction
  const [fTanggal, setFTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [fDept, setFDept] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fNominal, setFNominal] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['audit-departments'],
    queryFn: async () => {
      const { data, error } = await db.from('departments').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['audit-budgets', TAHUN],
    queryFn: async () => {
      const { data, error } = await db.from('budgets').select('*').eq('year', TAHUN);
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db
        .from('cash_out_transactions')
        .select('*, departments(name, color)')
        .eq('tahun', TAHUN)
        .order('tanggal', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const budgetMap = useMemo(() =>
    Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
  [budgets]);

  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => {
      m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal;
    });
    return m;
  }, [transactions]);

  const spentByBulan = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => {
      m[t.bulan] = (m[t.bulan] ?? 0) + t.nominal;
    });
    return BULAN_LIST.map(b => ({ bulan: b.slice(0, 3), total: m[b] ?? 0 }));
  }, [transactions]);

  const totalAnggaran = budgets.reduce((s, b) => s + b.amount, 0);
  const totalRealisasi = transactions.reduce((s, t) => s + t.nominal, 0);
  const sisaAnggaran = totalAnggaran - totalRealisasi;
  const pctTerpakai = totalAnggaran > 0 ? (totalRealisasi / totalAnggaran) * 100 : 0;

  const deptChartData = departments.map(d => ({
    name: d.name,
    color: d.color,
    Anggaran: budgetMap[d.id] ?? 0,
    Realisasi: spentByDept[d.id] ?? 0,
  }));

  const filteredTx = useMemo(() => {
    return transactions.filter(t => {
      const matchBulan = filterBulan === 'all' || t.bulan === filterBulan;
      const matchDept = filterDept === 'all' || t.department_id === filterDept;
      const matchSearch = !search || t.keterangan.toLowerCase().includes(search.toLowerCase());
      return matchBulan && matchDept && matchSearch;
    });
  }, [transactions, filterBulan, filterDept, search]);

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  const saveTxMutation = useMutation({
    mutationFn: async () => {
      const nominal = parseInt(fNominal.replace(/\D/g, ''), 10);
      if (!fTanggal || !fDept || !fKeterangan || !nominal) throw new Error('Lengkapi semua field');
      const bulan = bulanFromDate(fTanggal);
      const status = calcStatus(fDept, nominal, editTx?.id);
      const payload = {
        tanggal: fTanggal, department_id: fDept, keterangan: fKeterangan,
        nominal, bulan, tahun: TAHUN, status, created_by: user?.id,
      };
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
      closeAddDialog();
      toast({ title: 'Berhasil', description: editTx ? 'Transaksi diupdate' : 'Transaksi ditambahkan' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteTxMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('cash_out_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-transactions'] });
      toast({ title: 'Berhasil', description: 'Transaksi dihapus' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const saveBudgetMutation = useMutation({
    mutationFn: async ({ deptId, amount }: { deptId: string; amount: number }) => {
      const existing = budgets.find(b => b.department_id === deptId);
      if (existing) {
        const { error } = await db.from('budgets').update({ amount, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('budgets').insert([{ department_id: deptId, year: TAHUN, amount }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-budgets'] });
      qc.invalidateQueries({ queryKey: ['audit-transactions'] });
      setIsBudgetOpen(false);
      setEditBudget(null);
      toast({ title: 'Berhasil', description: 'Anggaran disimpan' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Dialog helpers ────────────────────────────────────────────────────────
  const openAddDialog = (tx?: Transaction) => {
    if (tx) {
      setEditTx(tx);
      setFTanggal(tx.tanggal);
      setFDept(tx.department_id);
      setFKeterangan(tx.keterangan);
      setFNominal(tx.nominal.toString());
    } else {
      setEditTx(null);
      setFTanggal(new Date().toISOString().split('T')[0]);
      setFDept(departments[0]?.id ?? '');
      setFKeterangan('');
      setFNominal('');
    }
    setIsAddOpen(true);
  };

  const closeAddDialog = () => { setIsAddOpen(false); setEditTx(null); };

  const openBudgetDialog = (dept: Department) => {
    setEditBudget({ dept, amount: budgetMap[dept.id] ?? 0 });
    setIsBudgetOpen(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Audit Cash Out 2026</h1>
            <p className="text-sm text-muted-foreground">Monitoring pengeluaran per departemen</p>
          </div>
        </div>
        {tab === 'transaksi' && (
          <Button onClick={() => openAddDialog()} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Tambah Transaksi
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['dashboard', 'transaksi', 'anggaran'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'dashboard' ? 'Dashboard' : t === 'transaksi' ? 'Transaksi' : 'Anggaran'}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ─────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Total Anggaran</span>
                  <Wallet className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-2xl font-bold">{fmtCompact(totalAnggaran)}</p>
                <p className="text-xs text-muted-foreground mt-1">Tahun {TAHUN}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Total Realisasi</span>
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold">{fmtCompact(totalRealisasi)}</p>
                <p className="text-xs text-muted-foreground mt-1">{transactions.length} transaksi</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Sisa Anggaran</span>
                  {sisaAnggaran >= 0
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <AlertTriangle className="w-4 h-4 text-red-500" />
                  }
                </div>
                <p className={`text-2xl font-bold ${sisaAnggaran < 0 ? 'text-red-500' : ''}`}>
                  {fmtCompact(Math.abs(sisaAnggaran))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sisaAnggaran < 0 ? 'Melebihi anggaran' : 'Tersisa'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">% Terpakai</span>
                  <AlertTriangle className={`w-4 h-4 ${pctTerpakai > 90 ? 'text-red-500' : pctTerpakai > 75 ? 'text-yellow-500' : 'text-green-500'}`} />
                </div>
                <p className="text-2xl font-bold">{pctTerpakai.toFixed(1)}%</p>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div
                    className={`h-1.5 rounded-full transition-all ${pctTerpakai > 90 ? 'bg-red-500' : pctTerpakai > 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(pctTerpakai, 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Budget vs Realisasi per Dept */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Anggaran vs Realisasi per Departemen</CardTitle>
              </CardHeader>
              <CardContent>
                {deptChartData.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">Belum ada data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={deptChartData} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 11 }} width={70} />
                      <Tooltip formatter={(v: number) => fmtRp(v)} />
                      <Legend />
                      <Bar dataKey="Anggaran" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Realisasi" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Monthly spending */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Pengeluaran per Bulan</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={spentByBulan} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 11 }} width={70} />
                    <Tooltip formatter={(v: number) => fmtRp(v)} />
                    <Bar dataKey="total" name="Pengeluaran" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Per-dept progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Progress Anggaran per Departemen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {departments.map(dept => {
                const budget = budgetMap[dept.id] ?? 0;
                const spent = spentByDept[dept.id] ?? 0;
                const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                const isOver = spent > budget;
                return (
                  <div key={dept.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                        <span className="font-medium">{dept.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{fmtCompact(spent)} / {fmtCompact(budget)}</span>
                        <span className={`font-semibold ${isOver ? 'text-red-500' : pct > 75 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isOver ? '#ef4444' : pct > 75 ? '#eab308' : dept.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {departments.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">Belum ada departemen</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TRANSAKSI TAB ─────────────────────────────────────────────────── */}
      {tab === 'transaksi' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari keterangan..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterBulan} onValueChange={setFilterBulan}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Semua Bulan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Bulan</SelectItem>
                {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Semua Dept" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Dept</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
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
                  {txLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : filteredTx.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        Belum ada transaksi
                      </TableCell>
                    </TableRow>
                  ) : filteredTx.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">
                        {new Date(tx.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tx.departments?.color ?? '#888' }} />
                          <span className="text-sm">{tx.departments?.name ?? '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{tx.keterangan}</TableCell>
                      <TableCell className="text-right font-medium text-sm">{fmtRp(tx.nominal)}</TableCell>
                      <TableCell className="text-sm">{tx.bulan}</TableCell>
                      <TableCell>{statusBadge(tx.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openAddDialog(tx)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => deleteTxMutation.mutate(tx.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Hapus
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

          {/* Summary row */}
          {filteredTx.length > 0 && (
            <div className="flex justify-end">
              <div className="text-sm text-muted-foreground">
                {filteredTx.length} transaksi &nbsp;·&nbsp;
                <span className="font-semibold text-foreground">
                  {fmtRp(filteredTx.reduce((s, t) => s + t.nominal, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ANGGARAN TAB ──────────────────────────────────────────────────── */}
      {tab === 'anggaran' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Departemen</TableHead>
                    <TableHead className="text-right">Anggaran {TAHUN}</TableHead>
                    <TableHead className="text-right">Realisasi</TableHead>
                    <TableHead className="text-right">Sisa</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map(dept => {
                    const budget = budgetMap[dept.id] ?? 0;
                    const spent = spentByDept[dept.id] ?? 0;
                    const sisa = budget - spent;
                    const pct = budget > 0 ? (spent / budget) * 100 : 0;
                    return (
                      <TableRow key={dept.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                            <span className="font-medium text-sm">{dept.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {budget > 0 ? fmtRp(budget) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtRp(spent)}</TableCell>
                        <TableCell className={`text-right text-sm font-medium ${sisa < 0 ? 'text-red-500' : ''}`}>
                          {budget > 0 ? fmtRp(sisa) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {budget > 0 ? (
                            <span className={`text-xs font-semibold ${pct > 90 ? 'text-red-500' : pct > 75 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {pct.toFixed(1)}%
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openBudgetDialog(dept)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Total row */}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right text-sm">{fmtRp(totalAnggaran)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtRp(totalRealisasi)}</TableCell>
                    <TableCell className={`text-right text-sm ${sisaAnggaran < 0 ? 'text-red-500' : ''}`}>
                      {fmtRp(sisaAnggaran)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-xs font-bold ${pctTerpakai > 90 ? 'text-red-500' : pctTerpakai > 75 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {pctTerpakai.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── DIALOG: Tambah/Edit Transaksi ─────────────────────────────────── */}
      <Dialog open={isAddOpen} onOpenChange={v => { if (!v) closeAddDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTx ? 'Edit Transaksi' : 'Tambah Transaksi'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={fTanggal} onChange={e => setFTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Departemen</Label>
              <Select value={fDept} onValueChange={setFDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih departemen" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Textarea
                value={fKeterangan}
                onChange={e => setFKeterangan(e.target.value)}
                placeholder="Deskripsi pengeluaran..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nominal (Rp)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={fNominal ? parseInt(fNominal.replace(/\D/g, '') || '0', 10).toLocaleString('id-ID') : ''}
                onChange={e => setFNominal(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
              />
            </div>
            {/* Preview status */}
            {fDept && fNominal && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Status yang akan disimpan:</span>
                {statusBadge(calcStatus(fDept, parseInt(fNominal || '0', 10), editTx?.id))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>Batal</Button>
            <Button onClick={() => saveTxMutation.mutate()} disabled={saveTxMutation.isPending}>
              {saveTxMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Edit Anggaran ─────────────────────────────────────────── */}
      <Dialog open={isBudgetOpen} onOpenChange={v => { if (!v) { setIsBudgetOpen(false); setEditBudget(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Anggaran — {editBudget?.dept.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Anggaran {TAHUN} (Rp)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={editBudget ? (editBudget.amount ? editBudget.amount.toLocaleString('id-ID') : '') : ''}
                onChange={e => {
                  const val = parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
                  setEditBudget(prev => prev ? { ...prev, amount: val } : prev);
                }}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsBudgetOpen(false); setEditBudget(null); }}>Batal</Button>
            <Button
              onClick={() => editBudget && saveBudgetMutation.mutate({ deptId: editBudget.dept.id, amount: editBudget.amount })}
              disabled={saveBudgetMutation.isPending}
            >
              {saveBudgetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
