import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const db = supabase as any;
const TAHUN = 2026;

interface Department { id: string; name: string; color: string; }
interface Budget { department_id: string; amount: number; }
interface Transaction { department_id: string; nominal: number; bulan: string; }

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

export default function AuditAlertPage() {
  const navigate = useNavigate();

  const { data: departments = [], isLoading: deptLoading } = useQuery<Department[]>({
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

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db.from('cash_out_transactions').select('department_id, nominal, bulan').eq('tahun', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
    [budgets],
  );

  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [transactions]);

  const deptAlerts = useMemo(() =>
    departments
      .map(d => {
        const budget = budgetMap[d.id] ?? 0;
        const spent = spentByDept[d.id] ?? 0;
        const pct = budget > 0 ? spent / budget : 0;
        return { ...d, budget, spent, remaining: budget - spent, pct };
      })
      .filter(d => d.budget > 0 && d.pct >= 0.8)
      .sort((a, b) => b.pct - a.pct),
  [departments, budgetMap, spentByDept]);

  const safeDepsts = useMemo(() =>
    departments
      .map(d => {
        const budget = budgetMap[d.id] ?? 0;
        const spent = spentByDept[d.id] ?? 0;
        const pct = budget > 0 ? spent / budget : 0;
        return { ...d, budget, spent, pct };
      })
      .filter(d => d.budget > 0 && d.pct < 0.8),
  [departments, budgetMap, spentByDept]);

  const isLoading = deptLoading || txLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Alert & Monitoring</h1>
          <p className="text-sm text-muted-foreground">Departemen yang mendekati atau melebihi batas anggaran</p>
        </div>
        <Badge
          variant={deptAlerts.length > 0 ? 'destructive' : 'secondary'}
          className="text-sm px-3 py-1"
        >
          {deptAlerts.length} Alert Aktif
        </Badge>
      </div>

      {/* Alert Cards */}
      {deptAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="font-semibold">Semua departemen dalam batas aman</p>
            <p className="text-sm text-muted-foreground">Tidak ada departemen yang mencapai 80% anggaran</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deptAlerts.map(dept => {
            const isOver = dept.pct >= 1;
            const pctDisplay = (dept.pct * 100).toFixed(1);
            return (
              <Card
                key={dept.id}
                className={cn(
                  'border-l-4',
                  isOver ? 'border-l-red-500' : 'border-l-yellow-500'
                )}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                        isOver ? 'bg-red-500/10' : 'bg-yellow-500/10'
                      )}>
                        <AlertTriangle className={cn('w-5 h-5', isOver ? 'text-red-500' : 'text-yellow-500')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{dept.name}</span>
                          <Badge className={cn(
                            'text-xs',
                            isOver ? 'bg-red-500 hover:bg-red-500' : 'bg-yellow-500 hover:bg-yellow-500'
                          )}>
                            {isOver ? 'Over Budget' : `Warning ${pctDisplay}%`}
                          </Badge>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Realisasi</span>
                            <span className="font-medium">{fmtRp(dept.spent)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Anggaran</span>
                            <span>{fmtRp(dept.budget)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{isOver ? 'Kelebihan' : 'Sisa'}</span>
                            <span className={cn('font-medium', isOver && 'text-red-500')}>
                              {isOver ? `−${fmtRp(Math.abs(dept.remaining))}` : fmtRp(dept.remaining)}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 mt-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.min(dept.pct * 100, 100)}%`,
                                backgroundColor: isOver ? '#ef4444' : '#eab308',
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">{pctDisplay}% dari anggaran terpakai</p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0 gap-1 text-xs"
                      onClick={() => navigate(`/audit-cashout/transaksi?dept=${dept.id}`)}
                    >
                      Lihat Transaksi <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Safe depts */}
      {safeDepsts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Departemen Aman</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {safeDepsts.map(dept => (
              <div
                key={dept.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                    <span className="text-sm font-medium truncate">{dept.name}</span>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-0.5">
                    {(dept.pct * 100).toFixed(1)}% terpakai
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
