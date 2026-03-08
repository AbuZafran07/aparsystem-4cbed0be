import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Download, Upload, Database, Loader2, CheckCircle, AlertCircle,
  FileJson, FileSpreadsheet, Cloud, Clock, Trash2, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface BackupCategory {
  key: string;
  label: string;
  tables: string[];
}

const BACKUP_CATEGORIES: BackupCategory[] = [
  { key: 'master', label: 'Master Data', tables: ['vendors', 'customers', 'sales', 'payment_terms', 'bank_accounts', 'company_profile'] },
  { key: 'ar', label: 'AR Invoices & Receipts', tables: ['ar_invoices', 'ar_receipts', 'ar_receipt_allocations'] },
  { key: 'ap', label: 'AP Invoices & Payments', tables: ['ap_invoices', 'ap_payments', 'ap_payment_allocations'] },
  { key: 'billing', label: 'Billing & Email', tables: ['billing_letters', 'billing_letter_comments', 'billing_email_logs', 'payment_requests'] },
  { key: 'system', label: 'Sistem & Audit', tables: ['profiles', 'user_roles', 'audit_logs', 'notifications', 'attachments', 'invoice_comments', 'import_batches', 'import_row_errors'] },
];

interface BackupLog {
  id: string;
  backup_type: string;
  file_path: string | null;
  file_size: number;
  table_counts: Record<string, number> | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function BackupRestorePage() {
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(BACKUP_CATEGORIES.map(c => c.key));
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreResult, setRestoreResult] = useState<any>(null);
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const callEdgeFunction = useCallback(async (action: string, options?: { method?: string; body?: any; params?: Record<string, string> }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sesi tidak valid');

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const params = new URLSearchParams({ action, ...options?.params });
    const url = `https://${projectId}.supabase.co/functions/v1/backup-restore?${params}`;

    const response = await fetch(url, {
      method: options?.method || 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Request gagal');
    }
    return response.json();
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await callEdgeFunction('backup-history');
      setBackupLogs(data.logs || []);
    } catch {
      // silent
    } finally {
      setLogsLoading(false);
    }
  }, [callEdgeFunction]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const toggleCategory = (key: string) => {
    setSelectedCategories(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const getSelectedTables = (): string[] =>
    BACKUP_CATEGORIES.filter(c => selectedCategories.includes(c.key)).flatMap(c => c.tables);

  const downloadBackup = async (format: 'json' | 'excel') => {
    setBackupLoading(true);
    try {
      const tables = getSelectedTables();
      if (tables.length === 0) {
        toast({ title: 'Pilih minimal satu kategori data', variant: 'destructive' });
        return;
      }

      const backupData = await callEdgeFunction('backup', { params: { tables: tables.join(',') } });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `backup-apar-hub-${timestamp}.json`);
      } else {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        for (const [tableName, rows] of Object.entries(backupData.tables)) {
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const sheet = workbook.addWorksheet(tableName.substring(0, 31));
          const headers = Object.keys(rows[0]);
          sheet.addRow(headers);
          sheet.getRow(1).font = { bold: true };
          for (const row of rows) {
            sheet.addRow(headers.map(h => {
              const val = (row as any)[h];
              return typeof val === 'object' ? JSON.stringify(val) : val;
            }));
          }
          headers.forEach((_, idx) => { sheet.getColumn(idx + 1).width = 20; });
        }
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        triggerDownload(blob, `backup-apar-hub-${timestamp}.xlsx`);
      }

      toast({ title: 'Backup berhasil diunduh!' });
    } catch (error: any) {
      toast({ title: 'Backup gagal', description: error.message, variant: 'destructive' });
    } finally {
      setBackupLoading(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCloudBackup = async (log: BackupLog) => {
    if (!log.file_path) return;
    setDownloadingId(log.id);
    try {
      const data = await callEdgeFunction('download-backup', { params: { path: log.file_path } });
      window.open(data.url, '_blank');
    } catch (error: any) {
      toast({ title: 'Download gagal', description: error.message, variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteBackup = async (log: BackupLog) => {
    if (!confirm('Hapus backup ini?')) return;
    setDeletingId(log.id);
    try {
      await callEdgeFunction('delete-backup', {
        method: 'POST',
        body: { id: log.id, file_path: log.file_path },
      });
      toast({ title: 'Backup dihapus' });
      fetchLogs();
    } catch (error: any) {
      toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast({ title: 'Pilih file backup terlebih dahulu', variant: 'destructive' });
      return;
    }
    if (!restoreFile.name.endsWith('.json')) {
      toast({ title: 'Hanya file JSON yang didukung untuk restore', variant: 'destructive' });
      return;
    }
    if (!window.confirm('⚠️ PERHATIAN: Proses restore akan menimpa data yang sudah ada. Pastikan Anda sudah membuat backup terlebih dahulu. Lanjutkan?')) return;

    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const text = await restoreFile.text();
      const backupData = JSON.parse(text);
      if (!backupData.tables || !backupData.version) throw new Error('Format file backup tidak valid');
      const result = await callEdgeFunction('restore', { method: 'POST', body: { tables: backupData.tables } });
      setRestoreResult(result.results);
      toast({ title: 'Restore selesai!' });
    } catch (error: any) {
      toast({ title: 'Restore gagal', description: error.message, variant: 'destructive' });
    } finally {
      setRestoreLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const autoLogs = backupLogs.filter(l => l.backup_type === 'auto');
  const lastAutoBackup = autoLogs.length > 0 ? autoLogs[0] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-6 h-6" />
          Backup & Restore Data
        </h1>
        <p className="text-muted-foreground mt-1">
          Backup dan restore seluruh data sistem ke file lokal atau cloud storage
        </p>
      </div>

      {/* Auto Backup Cloud */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Cloud className="w-5 h-5" />
            Auto Backup Cloud
            <Badge variant="default" className="text-xs">Aktif</Badge>
          </CardTitle>
          <CardDescription>
            Backup otomatis berjalan setiap minggu dan menyimpan 4 backup terakhir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastAutoBackup ? (
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Backup terakhir:</span>
              <span className="font-medium text-foreground">
                {format(new Date(lastAutoBackup.created_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })}
              </span>
              <Badge variant={lastAutoBackup.status === 'SUCCESS' ? 'default' : 'destructive'} className="text-xs">
                {lastAutoBackup.status}
              </Badge>
              {lastAutoBackup.file_size > 0 && (
                <span className="text-muted-foreground">({formatSize(lastAutoBackup.file_size)})</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada backup otomatis. Backup pertama akan dibuat pada jadwal berikutnya.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Backup Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Backup Manual
          </CardTitle>
          <CardDescription>Ekspor data ke file JSON atau Excel untuk backup lokal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-medium text-foreground">Pilih data yang akan di-backup:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {BACKUP_CATEGORIES.map(cat => (
              <label key={cat.key} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors">
                <Checkbox checked={selectedCategories.includes(cat.key)} onCheckedChange={() => toggleCategory(cat.key)} />
                <div>
                  <span className="text-sm font-medium text-foreground">{cat.label}</span>
                  <p className="text-xs text-muted-foreground">{cat.tables.length} tabel</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={() => downloadBackup('json')} disabled={backupLoading || selectedCategories.length === 0}>
              {backupLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileJson className="w-4 h-4 mr-2" />}
              Download JSON
            </Button>
            <Button variant="outline" onClick={() => downloadBackup('excel')} disabled={backupLoading || selectedCategories.length === 0}>
              {backupLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
              Download Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Riwayat Backup Cloud
          </CardTitle>
          <CardDescription>Daftar backup yang tersimpan di cloud storage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={logsLoading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${logsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Memuat...
            </div>
          ) : backupLogs.filter(l => l.file_path).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada backup cloud</p>
          ) : (
            <div className="space-y-2">
              {backupLogs.filter(l => l.file_path).map(log => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <FileJson className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={log.backup_type === 'auto' ? 'secondary' : 'outline'} className="text-xs">
                          {log.backup_type === 'auto' ? 'Otomatis' : 'Manual'}
                        </Badge>
                        <span>{formatSize(log.file_size)}</span>
                        {log.table_counts && (
                          <span>
                            {Object.values(log.table_counts).reduce((a: number, b: number) => a + b, 0)} baris
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleDownloadCloudBackup(log)}
                      disabled={downloadingId === log.id}
                    >
                      {downloadingId === log.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleDeleteBackup(log)}
                      disabled={deletingId === log.id}
                    >
                      {deletingId === log.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Restore Data
          </CardTitle>
          <CardDescription>Impor data dari file backup JSON. Data yang sudah ada akan di-update (upsert).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Pilih file backup</p>
            <Input type="file" accept=".json" onChange={e => setRestoreFile(e.target.files?.[0] || null)} className="max-w-md" />
          </div>
          {restoreFile && (
            <div className="text-sm text-muted-foreground">
              File: <strong>{restoreFile.name}</strong> ({(restoreFile.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
          <Button variant="destructive" onClick={handleRestore} disabled={restoreLoading || !restoreFile}>
            {restoreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Restore Data
          </Button>

          {restoreResult && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Hasil Restore:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(restoreResult).map(([table, result]: [string, any]) => (
                  <div key={table} className="flex items-center justify-between p-2 rounded border border-border text-sm">
                    <span className="font-mono text-xs">{table}</span>
                    <div className="flex items-center gap-2">
                      {result.success > 0 && (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />{result.success}
                        </Badge>
                      )}
                      {result.failed > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="w-3 h-3 mr-1" />{result.failed}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
