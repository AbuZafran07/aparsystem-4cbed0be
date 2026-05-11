import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, X,
  CalendarDays, Building2, FileText, Banknote, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────
const db = supabase as any;
const TAHUN = 2026;

const BULAN_LIST = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Department { id: string; name: string; color: string; }
interface Budget { department_id: string; amount: number; }
interface Transaction {
  id: string; tanggal: string; department_id: string; keterangan: string;
  nominal: number; bulan: string; tahun: number; status: string;
  created_at: string; departments?: { name: string; color: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

/** Format number with dot-thousand separator, no currency symbol */
const fmtNumber = (n: number) =>
  n === 0 ? '' : new Intl.NumberFormat('id-ID').format(n);

const parseNumber = (s: string) => parseInt(s.replace(/\D/g, '') || '0', 10);

const bulanFromDate = (dateStr: string): string => {
  const m = new Date(dateStr + 'T00:00:00').getMonth();
  return BULAN_LIST[m] ?? BULAN_LIST[0];
};

const fmtTanggal = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

// ─── Status helpers ───────────────────────────────────────────────────────────
type StatusType = 'normal' | 'warning' | 'over';

const getStatus = (spent: number, budget: number): StatusType => {
  if (!budget) return 'normal';
  const pct = spent / budget;
  if (pct >= 1) return 'over';
  if (pct >= 0.8) return 'warning';
  return 'normal';
};

const STATUS_CONFIG: Record<StatusType, { label: string; bg: string; text: string; dot: string }> = {
  normal:  { label: 'Normal',    bg: 'bg-green-500/10',  text: 'text-green-600 dark:text-green-400',  dot: 'bg-green-500' },
  warning: { label: 'Mendekati', bg: 'bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' },
  over:    { label: 'Over',      bg: 'bg-red-500/10',    text: 'text-red-600 dark:text-red-400',      dot: 'bg-red-500' },
};

function StatusPill({ status }: { status: StatusType }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function DeptPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
      {label}
      <button
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
        aria-label="Hapus filter"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ─── Nominal Input ────────────────────────────────────────────────────────────
function NominalInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const raw = parseNumber(value);
  const display = raw > 0 ? fmtNumber(raw) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits);
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
        Rp
      </span>
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder="0"
        className="pl-10"
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditTransaksiPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filter state — initialise from URL params ─────────────────────────────
  const [filterDept, setFilterDept] = useState<string>(searchParams.get('dept') ?? 'all');
  const [filterBulan, setFilterBulan] = useState<string>(searchParams.get('bulan') ?? 'all');
  const [search, setSearch] = useState('');

  // Re-apply when URL params change (e.g. navigating from dashboard chart)
  useEffect(() => {
    const d = searchParams.get('dept');
    const b = searchParams.get('bulan');
    if (d) setFilterDept(d);
    if (b) setFilterBulan(b);
  }, [searchParams]);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);

  // Form fields
  const [fTanggal, setFTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [fDept, setFDept] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fNominal, setFNominal] = useState('');
  const [fBulan, setFBulan] = useState(bulanFromDate(new Date().toISOString().split('T')[0]));
  const [fBulanManual, setFBulanManual] = useState(false); // true if user overrode auto-fill

