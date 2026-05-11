import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const db = supabase as any;
const TAHUN = 2026;
const BULAN_LIST = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

interface Department { id: string; name: string; color: string; }
interface Transaction {
  id: string; tanggal: string; department_id: string; keterangan: string;
  nominal: number; bulan: string; tahun: number; status: string;
  departments?: { name: string };
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

export default function AuditExportPage() {
  const { toast } = useToast();
  const [filterBulan, setFilterBulan] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [isExporting, setIsExporting] = useState(false);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['audit-departments'],
    queryFn: async () => {
      const { data, error } = await db.from('departments').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db
        .from('cash_out_transactions')
        .select('*, departments(name)')
        .eq('tahun', TAHUN)
        .order('tanggal', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = transactions.filter(t => {
    const matchBulan = filterBulan === 'all' || t.bulan === filterBulan;
    const matchDept = filterDept === 'all' || t.department_id === filterDept;
    return matchBulan && matchDept;
  });

  const totalFiltered = filtered.reduce((s, t) => s + t.nominal, 0);

  const handleExportCSV = async () => {
    if (!filtered.length) { toast({ title: 'Tidak ada data', description: 'Filter tidak menghasilkan data', variant: 'destructive' }); return; }
    setIsExporting(true);
    try {
      const headers = ['Tanggal', 'Departemen', 'Keterangan', 'Nominal', 'Bulan', 'Tahun', 'Status'];
      const rows = filtered.map(t => [
        t.tanggal,
        t.departments?.name ?? '',
        `"${t.keterangan.replace(/"/g, '""')}"`,
        t.nominal,
        t.bulan,
        t.tahun,
        t.status,
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-cashout-${TAHUN}${filterBulan !== 'all' ? `-${filterBulan}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Berhasil', description: `${filtered.length} transaksi diekspor` });
    } catch {
      toast({ title: 'Error', description: 'Gagal mengekspor data', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Export Laporan</h1>
        <p className="text-sm text-muted-foreground">Download data Audit Cash Out {TAHUN}</p>
      </div>

      {/* Filter & Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Filter Data Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={filterBulan} onValueChange={setFilterBulan}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Semua Bulan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Bulan</SelectItem>
                {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Semua Departemen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Departemen</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-muted/50 px-4 py-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Data yang akan diekspor: </span>
              <span className="font-semibold">{isLoading ? '...' : filtered.length} transaksi</span>
              {filtered.length > 0 && (
                <span className="text-muted-foreground"> · {fmtRp(totalFiltered)}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleExportCSV}
              disabled={isExporting || isLoading || filtered.length === 0}
              className="gap-2"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Export CSV
            </Button>
            <Button variant="outline" disabled className="gap-2 opacity-50">
              <FileText className="w-4 h-4" />
              Export PDF (segera)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {filtered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Preview Data ({filtered.length} baris pertama)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Tanggal</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Departemen</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Keterangan</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 10).map(tx => (
                    <tr key={tx.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 whitespace-nowrap">{tx.tanggal}</td>
                      <td className="py-2 pr-4">{tx.departments?.name ?? '—'}</td>
                      <td className="py-2 pr-4 max-w-[200px] truncate">{tx.keterangan}</td>
                      <td className="py-2 text-right whitespace-nowrap">{fmtRp(tx.nominal)}</td>
                    </tr>
                  ))}
                  {filtered.length > 10 && (
                    <tr><td colSpan={4} className="py-2 text-center text-muted-foreground">... dan {filtered.length - 10} baris lainnya</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
