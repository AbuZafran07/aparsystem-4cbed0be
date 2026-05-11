import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const db = supabase as any;
const TAHUN = 2026;

interface Department { id: string; name: string; color: string; }
interface Budget { id?: string; department_id: string; year: number; amount: number; }
interface Transaction { department_id: string; nominal: number; }

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  return `Rp ${(n / 1_000).toFixed(0)}K`;
};

export default function AuditBudgetPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editData, setEditData] = useState<{ dept: Department; amount: number } | null>(null);

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
      const { data, error } = await db.from('budgets').select('*').eq('year', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db.from('cash_out_transactions').select('department_id, nominal').eq('tahun', TAHUN);
      if (error) throw error;
      return data ?? [];
    },
  });

  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b])),
    [budgets],
  );

  const spentMap = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [transactions]);

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = Object.values(spentMap).reduce((s, v) => s + v, 0);

  const saveMutation = useMutation({
    mutationFn: async ({ dept, amount }: { dept: Department; amount: number }) => {
      const existing = budgetMap[dept.id];
      if (existing?.id) {
        const { error } = await db.from('budgets').update({ amount, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('budgets').insert([{ department_id: dept.id, year: TAHUN, amount }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-budgets'] });
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      setEditData(null);
      toast({ title: 'Berhasil', description: 'Anggaran disimpan' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Budget Plan</h1>
        <p className="text-sm text-muted-foreground">Anggaran per departemen tahun {TAHUN}</p>
      </div>

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
                const budget = budgetMap[dept.id]?.amount ?? 0;
                const spent = spentMap[dept.id] ?? 0;
                const sisa = budget - spent;
                const pct = budget > 0 ? (spent / budget) * 100 : 0;
                const isOver = pct >= 100;
                const isWarn = pct >= 80 && !isOver;
                return (
                  <TableRow key={dept.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                        <span className="font-medium text-sm">{dept.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {budget > 0 ? fmtRp(budget) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtRp(spent)}</TableCell>
                    <TableCell className={cn('text-right text-sm font-medium', isOver && 'text-red-500')}>
                      {budget > 0 ? (sisa >= 0 ? fmtRp(sisa) : `−${fmtRp(Math.abs(sisa))}`) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {budget > 0 ? (
                        <span className={cn('text-xs font-bold', isOver ? 'text-red-500' : isWarn ? 'text-yellow-500' : 'text-green-500')}>
                          {pct.toFixed(1)}%
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setEditData({ dept, amount: budget })}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Total */}
              <TableRow className="font-semibold bg-muted/30 border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right text-sm">{fmtRp(totalBudget)}</TableCell>
                <TableCell className="text-right text-sm">{fmtRp(totalSpent)}</TableCell>
                <TableCell className={cn('text-right text-sm', totalBudget - totalSpent < 0 && 'text-red-500')}>
                  {fmtRp(totalBudget - totalSpent)}
                </TableCell>
                <TableCell className="text-right">
                  {totalBudget > 0 && (
                    <span className={cn('text-xs font-bold',
                      (totalSpent / totalBudget) >= 1 ? 'text-red-500'
                        : (totalSpent / totalBudget) >= 0.8 ? 'text-yellow-500' : 'text-green-500'
                    )}>
                      {((totalSpent / totalBudget) * 100).toFixed(1)}%
                    </span>
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Edit Budget */}
      <Dialog open={!!editData} onOpenChange={v => { if (!v) setEditData(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Anggaran — {editData?.dept.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Anggaran {TAHUN} (Rp)</Label>
              <Input
                type="text" inputMode="numeric"
                value={editData ? editData.amount.toLocaleString('id-ID') : ''}
                onChange={e => {
                  const val = parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
                  setEditData(prev => prev ? { ...prev, amount: val } : prev);
                }}
                placeholder="0"
              />
              {editData && editData.amount > 0 && (
                <p className="text-xs text-muted-foreground">{fmtCompact(editData.amount)}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditData(null)}>Batal</Button>
            <Button
              onClick={() => editData && saveMutation.mutate(editData)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
