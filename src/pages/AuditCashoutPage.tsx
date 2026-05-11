import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingDown, Wallet, AlertTriangle, FileText, X, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const db = supabase as any;
const TAHUN = 2026;

const BULAN_LIST = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const NOW_BULAN = BULAN_LIST[new Date().getMonth()];

interface Department { id: string; name: string; color: string; }
interface Budget { department_id: string; amount: number; }
interface Transaction { id: string; tanggal: string; department_id: string; nominal: number; bulan: string; tahun: number; }

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}K`;
  return `Rp ${n}`;
};

// ── Custom Tooltip for BarChart ────────────────────────────────────────────
const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-muted-foreground">{fmtRp(payload[0].value)}</p>
    </div>
  );
};

const DonutTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{payload[0].name}</p>
      <p className="text-muted-foreground">{fmtRp(payload[0].value)}</p>
    </div>
  );
};

export default function AuditCashoutPage() {
  const navigate = useNavigate();
  const [filterBulan, setFilterBulan] = useState<string>('all');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // ── Queries ──────────────────────────────────────────────────────────────
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
        .select('id, tanggal, department_id, nominal, bulan, tahun')
        .eq('tahun', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
    [budgets],
  );

  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [transactions]);

  const deptStats = useMemo(() =>
    departments.map(d => {
      const budget = budgetMap[d.id] ?? 0;
      const spent = spentByDept[d.id] ?? 0;
      const pct = budget > 0 ? spent / budget : 0;
      return { ...d, budget, spent, remaining: budget - spent, pct };
    }),
  [departments, budgetMap, spentByDept]);

  // KPI cards (always YTD, no filter)
  const totalPengeluaranYTD = transactions.reduce((s, t) => s + t.nominal, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const budgetTersisa = totalBudget - totalPengeluaranYTD;
  const deptOverBudget = deptStats.filter(d => d.pct >= 1).length;
  const transaksiBuilanIni = transactions.filter(t => t.bulan === NOW_BULAN).length;

  // Alert depts (>=80%)
  const alertDepts = useMemo(() =>
    deptStats.filter(d => d.budget > 0 && d.pct >= 0.8 && !dismissedAlerts.includes(d.id)),
  [deptStats, dismissedAlerts]);

  // Bar chart — monthly, filtered by dept
  const barData = useMemo(() => {
    const src = filterDept === 'all' ? transactions : transactions.filter(t => t.department_id === filterDept);
    return BULAN_LIST.map(b => ({
      bulan: b.slice(0, 3),
      bulanFull: b,
      total: src.filter(t => t.bulan === b).reduce((s, t) => s + t.nominal, 0),
    }));
  }, [transactions, filterDept]);

  // Donut chart — by dept, filtered by bulan
  const donutData = useMemo(() => {
    const src = filterBulan === 'all' ? transactions : transactions.filter(t => t.bulan === filterBulan);
    return departments
      .map(d => ({
        id: d.id,
        name: d.name,
        color: d.color,
        value: src.filter(t => t.department_id === d.id).reduce((s, t) => s + t.nominal, 0),
      }))
      .filter(d => d.value > 0);
  }, [transactions, departments, filterBulan]);

  // Progress bars — filtered by dept
  const visibleDeptStats = filterDept === 'all' ? deptStats : deptStats.filter(d => d.id === filterDept);

  const progressColor = (pct: number) => {
    if (pct >= 1) return '#ef4444';
    if (pct >= 0.8) return '#eab308';
    return '#22c55e';
  };

  const pctClass = (pct: number) =>
    pct >= 1 ? 'text-red-500' : pct >= 0.8 ? 'text-yellow-500' : 'text-green-500';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page Header / Topbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard — Audit Cash Out</h1>
          <p className="text-sm text-muted-foreground">Tahun {TAHUN} · Real-time monitoring</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterBulan} onValueChange={setFilterBulan}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Semua Bulan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Bulan</SelectItem>
              {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="Semua Dept" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Dept</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Alert Banner ──────────────────────────────────────────────────── */}
      {alertDepts.length > 0 && (
        <div className="space-y-2">
          {/* Group: over (>=100%) */}
          {alertDepts.filter(d => d.pct >= 1).length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">Over Budget:</span>
                {alertDepts.filter(d => d.pct >= 1).map(d => (
                  <button
                    key={d.id}
                    onClick={() => setFilterDept(d.id)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    {d.name} ({(d.pct * 100).toFixed(0)}%)
                  </button>
                ))}
              </div>
              <button
                className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                onClick={() => setDismissedAlerts(p => [...p, ...alertDepts.filter(d => d.pct >= 1).map(d => d.id)])}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Group: warning (80–99%) */}
          {alertDepts.filter(d => d.pct >= 0.8 && d.pct < 1).length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Mendekati Batas:</span>
                {alertDepts.filter(d => d.pct >= 0.8 && d.pct < 1).map(d => (
                  <button
                    key={d.id}
                    onClick={() => setFilterDept(d.id)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500 text-white text-xs font-medium hover:bg-yellow-600 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    {d.name} ({(d.pct * 100).toFixed(0)}%)
                  </button>
                ))}
              </div>
              <button
                className="text-yellow-400 hover:text-yellow-600 transition-colors flex-shrink-0"
                onClick={() => setDismissedAlerts(p => [...p, ...alertDepts.filter(d => d.pct >= 0.8 && d.pct < 1).map(d => d.id)])}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">Total Pengeluaran YTD</p>
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">{fmtCompact(totalPengeluaranYTD)}</p>
            <p className="text-xs text-muted-foreground mt-1">{transactions.length} transaksi total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">Budget Tersisa</p>
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center',
                budgetTersisa < 0 ? 'bg-red-500/10' : 'bg-green-500/10'
              )}>
                <Wallet className={cn('w-4 h-4', budgetTersisa < 0 ? 'text-red-500' : 'text-green-500')} />
              </div>
            </div>
            <p className={cn('text-2xl font-bold tracking-tight', budgetTersisa < 0 && 'text-red-500')}>
              {fmtCompact(Math.abs(budgetTersisa))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {budgetTersisa < 0 ? 'Melebihi anggaran' : `dari ${fmtCompact(totalBudget)}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">Dept Over Budget</p>
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center',
                deptOverBudget > 0 ? 'bg-red-500/10' : 'bg-green-500/10'
              )}>
                <AlertTriangle className={cn('w-4 h-4', deptOverBudget > 0 ? 'text-red-500' : 'text-green-500')} />
              </div>
            </div>
            <p className={cn('text-2xl font-bold tracking-tight', deptOverBudget > 0 && 'text-red-500')}>
              {deptOverBudget}
            </p>
            <p className="text-xs text-muted-foreground mt-1">dari {departments.length} departemen</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">Transaksi Bulan Ini</p>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">{transaksiBuilanIni}</p>
            <p className="text-xs text-muted-foreground mt-1">{NOW_BULAN} {TAHUN}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Bar chart — monthly trend */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Tren Pengeluaran per Bulan</CardTitle>
              {filterDept !== 'all' && (
                <Badge variant="secondary" className="text-xs">
                  {departments.find(d => d.id === filterDept)?.name}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Klik bar untuk lihat transaksi bulan tersebut</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={barData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 10 }} width={62} axisLine={false} tickLine={false} />
                <RTooltip content={<BarTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Bar
                  dataKey="total"
                  name="Pengeluaran"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(data: any) => {
                    if (data.total > 0) {
                      navigate(`/audit-cashout/transaksi?bulan=${encodeURIComponent(data.bulanFull)}`);
                    }
                  }}
                >
                  {barData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.bulanFull === filterBulan ? '#3b82f6' : 'hsl(var(--primary))'}
                      fillOpacity={entry.bulanFull === filterBulan ? 1 : 0.75}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Donut chart — by dept */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Pengeluaran per Departemen</CardTitle>
              {filterBulan !== 'all' && (
                <Badge variant="secondary" className="text-xs">{filterBulan}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Klik segment untuk lihat transaksi departemen tersebut</p>
          </CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <div className="flex items-center justify-center h-[230px] text-muted-foreground text-sm">
                Belum ada data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    dataKey="value"
                    cursor="pointer"
                    onClick={(data: any) => {
                      navigate(`/audit-cashout/transaksi?dept=${encodeURIComponent(data.id)}`);
                    }}
                    paddingAngle={2}
                  >
                    {donutData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.color}
                        stroke="transparent"
                        fillOpacity={filterDept === 'all' || filterDept === entry.id ? 1 : 0.35}
                      />
                    ))}
                  </Pie>
                  <RTooltip content={<DonutTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Progress Bars per Dept ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Progress Anggaran per Departemen</CardTitle>
            {filterDept !== 'all' && (
              <button
                onClick={() => setFilterDept('all')}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Reset filter
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {visibleDeptStats.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-4">Belum ada data departemen</p>
          ) : (
            visibleDeptStats.map(dept => (
              <div key={dept.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dept.color }}
                    />
                    <span className="text-sm font-medium">{dept.name}</span>
                    {dept.pct >= 1 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Over</Badge>
                    )}
                    {dept.pct >= 0.8 && dept.pct < 1 && (
                      <Badge className="bg-yellow-500 hover:bg-yellow-500 text-[10px] px-1.5 py-0">Warning</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {fmtCompact(dept.spent)}
                      <span className="text-muted-foreground/50 mx-1">/</span>
                      {fmtCompact(dept.budget)}
                    </span>
                    <span className={cn('font-bold w-10 text-right', pctClass(dept.pct))}>
                      {(dept.pct * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(dept.pct * 100, 100)}%`,
                      backgroundColor: progressColor(dept.pct),
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/60">
                  <span>Realisasi</span>
                  <span>
                    Sisa: {dept.remaining >= 0 ? fmtCompact(dept.remaining) : `−${fmtCompact(Math.abs(dept.remaining))}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
