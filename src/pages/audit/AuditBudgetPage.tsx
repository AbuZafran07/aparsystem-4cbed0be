import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, TrendingDown, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─── Constants & types ────────────────────────────────────────────────────────
const db = supabase as any;
const TAHUN = 2026;

interface Department  { id: string; name: string; color: string; }
interface BudgetRow   { id?: string; department_id: string; year: number; amount: number; }
interface Transaction { department_id: string; nominal: number; }

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(2)} jt`;
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return `Rp ${n}`;
};

/** Convert raw rupiah → display in juta (millions) */
const toJuta   = (rp: number) => rp / 1_000_000;
/** Convert juta input → raw rupiah */
const fromJuta = (juta: number) => Math.round(juta * 1_000_000);

const progressColor = (pct: number) =>
  pct >= 1 ? '#ef4444' : pct >= 0.8 ? '#eab308' : '#22c55e';

const pctClass = (pct: number) =>
  pct >= 1 ? 'text-red-500' : pct >= 0.8 ? 'text-yellow-500' : 'text-green-500';

// ─── Budget Card ──────────────────────────────────────────────────────────────
interface BudgetCardProps {
  dept: Department;
  budgetRp: number;
  spentRp: number;
  onSave: (deptId: string, amountRp: number) => Promise<void>;
}

function BudgetCard({ dept, budgetRp, spentRp, onSave }: BudgetCardProps) {
  const [inputVal, setInputVal] = useState(
    budgetRp > 0 ? toJuta(budgetRp).toString() : '',
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync when budgetRp changes from outside (initial load)
  useEffect(() => {
    if (!dirty) setInputVal(budgetRp > 0 ? toJuta(budgetRp).toString() : '');
  }, [budgetRp, dirty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.target.value);
    setDirty(true);
  };

  const handleBlur = async () => {
    const parsed = parseFloat(inputVal.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) return;
    const amountRp = fromJuta(parsed);
    if (amountRp === budgetRp) { setDirty(false); return; }
    setSaving(true);
    try {
      await onSave(dept.id, amountRp);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const pct = budgetRp > 0 ? spentRp / budgetRp : 0;
  const remaining = budgetRp - spentRp;

  return (
    <Card className="overflow-hidden flex flex-col">
      {/* Color accent strip */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: dept.color }} />

      <CardContent className="pt-4 pb-5 flex flex-col flex-1 gap-4">
        {/* Dept name */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base" style={{ color: dept.color }}>{dept.name}</h3>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>

        {/* Budget input */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Budget (juta Rp)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">Rp</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={inputVal}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="0"
              className="pl-9 font-semibold"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs select-none">jt</span>
          </div>
          {inputVal && parseFloat(inputVal) > 0 && (
            <p className="text-xs text-muted-foreground pl-1">
              = {fmtRp(fromJuta(parseFloat(inputVal.replace(',', '.'))))}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Realisasi</p>
            <p className="font-semibold text-red-500 mt-0.5 text-sm truncate">{fmtCompact(spentRp)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Sisa</p>
            <p className={cn('font-semibold mt-0.5 text-sm truncate', remaining < 0 ? 'text-red-500' : 'text-green-500')}>
              {remaining >= 0 ? fmtCompact(remaining) : `−${fmtCompact(Math.abs(remaining))}`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1 mt-auto">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Utilisasi</span>
            <span className={cn('font-bold', pctClass(pct))}>
              {budgetRp > 0 ? `${(pct * 100).toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pct * 100, 100)}%`,
                backgroundColor: progressColor(pct),
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditBudgetPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: departments = [], isLoading: deptLoading } = useQuery<Department[]>({
    queryKey: ['audit-departments'],
    queryFn: async () => {
      const { data, error } = await db.from('departments').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: budgets = [], isLoading: budgetLoading } = useQuery<BudgetRow[]>({
    queryKey: ['audit-budgets', TAHUN],
    queryFn: async () => {
      const { data, error } = await db.from('budgets').select('*').eq('year', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db
        .from('cash_out_transactions')
        .select('department_id, nominal')
        .eq('tahun', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b])),
    [budgets],
  );

  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [transactions]);

  const totalBudget    = budgets.reduce((s, b) => s + b.amount, 0);
  const totalRealisasi = Object.values(spentByDept).reduce((s, v) => s + v, 0);
  const totalSisa      = totalBudget - totalRealisasi;
  const totalPct       = totalBudget > 0 ? totalRealisasi / totalBudget : 0;

  // ── Save handler (upsert) ─────────────────────────────────────────────────
  const handleSaveBudget = async (deptId: string, amountRp: number) => {
    const existing = budgetMap[deptId];
    try {
      if (existing?.id) {
        const { error } = await db
          .from('budgets')
          .update({ amount: amountRp, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('budgets')
          .insert([{ department_id: deptId, year: TAHUN, amount: amountRp }]);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['audit-budgets'] });
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      toast({ title: 'Tersimpan', description: `Budget ${departments.find(d => d.id === deptId)?.name} diperbarui` });
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
      throw e;
    }
  };

  const isLoading = deptLoading || budgetLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold">Budget Plan {TAHUN}</h1>
        <p className="text-sm text-muted-foreground">
          Atur anggaran per departemen. Perubahan disimpan otomatis saat klik di luar input.
        </p>
      </div>

      {/* ── Budget Cards Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {departments.map(dept => (
          <BudgetCard
            key={dept.id}
            dept={dept}
            budgetRp={budgetMap[dept.id]?.amount ?? 0}
            spentRp={spentByDept[dept.id] ?? 0}
            onSave={handleSaveBudget}
          />
        ))}
      </div>

      {/* ── Progress Bars per Dept ────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Utilisasi Anggaran Real-time
        </h2>
        <Card>
          <CardContent className="py-5 space-y-5">
            {departments.map(dept => {
              const budget  = budgetMap[dept.id]?.amount ?? 0;
              const spent   = spentByDept[dept.id] ?? 0;
              const sisa    = budget - spent;
              const pct     = budget > 0 ? spent / budget : 0;
              return (
                <div key={dept.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                      <span className="font-medium">{dept.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground tabular-nums">
                        {fmtCompact(spent)}
                        <span className="mx-1 text-muted-foreground/40">/</span>
                        {budget > 0 ? fmtCompact(budget) : <span className="italic">belum diset</span>}
                      </span>
                      <span className={cn('font-bold w-12 text-right', budget > 0 ? pctClass(pct) : 'text-muted-foreground')}>
                        {budget > 0 ? `${(pct * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    {budget > 0 && (
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct * 100, 100)}%`, backgroundColor: progressColor(pct) }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>Realisasi YTD</span>
                    <span>
                      Sisa:{' '}
                      {budget > 0
                        ? sisa >= 0 ? fmtCompact(sisa) : `−${fmtCompact(Math.abs(sisa))}`
                        : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── Total Summary ────────────────────────────────────────────────── */}
      <Card className="border-2">
        <CardContent className="py-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5" /> Total Budget
              </p>
              <p className="text-xl font-bold">{fmtRp(totalBudget)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3.5 h-3.5" /> Total Realisasi
              </p>
              <p className="text-xl font-bold text-red-500">{fmtRp(totalRealisasi)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sisa Anggaran</p>
              <p className={cn('text-xl font-bold', totalSisa < 0 ? 'text-red-500' : 'text-green-500')}>
                {totalSisa >= 0 ? fmtRp(totalSisa) : `−${fmtRp(Math.abs(totalSisa))}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Utilisasi Total</p>
              <p className={cn('text-xl font-bold', pctClass(totalPct))}>
                {totalBudget > 0 ? `${(totalPct * 100).toFixed(1)}%` : '—'}
              </p>
              {totalBudget > 0 && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(totalPct * 100, 100)}%`, backgroundColor: progressColor(totalPct) }}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
