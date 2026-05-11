import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileSpreadsheet, Download, Loader2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ─── Types & constants ────────────────────────────────────────────────────────
const db = supabase as any;
const TAHUN = 2026;

const BULAN_LIST = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

interface Department  { id: string; name: string; color: string; }
interface BudgetRow   { department_id: string; amount: number; }
interface Transaction {
  id: string; tanggal: string; department_id: string; keterangan: string;
  nominal: number; bulan: string; tahun: number; status: string;
  departments?: { name: string; color: string };
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtTanggal = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

const statusLabel = (s: string) =>
  s === 'over' ? 'Over Budget' : s === 'warning' ? 'Mendekati' : 'Normal';

// ── Filter select component ───────────────────────────────────────────────────
function FilterRow({
  bulan, dept, departments, onBulan, onDept,
}: {
  bulan: string; dept: string; departments: Department[];
  onBulan: (v: string) => void; onDept: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Bulan</Label>
        <Select value={bulan} onValueChange={onBulan}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Semua Bulan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Bulan</SelectItem>
            {BULAN_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Departemen</Label>
        <Select value={dept} onValueChange={onDept}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Semua Dept" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Dept</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── PDF HTML generator ───────────────────────────────────────────────────────
function buildPdfHtml(opts: {
  transactions: Transaction[];
  departments: Department[];
  budgetMap: Record<string, number>;
  filterBulan: string;
  filterDept: string;
  deptName: (id: string) => string;
}): string {
  const { transactions, departments, budgetMap, filterBulan, filterDept, deptName } = opts;

  const printDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const logoUrl = `${window.location.origin}/logo-kemika-new.png`;

  // Summary per dept
  const spentMap: Record<string, number> = {};
  transactions.forEach(t => { spentMap[t.department_id] = (spentMap[t.department_id] ?? 0) + t.nominal; });

  const summaryRows = departments
    .filter(d => filterDept === 'all' || d.id === filterDept)
    .map(d => {
      const budget = budgetMap[d.id] ?? 0;
      const spent  = spentMap[d.id] ?? 0;
      const sisa   = budget - spent;
      const pct    = budget > 0 ? ((spent / budget) * 100).toFixed(1) + '%' : '—';
      return { name: d.name, budget, spent, sisa, pct };
    });

  const totalBudget = summaryRows.reduce((s, r) => s + r.budget, 0);
  const totalSpent  = summaryRows.reduce((s, r) => s + r.spent, 0);
  const totalSisa   = totalBudget - totalSpent;

  const summaryHtml = summaryRows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td class="right">${fmtRp(r.budget)}</td>
      <td class="right">${fmtRp(r.spent)}</td>
      <td class="right ${r.sisa < 0 ? 'red' : ''}">${r.sisa >= 0 ? fmtRp(r.sisa) : '−' + fmtRp(Math.abs(r.sisa))}</td>
      <td class="right">${r.pct}</td>
    </tr>`).join('');

  const detailHtml = transactions.map((t, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${fmtTanggal(t.tanggal)}</td>
      <td>${t.departments?.name ?? '—'}</td>
      <td>${t.keterangan}</td>
      <td class="right">${fmtRp(t.nominal)}</td>
      <td class="center">${t.bulan}</td>
      <td class="center">${statusLabel(t.status)}</td>
    </tr>`).join('');

  const filterInfo = [
    filterBulan !== 'all' ? `Bulan: ${filterBulan}` : null,
    filterDept  !== 'all' ? `Dept: ${deptName(filterDept)}` : null,
  ].filter(Boolean).join(' · ') || 'Semua Data';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Audit Cash Out ${TAHUN}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 32px; background: #fff; }
    .header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #185FA5; padding-bottom: 16px; margin-bottom: 20px; }
    .header img { width: 52px; height: 52px; object-fit: contain; }
    .header-text h1 { font-size: 18px; font-weight: 700; color: #185FA5; }
    .header-text p  { font-size: 11px; color: #555; margin-top: 2px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 11px; color: #555; }
    .section-title { font-size: 13px; font-weight: 700; color: #185FA5; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #185FA5; color: white; text-align: left; padding: 7px 10px; font-size: 11px; font-weight: 600; }
    td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) { background: #f8fafc; }
    .right  { text-align: right; }
    .center { text-align: center; }
    .red    { color: #dc2626; }
    .total-row td { background: #f1f5f9; font-weight: 700; border-top: 2px solid #cbd5e1; }
    .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #888; display: flex; justify-content: space-between; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #185FA5; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(24,95,165,0.3); }
    .print-btn:hover { background: #1a6ec7; }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>

  <div class="header">
    <img src="${logoUrl}" alt="Kemika" onerror="this.style.display='none'" />
    <div class="header-text">
      <h1>Laporan Audit Cash Out ${TAHUN}</h1>
      <p>PT. Kemika Karya Pratama · Laporan Pengeluaran per Departemen</p>
    </div>
  </div>

  <div class="meta">
    <span>Filter: ${filterInfo}</span>
    <span>Dicetak: ${printDate}</span>
  </div>

  <div class="section-title">Ringkasan Realisasi vs Budget per Departemen</div>
  <table>
    <thead>
      <tr>
        <th>Departemen</th>
        <th class="right">Budget ${TAHUN}</th>
        <th class="right">Realisasi</th>
        <th class="right">Sisa</th>
        <th class="right">%</th>
      </tr>
    </thead>
    <tbody>
      ${summaryHtml}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="right">${fmtRp(totalBudget)}</td>
        <td class="right">${fmtRp(totalSpent)}</td>
        <td class="right ${totalSisa < 0 ? 'red' : ''}">${totalSisa >= 0 ? fmtRp(totalSisa) : '−' + fmtRp(Math.abs(totalSisa))}</td>
        <td class="right">${totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) + '%' : '—'}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Detail Transaksi (${transactions.length} data)</div>
  ${transactions.length === 0 ? '<p style="color:#888;font-style:italic;margin-bottom:16px">Tidak ada transaksi sesuai filter.</p>' : `
  <table>
    <thead>
      <tr>
        <th class="center" style="width:36px">No</th>
        <th>Tanggal</th>
        <th>Departemen</th>
        <th>Keterangan</th>
        <th class="right">Nominal</th>
        <th class="center">Bulan</th>
        <th class="center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${detailHtml}
      <tr class="total-row">
        <td colspan="4">TOTAL</td>
        <td class="right">${fmtRp(transactions.reduce((s, t) => s + t.nominal, 0))}</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>`}

  <div class="footer">
    <span>PT. Kemika Karya Pratama · Sistem Audit Cash Out ${TAHUN}</span>
    <span>Dokumen ini digenerate otomatis oleh sistem</span>
  </div>
</body>
</html>`;
}

// ─── CSV generator ────────────────────────────────────────────────────────────
function buildCsv(
  transactions: Transaction[],
  departments: Department[],
  budgetMap: Record<string, number>,
  spentByDept: Record<string, number>,
): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

  // Header
  const header = ['Tanggal', 'Departemen', 'Keterangan', 'Nominal', 'Bulan', 'Status'];

  // Data rows
  const dataRows = transactions.map(t => [
    t.tanggal,
    t.departments?.name ?? '',
    esc(t.keterangan),
    t.nominal,
    t.bulan,
    statusLabel(t.status),
  ].join(','));

  // Blank separator
  const sep = ['', '', '', '', '', ''];

  // Summary section
  const summaryHeader = ['', '', '--- SUMMARY PER DEPARTEMEN ---', '', '', ''];
  const summaryColHeader = ['Departemen', 'Budget (Rp)', 'Realisasi (Rp)', 'Sisa (Rp)', '% Utilisasi', ''];

  const summaryRows = departments.map(d => {
    const budget = budgetMap[d.id] ?? 0;
    const spent  = spentByDept[d.id] ?? 0;
    const sisa   = budget - spent;
    const pct    = budget > 0 ? ((spent / budget) * 100).toFixed(1) + '%' : '—';
    return [esc(d.name), budget, spent, sisa, pct, ''].join(',');
  });

  const totalBudget = departments.reduce((s, d) => s + (budgetMap[d.id] ?? 0), 0);
  const totalSpent  = departments.reduce((s, d) => s + (spentByDept[d.id] ?? 0), 0);
  const totalSisa   = totalBudget - totalSpent;
  const totalPct    = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) + '%' : '—';
  const totalRow    = [esc('TOTAL'), totalBudget, totalSpent, totalSisa, totalPct, ''].join(',');

  const lines = [
    header.join(','),
    ...dataRows,
    sep.join(','),
    summaryHeader.join(','),
    summaryColHeader.join(','),
    ...summaryRows,
    totalRow,
  ];

  return '﻿' + lines.join('\r\n'); // BOM for Excel compatibility
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditExportPage() {
  const { toast } = useToast();

  // PDF filter state
  const [pdfBulan, setPdfBulan] = useState('all');
  const [pdfDept,  setPdfDept]  = useState('all');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Excel filter state
  const [xlBulan, setXlBulan] = useState('all');
  const [xlDept,  setXlDept]  = useState('all');
  const [xlLoading, setXlLoading] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: departments = [] } = useQuery<Department[]>({
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

  const { data: allTransactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['audit-transactions', TAHUN],
    queryFn: async () => {
      const { data, error } = await db
        .from('cash_out_transactions')
        .select('*, departments(name, color)')
        .eq('tahun', TAHUN)
        .order('tanggal', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const budgetMap = useMemo(
    () => Object.fromEntries(budgets.map(b => [b.department_id, b.amount])),
    [budgets],
  );

  const deptName = (id: string) => departments.find(d => d.id === id)?.name ?? id;

  const filterTx = (bulan: string, dept: string) =>
    allTransactions.filter(t =>
      (bulan === 'all' || t.bulan === bulan) &&
      (dept  === 'all' || t.department_id === dept)
    );

  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {};
    allTransactions.forEach(t => { m[t.department_id] = (m[t.department_id] ?? 0) + t.nominal; });
    return m;
  }, [allTransactions]);

  const pdfTx = useMemo(() => filterTx(pdfBulan, pdfDept), [allTransactions, pdfBulan, pdfDept]);
  const xlTx  = useMemo(() => filterTx(xlBulan,  xlDept),  [allTransactions, xlBulan,  xlDept]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePdf = () => {
    setPdfLoading(true);
    try {
      const html = buildPdfHtml({ transactions: pdfTx, departments, budgetMap, filterBulan: pdfBulan, filterDept: pdfDept, deptName });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) toast({ title: 'Pop-up diblokir', description: 'Izinkan pop-up untuk tab ini', variant: 'destructive' });
      // cleanup after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({ title: 'Gagal generate PDF', description: e.message, variant: 'destructive' });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExcel = async () => {
    if (!xlTx.length) {
      toast({ title: 'Tidak ada data', description: 'Filter tidak menghasilkan data transaksi', variant: 'destructive' });
      return;
    }
    setXlLoading(true);
    try {
      // For Excel export, we use global spentByDept (all transactions) for summary
      const csv  = buildCsv(xlTx, departments, budgetMap, spentByDept);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const bulanPart = xlBulan !== 'all' ? xlBulan : 'Semua';
      const deptPart  = xlDept  !== 'all' ? deptName(xlDept).replace(/\s/g, '') : 'SemuaDept';
      a.href     = url;
      a.download = `AuditCashOut_${bulanPart}_${deptPart}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Berhasil', description: `${xlTx.length} transaksi diekspor ke CSV` });
    } catch (e: any) {
      toast({ title: 'Gagal export', description: e.message, variant: 'destructive' });
    } finally {
      setXlLoading(false);
    }
  };

  // ── Data summary for preview ──────────────────────────────────────────────
  const pdfTotal = pdfTx.reduce((s, t) => s + t.nominal, 0);
  const xlTotal  = xlTx.reduce((s, t)  => s + t.nominal, 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Export Laporan</h1>
        <p className="text-sm text-muted-foreground">
          Download laporan Audit Cash Out {TAHUN} dalam format PDF atau CSV/Excel
        </p>
      </div>

      {/* Two cards side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Card 1: PDF ─────────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <CardTitle className="text-base">Export PDF</CardTitle>
                <CardDescription className="text-xs">Laporan print-friendly dengan summary & detail</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 flex-1">
            <FilterRow
              bulan={pdfBulan} dept={pdfDept}
              departments={departments}
              onBulan={setPdfBulan} onDept={setPdfDept}
            />

            {/* Data preview */}
            <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaksi</span>
                <span className="font-semibold">{isLoading ? '…' : pdfTx.length} data</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total nominal</span>
                <span className="font-semibold">{isLoading ? '…' : fmtRp(pdfTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Periode</span>
                <span className="font-medium text-xs">{pdfBulan === 'all' ? 'Semua bulan' : pdfBulan} · {pdfDept === 'all' ? 'Semua dept' : deptName(pdfDept)}</span>
              </div>
            </div>

            <div className="space-y-2 mt-auto">
              <p className="text-xs text-muted-foreground">
                Laporan akan dibuka di tab baru. Klik tombol "Print / Save PDF" di halaman tersebut untuk menyimpan.
              </p>
              <Button
                onClick={handlePdf}
                disabled={pdfLoading || isLoading}
                className="w-full gap-2"
                variant="default"
              >
                {pdfLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Eye className="w-4 h-4" />
                }
                Preview & Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 2: Excel / CSV ──────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-base">Export Excel / CSV</CardTitle>
                <CardDescription className="text-xs">File CSV siap dibuka di Excel atau Google Sheets</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 flex-1">
            <FilterRow
              bulan={xlBulan} dept={xlDept}
              departments={departments}
              onBulan={setXlBulan} onDept={setXlDept}
            />

            {/* Data preview */}
            <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaksi</span>
                <span className="font-semibold">{isLoading ? '…' : xlTx.length} baris</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total nominal</span>
                <span className="font-semibold">{isLoading ? '…' : fmtRp(xlTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nama file</span>
                <span className="font-mono text-xs">
                  AuditCashOut_{xlBulan !== 'all' ? xlBulan : 'Semua'}_{xlDept !== 'all' ? deptName(xlDept).replace(/\s/g, '') : 'SemuaDept'}.csv
                </span>
              </div>
            </div>

            {/* Columns info */}
            <div className="rounded-lg border border-dashed px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Kolom yang diekspor:</p>
              <div className="flex flex-wrap gap-1.5">
                {['Tanggal', 'Departemen', 'Keterangan', 'Nominal', 'Bulan', 'Status'].map(col => (
                  <span key={col} className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{col}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">+ Section summary per departemen di bagian bawah file</p>
            </div>

            <Button
              onClick={handleExcel}
              disabled={xlLoading || isLoading || xlTx.length === 0}
              className="w-full gap-2 mt-auto bg-green-600 hover:bg-green-700 text-white"
            >
              {xlLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />
              }
              Download Excel / CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick preview table */}
      {allTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Preview Data Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {['Tanggal', 'Departemen', 'Keterangan', 'Nominal', 'Status'].map(h => (
                      <th key={h} className="text-left py-2 pr-4 font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTransactions.slice(0, 8).map(tx => (
                    <tr key={tx.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{tx.tanggal}</td>
                      <td className="py-2 pr-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: tx.departments?.color ?? '#888' }}
                        >
                          {tx.departments?.name ?? '—'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 max-w-[180px] truncate">{tx.keterangan}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-right font-medium">{fmtRp(tx.nominal)}</td>
                      <td className="py-2">{statusLabel(tx.status)}</td>
                    </tr>
                  ))}
                  {allTransactions.length > 8 && (
                    <tr>
                      <td colSpan={5} className="py-2 text-center text-muted-foreground">
                        … dan {allTransactions.length - 8} data lainnya
                      </td>
                    </tr>
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