  // ── Queries ───────────────────────────────────────────────────────────────
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments]);

  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
    [budgets],
  );

  /** Total spent per dept (all transactions YTD) */
  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [transactions]);

  /** Real-time dept status based on current totals */
  const deptStatus = useMemo((): Record<string, StatusType> =>
    Object.fromEntries(
      departments.map(d => [d.id, getStatus(spentByDept[d.id] ?? 0, budgetMap[d.id] ?? 0)])
    ),
  [departments, spentByDept, budgetMap]);

  /** Status preview while filling the form — includes the nominal being entered */
  const formStatusPreview = useMemo((): StatusType | null => {
    if (!fDept || !parseNumber(fNominal)) return null;
    const currentSpent = spentByDept[fDept] ?? 0;
    const excludedSpent = editTx?.department_id === fDept ? (editTx.nominal ?? 0) : 0;
    const hypotheticalSpent = currentSpent - excludedSpent + parseNumber(fNominal);
    return getStatus(hypotheticalSpent, budgetMap[fDept] ?? 0);
  }, [fDept, fNominal, spentByDept, budgetMap, editTx]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => transactions.filter(t => {
    if (filterDept !== 'all' && t.department_id !== filterDept) return false;
    if (filterBulan !== 'all' && t.bulan !== filterBulan) return false;
    if (search && !t.keterangan.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [transactions, filterDept, filterBulan, search]);

  const totalFiltered = filtered.reduce((s, t) => s + t.nominal, 0);
  const activeFilterCount = [filterDept !== 'all', filterBulan !== 'all', !!search].filter(Boolean).length;

  // ── Filter helpers ────────────────────────────────────────────────────────
  const updateFilter = (key: 'dept' | 'bulan', value: string) => {
    setSearchParams(p => {
      if (value === 'all') p.delete(key);
      else p.set(key, value);
      return p;
    });
    if (key === 'dept') setFilterDept(value);
    else setFilterBulan(value);
  };

  const clearAllFilters = () => {
    setFilterDept('all');
    setFilterBulan('all');
    setSearch('');
    setSearchParams({});
  };

  // ── Form helpers ──────────────────────────────────────────────────────────
  const handleTanggalChange = (val: string) => {
    setFTanggal(val);
    if (!fBulanManual) setFBulan(bulanFromDate(val));
  };

  const handleBulanChange = (val: string) => {
    setFBulan(val);
    setFBulanManual(true);
  };

  const openAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditTx(null);
    setFTanggal(today);
    setFDept(departments[0]?.id ?? '');
    setFKeterangan('');
    setFNominal('');
    setFBulan(bulanFromDate(today));
    setFBulanManual(false);
    setIsFormOpen(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setFTanggal(tx.tanggal);
    setFDept(tx.department_id);
    setFKeterangan(tx.keterangan);
    setFNominal(tx.nominal.toString());
    setFBulan(tx.bulan);
    setFBulanManual(true);
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditTx(null); };

  const confirmDelete = (tx: Transaction) => { setDeleteTx(tx); setIsDeleteOpen(true); };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const nominal = parseNumber(fNominal);
      if (!fTanggal) throw new Error('Tanggal wajib diisi');
      if (!fDept) throw new Error('Departemen wajib dipilih');
      if (!fKeterangan.trim()) throw new Error('Keterangan wajib diisi');
      if (!nominal) throw new Error('Nominal wajib diisi');

      const currentSpent = spentByDept[fDept] ?? 0;
      const excludedSpent = editTx?.department_id === fDept ? (editTx.nominal ?? 0) : 0;
      const hypotheticalSpent = currentSpent - excludedSpent + nominal;
      const status = getStatus(hypotheticalSpent, budgetMap[fDept] ?? 0);

      const payload = {
        tanggal: fTanggal,
        department_id: fDept,
        keterangan: fKeterangan.trim(),
        nominal,
        bulan: fBulan,
        tahun: TAHUN,
        status,
        created_by: user?.id,
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
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      closeForm();
      toast({ title: 'Berhasil', description: editTx ? 'Transaksi berhasil diperbarui' : 'Transaksi berhasil disimpan' });
    },
    onError: (e: Error) => toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('cash_out_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-transactions'] });
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      setIsDeleteOpen(false);
      setDeleteTx(null);
      toast({ title: 'Berhasil', description: 'Transaksi dihapus' });
    },
    onError: (e: Error) => toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' }),
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Transaksi Cash Out</h1>
          <p className="text-sm text-muted-foreground">
            Tahun {TAHUN} · {transactions.length} total transaksi
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Input Transaksi
        </Button>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cari keterangan..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Dept filter */}
          <Select value={filterDept} onValueChange={v => updateFilter('dept', v)}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Semua Dept" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Dept</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Bulan filter */}
          <Select value={filterBulan} onValueChange={v => updateFilter('bulan', v)}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue placeholder="Semua Bulan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Bulan</SelectItem>
              {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            >
              Reset semua
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filterDept !== 'all' && (
              <FilterChip
                label={`Dept: ${deptMap[filterDept]?.name ?? filterDept}`}
                onRemove={() => updateFilter('dept', 'all')}
              />
            )}
            {filterBulan !== 'all' && (
              <FilterChip
                label={`Bulan: ${filterBulan}`}
                onRemove={() => updateFilter('bulan', 'all')}
              />
            )}
            {search && (
              <FilterChip
                label={`Cari: "${search}"`}
                onRemove={() => setSearch('')}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[120px]">Tanggal</TableHead>
                <TableHead className="w-[140px]">Departemen</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right w-[160px]">Nominal</TableHead>
                <TableHead className="w-[100px]">Bulan</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="w-8 h-8 opacity-30" />
                      <p className="text-sm">
                        {activeFilterCount > 0 ? 'Tidak ada transaksi yang cocok dengan filter' : 'Belum ada transaksi'}
                      </p>
                      {activeFilterCount > 0 && (
                        <button onClick={clearAllFilters} className="text-xs text-primary hover:underline">Reset filter</button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(tx => {
                  const status = deptStatus[tx.department_id] ?? 'normal';
                  return (
                    <TableRow key={tx.id} className="group">
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {fmtTanggal(tx.tanggal)}
                      </TableCell>
                      <TableCell>
                        {tx.departments ? (
                          <DeptPill name={tx.departments.name} color={tx.departments.color} />
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-sm max-w-[280px]">
                        <span className="line-clamp-2">{tx.keterangan}</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm whitespace-nowrap tabular-nums">
                        {fmtRp(tx.nominal)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tx.bulan}</TableCell>
                      <TableCell>
                        <StatusPill status={status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(tx)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => confirmDelete(tx)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Hapus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Footer summary ───────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Menampilkan <span className="font-medium text-foreground">{filtered.length}</span> dari {transactions.length} transaksi
          </span>
          <span className="text-muted-foreground">
            Total: <span className="font-bold text-foreground">{fmtRp(totalFiltered)}</span>
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Input / Edit Transaksi                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={isFormOpen} onOpenChange={v => { if (!v) closeForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTx ? 'Edit Transaksi' : 'Input Transaksi'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Tanggal */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                Tanggal
              </Label>
              <Input
                type="date"
                value={fTanggal}
                onChange={e => handleTanggalChange(e.target.value)}
              />
            </div>

            {/* Departemen */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                Departemen
              </Label>
              <Select value={fDept} onValueChange={setFDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih departemen..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Keterangan */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                Keterangan
              </Label>
              <Input
                value={fKeterangan}
                onChange={e => setFKeterangan(e.target.value)}
                placeholder="Deskripsi pengeluaran..."
              />
            </div>

            {/* Nominal */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                Nominal
              </Label>
              <NominalInput value={fNominal} onChange={setFNominal} />
              {parseNumber(fNominal) > 0 && (
                <p className="text-xs text-muted-foreground pl-1">
                  {fmtRp(parseNumber(fNominal))}
                </p>
              )}
            </div>

            {/* Bulan — 2 columns: auto + manual override */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Bulan</Label>
                {fBulanManual && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setFBulan(bulanFromDate(fTanggal)); setFBulanManual(false); }}
                  >
                    Reset dari tanggal
                  </button>
                )}
              </div>
              <Select value={fBulan} onValueChange={handleBulanChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              {!fBulanManual && (
                <p className="text-xs text-muted-foreground pl-1">Auto-fill dari tanggal yang dipilih</p>
              )}
            </div>

            {/* Status preview */}
            {formStatusPreview && (
              <div className={cn(
                'flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm',
                STATUS_CONFIG[formStatusPreview].bg,
              )}>
                <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', STATUS_CONFIG[formStatusPreview].text)} />
                <div>
                  <p className={cn('font-semibold', STATUS_CONFIG[formStatusPreview].text)}>
                    Status Dept: {STATUS_CONFIG[formStatusPreview].label}
                  </p>
                  {fDept && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Total realisasi {deptMap[fDept]?.name ?? ''} setelah transaksi ini:{' '}
                      <span className="font-medium">
                        {fmtRp(
                          (spentByDept[fDept] ?? 0)
                          - (editTx?.department_id === fDept ? editTx.nominal : 0)
                          + parseNumber(fNominal)
                        )}
                      </span>
                      {' '}/{' '}
                      <span className="font-medium">{fmtRp(budgetMap[fDept] ?? 0)}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Batal</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Konfirmasi hapus                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={isDeleteOpen} onOpenChange={v => { if (!v) { setIsDeleteOpen(false); setDeleteTx(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Hapus Transaksi
            </DialogTitle>
            <DialogDescription>
              Transaksi ini akan dihapus permanen dan tidak bisa dipulihkan.
            </DialogDescription>
          </DialogHeader>
          {deleteTx && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-1 text-sm">
              <p className="font-medium">{deleteTx.keterangan}</p>
              <p className="text-muted-foreground">
                {fmtTanggal(deleteTx.tanggal)} · {deleteTx.departments?.name ?? '—'}
              </p>
              <p className="font-bold text-destructive">{fmtRp(deleteTx.nominal)}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDeleteOpen(false); setDeleteTx(null); }}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTx && deleteMutation.mutate(deleteTx.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
