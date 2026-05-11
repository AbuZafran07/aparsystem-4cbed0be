import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ArrowRight, Loader2, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// ─── Types & constants ────────────────────────────────────────────────────────
const db = supabase as any;
const TAHUN = 2026;

interface Department { id: string; name: string; color: string; }
interface BudgetRow   { department_id: string; amount: number; }
interface Transaction { department_id: string; nominal: number; }

type AlertLevel = 'over' | 'warning';

interface DeptStat {
  id: string; name: string; color: string;
  budget: number; spent: number; remaining: number; pct: number;
  level: AlertLevel;
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

// ─── Alert Card ───────────────────────────────────────────────────────────────
function AlertCard({ dept, onViewTransaksi }: { dept: DeptStat; onViewTransaksi: () => void }) {
  const isOver = dept.level === 'over';
  const pctDisplay = (dept.pct * 100).toFixed(1);

  return (
    <Card className={cn('border-l-4 transition-shadow hover:shadow-md', isOver ? 'border-l-red-500' : 'border-l-yellow-500')}>
      <CardContent className="py-4 px-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', isOver ? 'bg-red-500/10' : 'bg-yellow-500/10')}>
            <AlertTriangle className={cn('w-5 h-5', isOver ? 'text-red-500' : 'text-yellow-500')} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: dept.color }}
              >
                {dept.name}
              </span>
              <Badge
                className={cn('text-xs font-semibold', isOver
                  ? 'bg-red-500 hover:bg-red-500 text-white'
                  : 'bg-yellow-500 hover:bg-yellow-500 text-white')}
              >
                {isOver ? 'Over Budget' : 'Mendekati Batas'}
              </Badge>
              <span className={cn('text-sm font-bold ml-auto', isOver ? 'text-red-500' : 'text-yellow-600')}>
                {pctDisplay}%
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Budget</p>
                <p className="text-sm font-semibold mt-0.5">{fmtRp(dept.budget)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Realisasi</p>
                <p className={cn('text-sm font-semibold mt-0.5', isOver ? 'text-red-500' : 'text-yellow-600')}>
                  {fmtRp(dept.spent)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {isOver ? 'Kelebihan' : 'Sisa'}
                </p>
                <p className={cn('text-sm font-semibold mt-0.5', isOver && 'text-red-500')}>
                  {isOver ? `−${fmtRp(Math.abs(dept.remaining))}` : fmtRp(dept.remaining)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(dept.pct * 100, 100)}%`,
                    backgroundColor: isOver ? '#ef4444' : '#eab308',
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {pctDisplay}% dari anggaran terpakai
                {isOver && ` · melebihi ${fmtRp(Math.abs(dept.remaining))}`}
              </p>
            </div>
          </div>

          {/* Action */}
          <Button
            variant="outline"
            size="sm"
            className="flex-shrink-0 gap-1.5 text-xs self-start mt-0.5"
            onClick={onViewTransaksi}
          >
            Lihat Transaksi
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditAlertPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Queries ─── refetch every 30s for real-time badge update ─────────────
  const { data: departments = [], isLoading: deptLoading } = useQuery<Department[]>({
    queryKey: ['audit-departments'],
    queryFn: async () => {
      const { data, error } = await db.from('departments').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: budgets = [] } = useQuery<BudgetRow[]>({
    queryKey: ['audit-budgets', TAHUN],
    queryFn: async () => {
      const { data, error } = await db.from('budgets').select('department_id, amount').eq('year', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions = [], isLoading: txLoading, dataUpdatedAt, refetch } = useQuery<Transaction[]>({
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

  // ── Computed stats ────────────────────────────────────────────────────────
  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
    [budgets],
  );

  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [transactions]);

  const allDeptStats = useMemo(() =>
    departments.map(d => {
      const budget = budgetMap[d.id] ?? 0;
      const spent  = spentByDept[d.id] ?? 0;
      const pct    = budget > 0 ? spent / budget : 0;
      return { ...d, budget, spent, remaining: budget - spent, pct };
    }),
  [departments, budgetMap, spentByDept]);

  const alertDepts: DeptStat[] = useMemo(() =>
    allDeptStats
      .filter(d => d.budget > 0 && d.pct >= 0.8)
      .map(d => ({ ...d, level: (d.pct >= 1 ? 'over' : 'warning') as AlertLevel }))
      .sort((a, b) => b.pct - a.pct),
  [allDeptStats]);

  const safeDepts = useMemo(() =>
    allDeptStats.filter(d => d.budget === 0 || d.pct < 0.8),
  [allDeptStats]);

  const overCount  = alertDepts.filter(d => d.level === 'over').length;
  const warnCount  = alertDepts.filter(d => d.level === 'warning').length;

  // Keep sidebar badge in sync
  React.useEffect(() => {
    qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
  }, [dataUpdatedAt, qc]);

  const isLoading = deptLoading || txLoading;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Alert & Notifikasi</h1>
          <p className="text-sm text-muted-foreground">
            Monitoring budget real-time · Update terakhir: {lastUpdated}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alertDepts.length > 0 && (
            <div className="flex items-center gap-2">
              {overCount > 0 && (
                <Badge className="bg-red-500 hover:bg-red-500 gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {overCount} Over Budget
                </Badge>
              )}
              {warnCount > 0 && (
                <Badge className="bg-yellow-500 hover:bg-yellow-500 gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {warnCount} Mendekati
                </Badge>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Dept', value: departments.length, color: 'text-foreground' },
          { label: 'Alert Aktif', value: alertDepts.length, color: alertDepts.length > 0 ? 'text-red-500' : 'text-green-500' },
          { label: 'Dept Aman', value: safeDepts.length, color: 'text-green-500' },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={cn('text-3xl font-bold', item.color)}>{item.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Alert list ───────────────────────────────────────────────────── */}
      {alertDepts.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Semua department dalam batas budget ✓</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tidak ada departemen yang mencapai 80% anggaran
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Over budget section */}
          {overCount > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Over Budget ({overCount})
              </h2>
              {alertDepts.filter(d => d.level === 'over').map(dept => (
                <AlertCard
                  key={dept.id}
                  dept={dept}
                  onViewTransaksi={() => navigate(`/audit-cashout/transaksi?dept=${dept.id}`)}
                />
              ))}
            </div>
          )}

          {/* Warning section */}
          {warnCount > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-yellow-600 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Mendekati Batas ({warnCount})
              </h2>
              {alertDepts.filter(d => d.level === 'warning').map(dept => (
                <AlertCard
                  key={dept.id}
                  dept={dept}
                  onViewTransaksi={() => navigate(`/audit-cashout/transaksi?dept=${dept.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Safe dept list (compact) ──────────────────────────────────────── */}
      {safeDepts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Departemen Aman ({safeDepts.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {safeDepts.map(dept => {
              const pct = dept.budget > 0 ? dept.pct : 0;
              return (
                <Card key={dept.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3.5 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                            <span className="text-sm font-medium truncate">{dept.name}</span>
                          </div>
                          {dept.budget > 0 ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {(pct * 100).toFixed(1)}% terpakai
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">Budget belum diset</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-green-500 flex-shrink-0">
                        {dept.budget > 0 ? `${(pct * 100).toFixed(0)}%` : '—'}
                      </span>
                    </div>
                    {dept.budget > 0 && (
                      <div className="w-full bg-muted rounded-full h-1.5 mt-2.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-green-500 transition-all"
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
