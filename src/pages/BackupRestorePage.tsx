import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Download, Upload, Database, Loader2, CheckCircle, AlertCircle, FileJson, FileSpreadsheet } from 'lucide-react';

interface BackupCategory {
  key: string;
  label: string;
  tables: string[];
}

const BACKUP_CATEGORIES: BackupCategory[] = [
  {
    key: 'master',
    label: 'Master Data',
    tables: ['vendors', 'customers', 'sales', 'payment_terms', 'bank_accounts', 'company_profile'],
  },
  {
    key: 'ar',
    label: 'AR Invoices & Receipts',
    tables: ['ar_invoices', 'ar_receipts', 'ar_receipt_allocations'],
  },
  {
    key: 'ap',
    label: 'AP Invoices & Payments',
    tables: ['ap_invoices', 'ap_payments', 'ap_payment_allocations'],
  },
  {
    key: 'billing',
    label: 'Billing & Email',
    tables: ['billing_letters', 'billing_letter_comments', 'billing_email_logs', 'payment_requests'],
  },
  {
    key: 'system',
    label: 'Sistem & Audit',
    tables: ['profiles', 'user_roles', 'audit_logs', 'notifications', 'attachments', 'invoice_comments', 'import_batches', 'import_row_errors'],
  },
];

export default function BackupRestorePage() {
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    BACKUP_CATEGORIES.map(c => c.key)
  );
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreResult, setRestoreResult] = useState<any>(null);

  const toggleCategory = (key: string) => {
    setSelectedCategories(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const getSelectedTables = (): string[] => {
    return BACKUP_CATEGORIES
      .filter(c => selectedCategories.includes(c.key))
      .flatMap(c => c.tables);
  };

  const downloadBackup = async (format: 'json' | 'excel') => {
    setBackupLoading(true);
    try {
      const tables = getSelectedTables();
      if (tables.length === 0) {
        toast({ title: 'Pilih minimal satu kategori data', variant: 'destructive' });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Sesi tidak valid, silakan login ulang', variant: 'destructive' });
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/backup-restore?action=backup&tables=${tables.join(',')}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Backup gagal');
      }

      const backupData = await response.json();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        downloadFile(blob, `backup-apar-hub-${timestamp}.json`);
      } else {
        // Excel format using simple CSV-like approach per table
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
          headers.forEach((_, idx) => {
            sheet.getColumn(idx + 1).width = 20;
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadFile(blob, `backup-apar-hub-${timestamp}.xlsx`);
      }

      toast({ title: 'Backup berhasil diunduh!' });
    } catch (error: any) {
      toast({ title: 'Backup gagal', description: error.message, variant: 'destructive' });
    } finally {
      setBackupLoading(false);
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

    const confirmRestore = window.confirm(
      '⚠️ PERHATIAN: Proses restore akan menimpa data yang sudah ada. Pastikan Anda sudah membuat backup terlebih dahulu. Lanjutkan?'
    );
    if (!confirmRestore) return;

    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const text = await restoreFile.text();
      const backupData = JSON.parse(text);

      if (!backupData.tables || !backupData.version) {
        throw new Error('Format file backup tidak valid');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Sesi tidak valid', variant: 'destructive' });
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/backup-restore?action=restore`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tables: backupData.tables }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Restore gagal');
      }

      const result = await response.json();
      setRestoreResult(result.results);
      toast({ title: 'Restore selesai!' });
    } catch (error: any) {
      toast({ title: 'Restore gagal', description: error.message, variant: 'destructive' });
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-6 h-6" />
          Backup & Restore Data
        </h1>
        <p className="text-muted-foreground mt-1">
          Backup dan restore seluruh data sistem ke file lokal
        </p>
      </div>

      {/* Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Backup Manual
          </CardTitle>
          <CardDescription>
            Ekspor data ke file JSON atau Excel untuk backup lokal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-medium text-foreground">Pilih data yang akan di-backup:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {BACKUP_CATEGORIES.map(cat => (
              <label
                key={cat.key}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selectedCategories.includes(cat.key)}
                  onCheckedChange={() => toggleCategory(cat.key)}
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{cat.label}</span>
                  <p className="text-xs text-muted-foreground">{cat.tables.length} tabel</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={() => downloadBackup('json')}
              disabled={backupLoading || selectedCategories.length === 0}
            >
              {backupLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="w-4 h-4 mr-2" />
              )}
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadBackup('excel')}
              disabled={backupLoading || selectedCategories.length === 0}
            >
              {backupLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" />
              )}
              Download Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Restore Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Restore Data
          </CardTitle>
          <CardDescription>
            Impor data dari file backup JSON. Data yang sudah ada akan di-update (upsert).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Pilih file backup</p>
            <Input
              type="file"
              accept=".json"
              onChange={e => setRestoreFile(e.target.files?.[0] || null)}
              className="max-w-md"
            />
          </div>

          {restoreFile && (
            <div className="text-sm text-muted-foreground">
              File: <strong>{restoreFile.name}</strong> ({(restoreFile.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}

          <Button
            variant="destructive"
            onClick={handleRestore}
            disabled={restoreLoading || !restoreFile}
          >
            {restoreLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Restore Data
          </Button>

          {restoreResult && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Hasil Restore:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(restoreResult).map(([table, result]: [string, any]) => (
                  <div
                    key={table}
                    className="flex items-center justify-between p-2 rounded border border-border text-sm"
                  >
                    <span className="font-mono text-xs">{table}</span>
                    <div className="flex items-center gap-2">
                      {result.success > 0 && (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {result.success}
                        </Badge>
                      )}
                      {result.failed > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {result.failed}
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
